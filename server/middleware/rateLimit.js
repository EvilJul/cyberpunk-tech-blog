import rateLimit from 'express-rate-limit'

// 通用 API 速率限制：15分钟内最多 300 次请求
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 1000, // 最多 1000 次请求
  message: {
    error: '请求过于频繁，请稍后再试',
    retryAfter: '15分钟'
  },
  standardHeaders: true, // 返回 RateLimit-* 响应头
  legacyHeaders: false, // 禁用 X-RateLimit-* 响应头
  // 根据 IP 地址进行限制
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
  }
})

// 登录接口速率限制：15分钟内最多 5 次请求
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 5, // 最多 5 次请求
  message: {
    error: '登录尝试次数过多，请15分钟后再试',
    retryAfter: '15分钟'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // 成功的请求也计入限制
  keyGenerator: (req) => {
    // 优先使用用户名，如果没有则使用 IP
    const username = req.body?.username || req.body?.email
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    return username ? `auth:${username}` : `auth:${ip}`
  }
})

// 上传接口速率限制：60分钟内最多 10 次请求
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 分钟
  max: 10, // 最多 10 次请求
  message: {
    error: '上传次数过多，请1小时后再试',
    retryAfter: '1小时'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 根据用户 ID 或 IP 进行限制
    const userId = req.user?.id
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    return userId ? `upload:${userId}` : `upload:${ip}`
  }
})
