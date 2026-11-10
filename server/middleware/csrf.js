import { timingSafeEqual, randomUUID } from 'node:crypto'

/** 返回带请求标识的安全错误响应。 */
export function securityError(req, res, status, code, message) {
  const requestId = req.requestId || randomUUID()
  res.set('X-Request-ID', requestId)
  return res
    .status(status)
    .json({ error: { code, message, details: {} }, request_id: requestId })
}
/** 禁止私有接口缓存及索引。 */
export function privateResponse(req, res, next) {
  res.set('Cache-Control', 'no-store')
  res.set('X-Robots-Tag', 'noindex, nofollow')
  next()
}
/** 解析可信 HTTP(S) 配置；公开来源仅允许 origin，站点地址允许部署子路径。 */
function parseTrustedOrigin(value, originOnly = false) {
  try {
    if (value !== value.trim() || !/^https?:\/\//i.test(value)) return null
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.search || url.hash ||
      value.includes('\\') ||
      (originOnly && !/^https?:\/\/[^/?#]+\/?$/i.test(value))) return null
    return url.origin
  } catch {
    return null
  }
}

/** 显式来源始终优先；开发及测试使用 Host，其他环境仅信任站点配置。 */
function trustedOrigin(req) {
  if (process.env.PUBLIC_ORIGIN) return parseTrustedOrigin(process.env.PUBLIC_ORIGIN, true)
  if (['development', 'test'].includes(process.env.NODE_ENV))
    return parseTrustedOrigin(`${req.protocol}://${req.get('host')}`, true)
  return process.env.SITE_URL ? parseTrustedOrigin(process.env.SITE_URL) : null
}

/** 校验精确来源（含协议与端口）；仅同源 Fetch Metadata 允许 Referer 回退。 */
export function requireSameOrigin(req, res, next) {
  const expected = trustedOrigin(req)
  let origin = req.get('origin')
  if (!origin && req.get('sec-fetch-site') === 'same-origin') {
    try {
      origin = new URL(req.get('referer')).origin
    } catch {
      /* reject missing/invalid */
    }
  }
  if (!origin || origin !== expected)
    return securityError(req, res, 403, 'INVALID_ORIGIN', '请求来源不可信')
  next()
}
/** 校验写请求来源及CSRF令牌。 */
export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  return requireSameOrigin(req, res, /* 来源通过后以恒定时间比较CSRF令牌。 */ () => {
    const supplied = req.get('X-CSRF-Token')
    const expected = req.session?.csrfToken
    if (
      typeof supplied !== 'string' ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !expected ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return securityError(
        req,
        res,
        403,
        'INVALID_CSRF',
        '请求验证失败，请刷新登录状态'
      )
    }
    next()
  })
}
