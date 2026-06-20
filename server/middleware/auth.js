import jwt from 'jsonwebtoken'

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

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
 * 认证中间件 - 验证 JWT Token
 */
export function authMiddleware(req, res, next) {
  // 从 Authorization 头获取 token
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null

  if (!token) {
    return res.status(401).json({
      error: '未提供认证令牌',
      code: 'NO_TOKEN'
    })
  }

  try {
    // 验证并解码 token
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
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
