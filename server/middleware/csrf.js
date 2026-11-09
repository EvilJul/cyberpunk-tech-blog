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
// Origin must exactly match the serving origin (including scheme and port).
// Referer fallback is limited to same-origin browser requests explicitly marked by Fetch Metadata.
/** 校验浏览器请求来源。 */
export function requireSameOrigin(req, res, next) {
  const expected =
    process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`
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
