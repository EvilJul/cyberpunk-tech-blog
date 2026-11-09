import express from 'express'
import { TagDAO } from '../db/otherDAO.js'
import { authMiddleware, adminOnly, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/', optionalAuth, (req, res, next) => {
  try {
    const tags = TagDAO.findAll({ includeDrafts: req.user?.role === 'admin' })
    res.json(tags)
  } catch (error) {
    next(error)
  }
})


router.put('/:id', authMiddleware, adminOnly, (req, res, next) => {
  try {
    if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.trim().length > 100) {
      return res.status(400).json({ error: '名称需为 1–100 字符' })
    }
    const item = TagDAO.update(req.params.id, { name: req.body.name.trim() })
    if (!item) return res.status(404).json({ error: '未找到' })
    res.json(item)
  } catch (error) {
    if (error.code?.startsWith('SQLITE_CONSTRAINT_UNIQUE')) return res.status(409).json({ error: '名称已存在' })
    next(error)
  }
})

router.delete('/:id', authMiddleware, adminOnly, (req, res, next) => {
  try {
    if (!TagDAO.delete(req.params.id)) return res.status(404).json({ error: '标签未找到' })
    res.json({ success: true })
  } catch (error) { next(error) }
})

export default router
