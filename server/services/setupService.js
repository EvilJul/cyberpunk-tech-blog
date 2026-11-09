import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import db from '../db/index.js'
import {
  hashToken,
  validateCredentials,
  authError,
  publicUser
} from './sessionService.js'

/** 查询站点是否仍需初始化。 */
export const setupStatus = () => ({
  needsSetup: !db.prepare('SELECT 1 FROM users LIMIT 1').get()
})
/** 生成统一的初始化拒绝错误。 */
const denied = () =>
  authError('初始化凭据无效或站点已初始化', 403, 'SETUP_DENIED')
/** 生成具有期限的一次性初始化凭据。 */
export function createSetupToken(now = Date.now()) {
  const token = randomBytes(32).toString('hex')
  db.transaction(/* 原子废弃旧凭据并登记新摘要。 */ () => {
    if (!setupStatus().needsSetup) throw denied()
    db.prepare('DELETE FROM setup_tokens').run()
    db.prepare(
      'INSERT INTO setup_tokens(token_hash,created_at,expires_at) VALUES(?,?,?)'
    ).run(hashToken(token), now, now + 30 * 60 * 1000)
  }).immediate()
  return token
}
/** 校验首用户状态及本地初始化证明。 */
function assertSetupAllowed(token, trustedLocal, now = Date.now()) {
  if (!setupStatus().needsSetup) throw denied()
  if (
    !trustedLocal &&
    (typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !db
        .prepare(
          'SELECT 1 FROM setup_tokens WHERE token_hash=? AND expires_at>? AND consumed_at IS NULL'
        )
        .get(hashToken(token), now))
  )
    throw denied()
}
// Trusted local CLI and browser share this transaction; only CLI may omit proof.
/** 共用首用户初始化流程，仅可信本地入口可省略凭据。 */
async function initialize({ username, password, token }, trustedLocal) {
  // Reject anonymous invalid proofs before spending CPU on bcrypt.
  assertSetupAllowed(token, trustedLocal)
  validateCredentials(username, password)
  const passwordHash = await bcrypt.hash(password, 10)
  return db
    .transaction(/* 在写锁内复核凭据并原子创建管理员及消费令牌。 */ () => {
      const now = Date.now()
      assertSetupAllowed(token, trustedLocal, now)
      const user = {
        id: randomUUID(),
        username: username.trim(),
        role: 'admin'
      }
      db.prepare(
        'INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?)'
      ).run(user.id, user.username, passwordHash, user.role, now, now)
      db.prepare(
        'UPDATE setup_tokens SET consumed_at=? WHERE consumed_at IS NULL'
      ).run(now)
      return publicUser(user)
    })
    .immediate()
}
/** 使用一次性凭据完成浏览器初始化。 */
export const completeSetup = (input) => initialize(input, false)
/** 从可信本地入口初始化管理员。 */
export const initializeLocalAdmin = (input) => initialize(input, true)
