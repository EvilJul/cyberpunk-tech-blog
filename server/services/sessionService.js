import { randomBytes, createHash, createHmac } from 'node:crypto'
import bcrypt from 'bcrypt'
import db from '../db/index.js'

export const SESSION_COOKIE = 'blog_session'
export const IDLE_MS = 12 * 60 * 60 * 1000
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000
/** 计算会话令牌摘要。 */
export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex')
/** 提取可返回给浏览器的用户字段。 */
export const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  role: user.role
})
/** 构造认证相关的统一错误。 */
export function authError(message, status = 400, code = 'INVALID_INPUT') {
  return Object.assign(new Error(message), { status, code })
}
/** 校验用户名和密码长度约束。 */
export function validateCredentials(username, password) {
  if (
    typeof username !== 'string' ||
    !username.trim() ||
    username.trim().length > 100 ||
    typeof password !== 'string' ||
    password.length < 6 ||
    Buffer.byteLength(password) > 72
  ) {
    throw authError('用户名需为1–100字符，密码需至少6字符且不超过72字节')
  }
}
/** 生成适配部署前缀的安全Cookie配置。 */
export function cookieOptions() {
  const prefix = (process.env.VITE_BASE_PATH || '/').replace(/^\/+|\/+$/g, '')
  const secureOverride = process.env.SESSION_COOKIE_SECURE
  const secure =
    secureOverride === 'true'
      ? true
      : secureOverride === 'false'
        ? false
        : process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: prefix ? `/${prefix}/` : '/'
  }
}
/** 解析并校验唯一的会话Cookie。 */
export function readSessionToken(req) {
  const cookies = (req.headers.cookie || '')
    .split(';')
    .map(/* 去除Cookie片段两侧空白。 */ (s) => s.trim())
    .filter(/* 筛选会话Cookie片段。 */ (s) => s.startsWith(`${SESSION_COOKIE}=`))
  // undefined means absent; null means supplied but malformed/ambiguous.
  if (cookies.length === 0) return undefined
  if (cookies.length !== 1) return null
  const token = cookies[0].slice(SESSION_COOKIE.length + 1)
  return /^[a-f0-9]{64}$/.test(token) ? token : null
}
/** 从会话令牌派生CSRF校验值。 */
export function csrfForToken(token) {
  return createHmac('sha256', token)
    .update('blog-session-csrf-v1')
    .digest('hex')
}
/** 创建随机会话并撤销旧会话。 */
export function createSession(userId, oldToken, now = Date.now()) {
  const token = randomBytes(32).toString('hex')
  db.transaction(/* 原子清理失效会话并创建新会话。 */ () => {
    // Bounded retention: remove expired and revoked records on login.
    db.prepare(
      'DELETE FROM sessions WHERE expires_at <= ? OR last_used_at <= ? OR revoked_at IS NOT NULL'
    ).run(now, now - IDLE_MS)
    if (oldToken) revokeSession(oldToken, now)
    db.prepare(
      'INSERT INTO sessions(token_hash,user_id,created_at,last_used_at,expires_at) VALUES(?,?,?,?,?)'
    ).run(hashToken(token), userId, now, now, now + ABSOLUTE_MS)
  }).immediate()
  return { token, csrfToken: csrfForToken(token) }
}
/** 复核会话期限及用户角色并刷新活动时间。 */
export function resolveSession(token, now = Date.now()) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT s.*, u.username, u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? AND last_used_at>?`
    )
    .get(hashToken(token), now, now - IDLE_MS)
  if (!row || !['admin', 'user'].includes(row.role)) return null
  db.prepare('UPDATE sessions SET last_used_at=? WHERE token_hash=?').run(
    now,
    row.token_hash
  )
  return {
    user: { id: row.user_id, username: row.username, role: row.role },
    csrfToken: csrfForToken(token),
    tokenHash: row.token_hash
  }
}
/** 按令牌摘要撤销会话。 */
export function revokeSession(token, now = Date.now()) {
  db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').run(
    now,
    hashToken(token)
  )
}
/** 验证旧密码并更新密码及撤销全部会话。 */
export async function changePassword(userId, oldPassword, newPassword) {
  validateCredentials('password', newPassword)
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId)
  if (
    !user ||
    typeof oldPassword !== 'string' ||
    Buffer.byteLength(oldPassword) > 72 ||
    !(await bcrypt.compare(oldPassword, user.password_hash))
  ) {
    throw authError('旧密码错误', 403, 'INVALID_PASSWORD')
  }
  const hash = await bcrypt.hash(newPassword, 10)
  db.transaction(/* 以旧密码哈希为条件原子改密和撤销会话。 */ () => {
    const result = db
      .prepare(
        'UPDATE users SET password_hash=?,token_version=token_version+1,updated_at=? WHERE id=? AND password_hash=?'
      )
      .run(hash, Date.now(), userId, user.password_hash)
    if (!result.changes)
      throw authError('密码已变化，请重新登录', 409, 'PASSWORD_CHANGED')
    db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=?').run(
      Date.now(),
      userId
    )
  }).immediate()
}
