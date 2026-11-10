import rateLimit from 'express-rate-limit'
import { isIP } from 'node:net'

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

/** 使用 Express 解析的可信客户端 IP；IPv6 按 /56 聚合，并合并映射 IPv4。 */
function loginIpKey(req) {
  const ip = req.ip
  if (isIP(ip) !== 6) return ip || 'unknown'
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const [left, right] = canonical.split('::')
  const head = left ? left.split(':') : []
  const tail = right ? right.split(':') : []
  const groups = right === undefined
    ? head
    : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
  const words = groups.map(/* 将标准化地址的十六进制分组转换为数值。 */ (group) => parseInt(group, 16))
  if (words.slice(0, 5).every(/* 判断 IPv4 映射地址的零前缀。 */ (word) => word === 0) && words[5] === 0xffff) {
    return `${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`
  }
  return `v6:${words[0].toString(16)}:${words[1].toString(16)}:${words[2].toString(16)}:${(words[3] & 0xff00).toString(16)}/56`
}

// 两个登录入口共用同一实例：同 IP 的全部尝试每 15 分钟最多 50 次。
export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: '登录尝试次数过多，请15分钟后再试', retryAfter: '15分钟' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginIpKey
})

// 同用户名和 IP 每 15 分钟最多 5 次失败；成功响应结束后归还本次额度。
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '登录尝试次数过多，请15分钟后再试', retryAfter: '15分钟' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  /** 仅将实际登录成功的 2xx 响应视为成功，重定向仍占失败额度。 */
  requestWasSuccessful: (req, res) => res.statusCode >= 200 && res.statusCode < 300,
  /** 先按登录规则限制原始长度，再 trim；无效输入统一用 null，避免巨大内存键。 */
  keyGenerator: (req) => JSON.stringify([
    loginIpKey(req),
    typeof req.body?.username === 'string' && req.body.username.length <= 100
      ? req.body.username.trim()
      : null
  ])
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
