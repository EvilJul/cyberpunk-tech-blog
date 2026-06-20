import jwt from 'jsonwebtoken'

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'

// 安全验证：JWT_SECRET 必须设置
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Please set it in your .env file.')
}

// 生产环境额外验证：密钥长度必须足够
if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production for security.')
}

/**
 * 生成 JWT Token
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role || 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

/**
 * 认证中间件 - 验证 JWT Token 或 Basic Auth
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  // 优先尝试 JWT Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = decoded
      return next()
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: '令牌已过期',
          code: 'TOKEN_EXPIRED'
        })
      }
      return res.status(401).json({
        error: '令牌无效',
        code: 'INVALID_TOKEN'
      })
    }
  }

  // 尝试 Basic Auth (用于管理后台)
  if (authHeader?.startsWith('Basic ')) {
    try {
      const base64Credentials = authHeader.substring(6)
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [username, password] = credentials.split(':')

      // 简单的硬编码验证（仅用于管理后台）
      // 生产环境应该从数据库验证
      if (username === 'admin' && password === 'admin123') {
        req.user = {
          id: 1,
          username: 'admin',
          role: 'admin'
        }
        return next()
      }
    } catch (error) {
      // Basic Auth 解析失败
    }
  }

  return res.status(401).json({
    error: '未提供认证令牌',
    code: 'NO_TOKEN'
  })
}

/**
 * 管理员权限中间件
 */
export function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '需要认证' })
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: '需要管理员权限',
      code: 'FORBIDDEN'
    })
  }

  next()
}

/**
 * 可选认证中间件 - 如果有 token 就验证，没有也不报错
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = decoded
    } catch (error) {
      // 可选认证，忽略错误
    }
  }

  next()
}
