import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual
} from 'node:crypto'
import db from '../db/index.js'
// 该主体仅承载工作台媒体外键，永远不能作为机器权限主体。
export const studioMediaOwner = '__studio_media__'
export const SCOPES = [
  'articles:read',
  'articles:write',
  'articles:publish',
  'media:write'
]
/** 抛出统一集成接口错误。 */
export function fail(status, code, message = '请求无法完成') {
  throw Object.assign(new Error(message), { status, statusCode: status, code })
}
/** 读取发布接口启用开关。 */
export const enabled = () => process.env.PUBLISHING_API_ENABLED === 'true'
/** 计算凭据或指纹的摘要。 */
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex')
/** 记录脱敏集成操作审计。 */
export function audit(
  actor,
  operation,
  result,
  requestId,
  resourceId = null,
  revision = null,
  source = null
) {
  db.prepare(
    'INSERT INTO integration_audit(integration_id,key_id,operation,resource_id,result,revision,request_id,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(
    actor?.integrationId || null,
    actor?.keyId || null,
    operation,
    resourceId,
    result,
    revision,
    requestId,
    source ? digest(source).slice(0, 16) : null,
    Date.now()
  )
}
/** 复核集成凭据及归属，始终拒绝内部工作台主体。 */
export function verifyActor(actor, scope, articleId = null) {
  const row = db
    .prepare(
      'SELECT k.*,i.enabled FROM integration_keys k JOIN integrations i ON i.id=k.integration_id WHERE k.key_id=? AND k.integration_id=?'
    )
    .get(actor?.keyId || '', actor?.integrationId || '')
  if (
    actor?.integrationId === studioMediaOwner ||
    !enabled() ||
    !row ||
    !row.enabled ||
    row.revoked_at ||
    row.expires_at <= Date.now()
  )
    fail(401, 'INVALID_CREDENTIALS', '凭据无效或已过期')
  if (scope && !JSON.parse(row.scopes).includes(scope))
    fail(403, 'INSUFFICIENT_SCOPE', '密钥权限不足')
  if (
    articleId &&
    !db
      .prepare(
        'SELECT 1 FROM article_sources WHERE article_id=? AND integration_id=? AND tombstone=0'
      )
      .get(articleId, actor.integrationId)
  )
    fail(404, 'NOT_FOUND', '文章不存在')
  return row
}
/** 将共享文章操作映射为集成权限检查。 */
export function integrationPolicy(actor, id, action) {
  if (action === 'delete') fail(403, 'INSUFFICIENT_SCOPE', '集成不能删除文章')
  if (action === 'read' && actor.publishingAction)
    action = ['publish', 'unpublish'].includes(actor.publishingAction)
      ? 'publish'
      : 'write'
  if (!['read', 'write', 'publish'].includes(action))
    fail(403, 'INSUFFICIENT_SCOPE', '集成无此操作权限')
  return verifyActor(
    actor,
    {
      read: 'articles:read',
      write: 'articles:write',
      publish: 'articles:publish'
    }[action],
    id
  )
}
/** 验证集成密钥并构造受限主体。 */
export function authenticate(header) {
  const match = /^Bearer bpk_([a-f0-9-]+)\.([A-Za-z0-9_-]+)$/.exec(header || '')
  if (!match) fail(401, 'INVALID_CREDENTIALS', '需要有效集成密钥')
  const row = db
    .prepare('SELECT * FROM integration_keys WHERE key_id=?')
    .get(match[1])
  const actual = Buffer.from(digest(match[2]), 'hex'),
    expected = Buffer.from(row?.secret_hash || '0'.repeat(64), 'hex')
  if (!timingSafeEqual(actual, expected) || !row)
    fail(401, 'INVALID_CREDENTIALS', '凭据无效')
  const actor = {
    kind: 'integration',
    integrationId: row.integration_id,
    keyId: row.key_id,
    scopes: JSON.parse(row.scopes)
  }
  verifyActor(actor)
  db.prepare('UPDATE integration_keys SET last_used_at=? WHERE key_id=?').run(
    Date.now(),
    row.key_id
  )
  return actor
}
/** 校验名称并创建集成。 */
export function createIntegration(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).some(/* 拒绝名称以外的集成字段。 */ (k) => k !== 'name')
  )
    fail(422, 'INVALID_FIELDS', '集成字段无效')
  if (
    typeof payload.name !== 'string' ||
    !payload.name.trim() ||
    [...payload.name.trim()].length > 80
  )
    fail(422, 'INVALID_FIELDS', '名称须为1至80字')
  const row = {
    id: randomUUID(),
    name: payload.name.trim(),
    enabled: 1,
    created_at: Date.now()
  }
  db.prepare(
    'INSERT INTO integrations(id,name,enabled,created_at) VALUES(@id,@name,@enabled,@created_at)'
  ).run(row)
  return row
}
/** 为外部集成创建仅返回一次明文的密钥，拒绝内部主体。 */
export function createKey(integrationId, payload = {}) {
  if (integrationId === studioMediaOwner) fail(404, 'NOT_FOUND')
  if (!enabled()) fail(404, 'NOT_FOUND', '发布集成尚未启用')
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).some(/* 识别密钥创建请求中的未知字段。 */ (k) => !['scopes', 'expires_in_days'].includes(k))
  )
    fail(422, 'INVALID_FIELDS', '密钥字段无效')
  if (!db.prepare('SELECT 1 FROM integrations WHERE id=?').get(integrationId))
    fail(404, 'NOT_FOUND')
  const scopes = payload.scopes === undefined ? [] : payload.scopes,
    days = payload.expires_in_days === undefined ? 90 : payload.expires_in_days
  if (
    !Array.isArray(scopes) ||
    scopes.some(/* 检查权限是否超出白名单。 */ (s) => !SCOPES.includes(s)) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  )
    fail(422, 'INVALID_FIELDS', '权限或有效期无效')
  const secret = randomBytes(32).toString('base64url'),
    keyId = randomUUID(),
    expires = Date.now() + days * 86400000
  db.prepare(
    'INSERT INTO integration_keys(key_id,integration_id,secret_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?)'
  ).run(
    keyId,
    integrationId,
    digest(secret),
    JSON.stringify([...new Set(scopes)]),
    expires,
    Date.now()
  )
  return {
    key_id: keyId,
    integration_id: integrationId,
    scopes: [...new Set(scopes)],
    expires_at: expires,
    key: `bpk_${keyId}.${secret}`
  }
}
/** 限权轮换密钥并控制重叠时间。 */
export function rotateKey(integrationId, keyId, payload = {}) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).some(
      /* 识别轮换请求中的未知字段。 */ (k) => !['scopes', 'expires_in_days', 'overlap_hours'].includes(k)
    )
  )
    fail(422, 'INVALID_FIELDS', '轮换字段无效')
  return db.transaction(/* 原子创建新密钥并更新旧密钥有效期。 */ () => {
    const old = db
      .prepare(
        'SELECT * FROM integration_keys WHERE key_id=? AND integration_id=?'
      )
      .get(keyId, integrationId)
    if (!old || old.revoked_at || old.expires_at <= Date.now())
      fail(404, 'NOT_FOUND')
    const scopes = payload.scopes ?? JSON.parse(old.scopes),
      overlap = payload.overlap_hours ?? 0
    if (
      !Array.isArray(scopes) ||
      scopes.some(/* 检查轮换权限是否超出旧密钥。 */ (s) => !JSON.parse(old.scopes).includes(s)) ||
      typeof overlap !== 'number' ||
      overlap < 0 ||
      overlap > 24
    )
      fail(422, 'INVALID_FIELDS', '轮换不能扩大权限，重叠至多24小时')
    const next = createKey(integrationId, {
      scopes,
      ...(payload.expires_in_days !== undefined
        ? { expires_in_days: payload.expires_in_days }
        : {})
    })
    db.prepare(
      'UPDATE integration_keys SET revoked_at=?,expires_at=? WHERE key_id=?'
    ).run(
      overlap ? null : Date.now(),
      Math.min(old.expires_at, Date.now() + overlap * 3600000),
      keyId
    )
    return next
  })()
}
