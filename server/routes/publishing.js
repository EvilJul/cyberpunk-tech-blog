import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  enabled,
  authenticate,
  verifyActor,
  fail,
  audit
} from '../services/integrationService.js'
import {
  readArticle,
  listArticles,
  mutateArticle,
  writeOnce,
  etag
} from '../services/publishingService.js'
import { prepareMedia, storeMedia } from '../services/mediaService.js'
const router = express.Router(),
  buckets = new Map()
/** 按时间窗口限制请求频率。 */
function limit(key, max) {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || b.until <= now) {
    b = { count: 0, until: now + 60000 }
    buckets.set(key, b)
  }
  if (++b.count > max)
    throw Object.assign(new Error('请求过于频繁'), {
      status: 429,
      code: 'RATE_LIMITED',
      retryAfter: Math.ceil((b.until - now) / 1000)
    })
  if (buckets.size > 10000)
    for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k)
}
router.use(/* 验证集成身份并应用接口限流。 */ (req, res, next) => {
  req.requestId = randomUUID()
  res.set({ 'X-Request-ID': req.requestId, 'Cache-Control': 'no-store' })
  if (!enabled())
    return res
      .status(404)
      .json({
        error: { code: 'NOT_FOUND', message: '接口未启用', details: null },
        request_id: req.requestId
      })
  try {
    if (req.query.access_token || req.query.token || req.query.key)
      fail(401, 'INVALID_CREDENTIALS', '凭据不得放入地址')
    try {
      req.actor = authenticate(req.get('Authorization'))
    } catch (e) {
      limit(`ip:${req.ip}`, 30)
      throw e
    }
    limit(req.actor.integrationId, 60)
    if (!['GET', 'HEAD'].includes(req.method))
      limit(req.actor.integrationId + ':write', 20)
    if (req.path === '/media') limit(req.actor.integrationId + ':media', 10)
    next()
  } catch (e) {
    next(e)
  }
})
router.use(express.json({ limit: '2mb' }))
/** 发送状态码、版本和幂等重放标记。 */
const send = (res, result) => {
  if (result.etag) res.set('ETag', result.etag)
  if (result.replayed) res.set('Idempotency-Replayed', 'true')
  res.status(result.status).json(result.body)
}
router.get('/connection', /* 返回当前集成连接及密钥权限信息。 */ (req, res) => {
  const key = verifyActor(req.actor)
  res.json({
    data: {
      integration_id: req.actor.integrationId,
      scopes: JSON.parse(key.scopes),
      expires_at: new Date(key.expires_at).toISOString(),
      api_version: 'v1'
    },
    request_id: req.requestId
  })
})
router.get('/articles', /* 返回当前集成的文章分页列表。 */ (req, res) => {
  const { items, pagination } = listArticles(req.actor, req.query)
  res.json({ data: items, pagination, request_id: req.requestId })
})
router.put('/articles/by-external-id/:externalId', /* 按外部编号创建或更新文章草稿。 */ (req, res) =>
  send(res, mutateArticle(req, 'put'))
)
router.get('/articles/:id', /* 读取自有文章并返回版本。 */ (req, res) => {
  const data = readArticle(req.params.id, req.actor)
  res.set('ETag', etag(data)).json({ data, request_id: req.requestId })
})
router.patch('/articles/:id', /* 局部更新自有文章草稿。 */ (req, res) =>
  send(res, mutateArticle(req, 'patch'))
)
for (const action of ['publish', 'unpublish'])
  router.post(`/articles/:id/${action}`, /* 执行显式发布或撤回操作。 */ (req, res) => {
    if (req.body && Object.keys(req.body).length)
      fail(422, 'INVALID_FIELDS', '发布操作不接受字段')
    send(res, mutateArticle(req, action))
  })
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 }
}).single('file')
router.post('/media', /* 校验媒体权限后接收图片上传。 */ (req, res, next) => {
  try {
    verifyActor(req.actor, 'media:write')
  } catch (e) {
    return next(e)
  }
  upload(req, res, /* 处理上传结果并执行幂等媒体登记。 */ async (error) => {
    try {
      if (error) throw error
      const prepared = await prepareMedia(req.file)
      send(
        res,
        writeOnce(
          req,
          'media:write',
          null,
          /* 存储已准备的媒体并生成创建响应。 */ () => ({ status: 201, data: storeMedia(req.actor, prepared) }),
          { sha256: prepared.sha256, mime: req.file.mimetype }
        )
      )
    } catch (e) {
      next(e)
    }
  })
})
router.use(/* 返回未知发布接口的统一错误。 */ (req, res) =>
  res
    .status(404)
    .json({
      error: { code: 'NOT_FOUND', message: '接口不存在', details: null },
      request_id: req.requestId
    })
)
router.use(/* 归一化发布错误并记录脱敏审计。 */ (error, req, res, next) => {
  const busy = error.code === 'SQLITE_BUSY',
    status = busy
      ? 409
      : error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE'
        ? 413
        : error instanceof multer.MulterError
          ? 422
          : error.status || error.statusCode || 500
  if (status === 429 || busy)
    res.set('Retry-After', String(error.retryAfter || 1))
  try {
    audit(
      req.actor,
      req.method + ' ' + (req.route?.path || '/unknown'),
      status,
      req.requestId,
      null,
      null,
      req.ip
    )
  } catch {}
  res
    .status(status)
    .json({
      error: {
        code: busy
          ? 'REQUEST_IN_PROGRESS'
          : status === 500
            ? 'INTERNAL_ERROR'
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : error.code || 'INVALID_REQUEST',
        message:
          status === 500
            ? '内部错误'
            : status === 413
              ? '请求内容过大'
              : error.type === 'entity.parse.failed'
                ? 'JSON格式无效'
                : error instanceof multer.MulterError
                  ? '上传表单无效'
                  : error.message || '请求无效',
        details: null
      },
      request_id: req.requestId
    })
})
export default router
