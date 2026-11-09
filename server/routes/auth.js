import express from 'express'
import bcrypt from 'bcrypt'
import { randomUUID } from 'node:crypto'
import db from '../db/index.js'
import { generateToken, authMiddleware, adminOnly } from '../middleware/auth.js'
import { UserDAO } from '../db/otherDAO.js'
import logger from '../utils/logger.js'
import { validateCredentials } from '../services/sessionService.js'

const router = express.Router()

/**
 * 登录接口
 */
router.post(
  '/login',
  (req, res, next) => {
    if (process.env.LEGACY_JWT_ENABLED === 'false')
      return res.status(401).json({ error: '旧JWT登录已关闭' })
    next()
  },
  async (req, res, next) => {
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
        return res
          .status(400)
          .json({ error: '用户名不能为空，密码不能超过72字节' })
      }

      // 查询用户
      const user = UserDAO.findByUsername(username)

      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' })
      }

      // 验证密码
      const isValid = await bcrypt.compare(password, user.password_hash)
      if (!isValid) {
        return res.status(401).json({ error: '用户名或密码错误' })
      }

      // Hold a cross-process write lock from password recheck through JWT signing.
      // A password change committed first rejects this login; one committed later
      // increments token_version and invalidates the token we just signed.
      const login = db
        .transaction(() => {
          const current = db
            .prepare('SELECT * FROM users WHERE id=? AND password_hash=?')
            .get(user.id, user.password_hash)
          if (!current || !['admin', 'user'].includes(current.role)) return null
          return {
            token: generateToken(current),
            user: {
              id: current.id,
              username: current.username,
              role: current.role
            }
          }
        })
        .immediate()
      if (!login) return res.status(401).json({ error: '用户名或密码错误' })

      logger.info('用户登录', { username })

      res.json(login)
    } catch (error) {
      next(error)
    }
  }
)

/**
 * 刷新 token
 */
router.post('/refresh', authMiddleware, (req, res) => {
  const token = generateToken(req.user)
  res.json({ token })
})

/**
 * 获取当前用户信息
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  })
})

/**
 * 创建用户（仅管理员；首装仅本地证明流程）
 */
router.post('/users', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {}

    try {
      validateCredentials(username, password)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }

    if (role !== undefined && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '用户角色无效' })
    }
    // Hash outside the lock; recheck bootstrap and authorization under a write lock.
    const passwordHash = await bcrypt.hash(password, 10)
    const newUser = db
      .transaction(() => {
        {
          let allowed = false
          authMiddleware(req, res, () =>
            adminOnly(req, res, () => {
              allowed = true
            })
          )
          if (!allowed) return null
        }
        if (UserDAO.findByUsername(username.trim())) {
          res.status(400).json({ error: '用户名已存在' })
          return null
        }
        return UserDAO.create({
          id: randomUUID(),
          username: username.trim(),
          passwordHash,
          role: role || 'user'
        })
      })
      .immediate()
    if (!newUser) return
    const userRole = newUser.role

    logger.info('创建用户', { username, role: userRole })

    res.status(201).json({
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router
