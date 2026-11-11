import express from 'express'
import { randomUUID } from 'node:crypto'
import db from '../db/index.js'
import {
  studioMediaOwner,
  createIntegration,
  createKey,
  rotateKey,
  fail,
  audit
} from '../services/integrationService.js'
import { pagination } from '../services/publishingService.js'
const router = express.Router()
router.use(/* 设置请求标识并禁止缓存集成管理响应。 */ (req, res, next) => {
  req.requestId ||= randomUUID()
  res.set({ 'Cache-Control': 'no-store', 'X-Request-ID': req.requestId })
  next()
})
router.use('/:integrationId', /* 屏蔽内部媒体主体的所有管理操作，包括启用和密钥生成。 */ (req, res, next) => {
  if (req.params.integrationId === studioMediaOwner) return next(Object.assign(new Error('集成不存在'), { status: 404, code: 'NOT_FOUND' }))
  next()
})
/** 在事务中执行管理操作并记录审计。 */
const manage = (req, operation, fn) =>
  db.transaction(/* 原子执行管理变更及其审计写入。 */ () => {
    const value = fn()
    audit(
      {
        integrationId: req.params.integrationId || value.id,
        keyId: req.params.keyId
      },
      operation,
      200,
      req.requestId,
      null,
      null,
      req.ip
    )
    return value
  })()
/** 返回带请求标识的管理数据。 */
const send = (req, res, data) => res.json({ data, request_id: req.requestId })
router.get('/', /* 读取外部集成列表，隐藏内部媒体主体。 */ (req, res) =>
  send(
    req,
    res,
    db.prepare('SELECT * FROM integrations WHERE id!=? ORDER BY created_at DESC,id').all(studioMediaOwner)
  )
)
router.post('/', /* 创建集成并返回结果。 */ (req, res) => {
  res.status(201)
  send(
    req,
    res,
    manage(req, 'integration.create', /* 创建经校验的集成记录。 */ () => createIntegration(req.body))
  )
})
router.patch('/:integrationId', /* 更新集成名称或启用状态。 */ (req, res) =>
  db.transaction(/* 原子校验并更新集成及记录审计。 */ () => {
    const p = req.body || {}
    if (
      Object.keys(p).some(/* 识别集成更新请求中的未知字段。 */ (k) => !['name', 'enabled'].includes(k)) ||
      !Object.keys(p).length
    )
      fail(422, 'INVALID_FIELDS')
    if (
      (p.name !== undefined &&
        (typeof p.name !== 'string' ||
          !p.name.trim() ||
          [...p.name.trim()].length > 80)) ||
      (p.enabled !== undefined && typeof p.enabled !== 'boolean')
    )
      fail(422, 'INVALID_FIELDS')
    const row = db
      .prepare('SELECT * FROM integrations WHERE id=?')
      .get(req.params.integrationId)
    if (!row) fail(404, 'NOT_FOUND')
    db.prepare('UPDATE integrations SET name=?,enabled=? WHERE id=?').run(
      p.name?.trim() ?? row.name,
      p.enabled === undefined ? row.enabled : Number(p.enabled),
      row.id
    )
    audit(
      { integrationId: row.id },
      'integration.update',
      200,
      req.requestId,
      null,
      null,
      req.ip
    )
    send(
      req,
      res,
      db.prepare('SELECT * FROM integrations WHERE id=?').get(row.id)
    )
  })()
)
router.get('/:integrationId/keys', /* 读取指定集成的脱敏密钥列表。 */ (req, res) =>
  send(
    req,
    res,
    db
      .prepare(
        'SELECT key_id,integration_id,scopes,expires_at,revoked_at,last_used_at,created_at FROM integration_keys WHERE integration_id=? ORDER BY created_at DESC'
      )
      .all(req.params.integrationId)
      .map(/* 将存储的权限JSON转换为数组。 */ (k) => ({ ...k, scopes: JSON.parse(k.scopes) }))
  )
)
router.post('/:integrationId/keys', /* 创建集成密钥并仅返回一次明文。 */ (req, res) => {
  res.status(201)
  send(
    req,
    res,
    manage(req, 'key.create', /* 执行指定集成的密钥创建。 */ () =>
      createKey(req.params.integrationId, req.body)
    )
  )
})
router.post('/:integrationId/keys/:keyId/rotate', /* 轮换集成密钥并返回新凭据。 */ (req, res) =>
  send(
    req,
    res,
    manage(req, 'key.rotate', /* 执行指定密钥的限权轮换。 */ () =>
      rotateKey(req.params.integrationId, req.params.keyId, req.body)
    )
  )
)
router.post('/:integrationId/keys/:keyId/revoke', /* 撤销指定集成密钥。 */ (req, res) =>
  db.transaction(/* 原子撤销密钥并记录审计。 */ () => {
    const result = db
      .prepare(
        'UPDATE integration_keys SET revoked_at=COALESCE(revoked_at,?) WHERE integration_id=? AND key_id=?'
      )
      .run(Date.now(), req.params.integrationId, req.params.keyId)
    if (!result.changes) fail(404, 'NOT_FOUND')
    audit(
      { integrationId: req.params.integrationId, keyId: req.params.keyId },
      'key.revoke',
      200,
      req.requestId,
      null,
      null,
      req.ip
    )
    send(req, res, { revoked: true })
  })()
)
router.get('/:integrationId/audit', /* 分页读取指定集成的审计记录。 */ (req, res) => {
  const { page, per_page } = pagination(req.query)
  const total = db
    .prepare('SELECT count(*) n FROM integration_audit WHERE integration_id=?')
    .get(req.params.integrationId).n
  res.json({
    data: db
      .prepare(
        'SELECT * FROM integration_audit WHERE integration_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?'
      )
      .all(req.params.integrationId, per_page, (page - 1) * per_page),
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
      has_next: page * per_page < total,
      has_prev: page > 1
    },
    request_id: req.requestId
  })
})
router.use(/* 返回统一脱敏的管理错误响应。 */ (error, req, res, next) =>
  res
    .status(error.status || 500)
    .json({
      error: {
        code: error.status ? error.code : 'INTERNAL_ERROR',
        message: error.status ? error.message : '内部错误',
        details: null
      },
      request_id: req.requestId
    })
)
export default router
