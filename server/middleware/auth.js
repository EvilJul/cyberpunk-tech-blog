import jwt from 'jsonwebtoken'
import { UserDAO } from '../db/otherDAO.js'
import db from '../db/index.js'
import { readSessionToken, resolveSession } from '../services/sessionService.js'
import { privateResponse, securityError } from './csrf.js'
export { requireCsrf } from './csrf.js'

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'

// 安全验证：JWT_SECRET 必须设置
if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is required. Please set it in your .env file.'
  )
}

// 生产环境额外验证：密钥长度必须足够
if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET must be at least 32 characters in production for security.'
  )
}

/**
 * 生成 JWT Token
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      tokenVersion:
        db.prepare('SELECT token_version FROM users WHERE id=?').get(user.id)
          ?.token_version || 0
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

// Token claims identify a user; current database state determines permissions.
/** 校验旧JWT及令牌版本，并以数据库当前角色确定用户权限。 */
function identify(token) {
  if (process.env.LEGACY_JWT_ENABLED === 'false')
    throw new Error('Legacy JWT disabled')
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  if (typeof decoded.id !== 'string') throw new Error('Invalid identity')
  const user = UserDAO.findById(decoded.id)
  if (!user || !['admin', 'user'].includes(user.role))
    throw new Error('Unknown identity')
  const version =
    db.prepare('SELECT token_version FROM users WHERE id=?').get(user.id)
      ?.token_version || 0
  if ((decoded.tokenVersion ?? 0) !== version)
    throw new Error('Revoked identity')
  return { id: user.id, username: user.username, role: user.role }
}

/** 验证旧Bearer凭据并重建用户及访问主体。 */
export function authMiddleware(req, res, next) {
  delete req.user
  delete req.principal
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌', code: 'NO_TOKEN' })
  }
  try {
    req.user = identify(header.substring(7))
    req.principal = {
      kind: 'user',
      id: req.user.id,
      role: req.user.role,
      scopes: [],
      authMethod: 'legacy-jwt'
    }
    return next()
  } catch (error) {
    return res.status(401).json({
      error: error.name === 'TokenExpiredError' ? '令牌已过期' : '令牌无效',
      code:
        error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
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
  delete req.user
  delete req.principal
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = identify(header.substring(7))
    } catch {
      /* public access */
    }
  }
  next()
}

// Route-local browser policy: never install this globally ahead of /api/v1.
/** 仅在浏览器路由中解析会话并重建访问主体，不全局拦截机器接口。 */
export function requireSession(req, res, next) {
  privateResponse(req, res, /* 仅应用私有响应头，后续认证流程由当前中间件继续执行。 */ () => {})
  delete req.user
  delete req.principal
  delete req.session
  const session = resolveSession(readSessionToken(req))
  if (!session)
    return securityError(req, res, 401, 'SESSION_REQUIRED', '请登录')
  req.session = session
  req.user = session.user
  req.principal = {
    kind: 'user',
    id: req.user.id,
    role: req.user.role,
    scopes: [],
    authMethod: 'session'
  }
  next()
}
/** 要求有效浏览器会话且用户具有管理员角色。 */
export function requireAdminSession(req, res, next) {
  requireSession(req, res, /* 会话校验通过后复核管理员权限。 */ () => {
    if (req.user.role !== 'admin')
      return securityError(req, res, 403, 'FORBIDDEN', '需要管理员权限')
    next()
  })
}
