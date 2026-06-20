import express from 'express'
import bcrypt from 'bcrypt'
import { generateToken, authMiddleware } from '../middleware/auth.js'
import { UserDAO } from '../db/otherDAO.js'
import logger from '../utils/logger.js'

const router = express.Router()

/**
 * 登录接口
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
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

    // 生成 token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    })

    logger.info('用户登录', { username })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (error) {
    next(error)
  }
})

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
 * 创建用户（仅管理员，或首次初始化）
 */
router.post('/users', async (req, res, next) => {
  try {
    const { username, password, role } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    // 检查是否是第一个用户
    const users = UserDAO.findAll()
    const isFirstUser = users.length === 0
    const userRole = isFirstUser ? 'admin' : (role || 'user')

    // 检查用户名是否已存在
    if (UserDAO.findByUsername(username)) {
      return res.status(400).json({ error: '用户名已存在' })
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10)

    const newUser = UserDAO.create({
      id: `user-${Date.now()}`,
      username,
      passwordHash,
      role: userRole
    })

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
