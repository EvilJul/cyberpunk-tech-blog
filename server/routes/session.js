import express from 'express'
import bcrypt from 'bcrypt'
import db from '../db/index.js'
import { requireSession, requireCsrf } from '../middleware/auth.js'
import {
  privateResponse,
  requireSameOrigin,
  securityError
} from '../middleware/csrf.js'
import {
  SESSION_COOKIE,
  cookieOptions,
  readSessionToken,
  createSession,
  revokeSession,
  changePassword,
  publicUser
} from '../services/sessionService.js'

const router = express.Router()
router.use(privateResponse)
router.post('/login', requireSameOrigin, /* 验证用户名密码并建立浏览器会话。 */ async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    if (
      typeof username !== 'string' ||
      !username.trim() ||
      username.length > 100 ||
      typeof password !== 'string' ||
      !password ||
      Buffer.byteLength(password) > 72
    ) {
      return securityError(
        req,
        res,
        400,
        'INVALID_INPUT',
        '请输入有效的用户名和密码'
      )
    }
    const user = db
      .prepare('SELECT * FROM users WHERE username=?')
      .get(username.trim())
    if (
      !user ||
      !['admin', 'user'].includes(user.role) ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return securityError(
        req,
        res,
        401,
        'INVALID_CREDENTIALS',
        '用户名或密码错误'
      )
    }
    // Recheck and insert under one cross-process write lock. A concurrent
    // password change must either reject this login or revoke its new session.
    const login = db
      .transaction(/* 在写锁内复核密码后签发会话。 */ () => {
        const current = db
          .prepare('SELECT * FROM users WHERE id=? AND password_hash=?')
          .get(user.id, user.password_hash)
        if (!current || !['admin', 'user'].includes(current.role)) return null
        return {
          user: publicUser(current),
          session: createSession(current.id, readSessionToken(req))
        }
      })
      .immediate()
    if (!login)
      return securityError(
        req,
        res,
        401,
        'INVALID_CREDENTIALS',
        '用户名或密码错误'
      )
    const { session } = login
    res.cookie(SESSION_COOKIE, session.token, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    res.json({ user: login.user, csrfToken: session.csrfToken })
  } catch (error) {
    next(error)
  }
})
router.get(
  '/me',
  /* 无会话Cookie时返回匿名状态。 */ (req, res, next) => {
    if (readSessionToken(req) === undefined)
      return res.json({ user: null, csrfToken: null })
    next()
  },
  requireSession,
  /* 返回当前用户及CSRF令牌。 */ (req, res) => res.json({ user: req.user, csrfToken: req.session.csrfToken })
)
router.post('/logout', requireSession, requireCsrf, /* 撤销当前会话并清除Cookie。 */ (req, res) => {
  revokeSession(readSessionToken(req))
  res.clearCookie(SESSION_COOKIE, cookieOptions())
  res.json({ success: true })
})
router.post(
  '/password',
  requireSession,
  requireCsrf,
  /* 修改密码并清除已失效的会话Cookie。 */ async (req, res, next) => {
    try {
      await changePassword(
        req.user.id,
        req.body?.oldPassword,
        req.body?.newPassword
      )
      res.clearCookie(SESSION_COOKIE, cookieOptions())
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)
router.use(/* 将认证错误转换为统一安全响应。 */ (err, req, res, next) => {
  if (!err.status) return next(err)
  securityError(req, res, err.status, err.code, err.message)
})
export default router
