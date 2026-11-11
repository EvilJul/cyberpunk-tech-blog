import express from 'express'
import { createHmac, randomBytes } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { StatsDAO } from '../db/statsDAO.js'
import { optionalAuth } from '../middleware/auth.js'

const router = express.Router()
const salt = process.env.STATS_SOURCE_SALT || process.env.JWT_SECRET || randomBytes(32).toString('hex')
const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback
const writes = rateLimit({
  windowMs: positive(process.env.STATS_RATE_WINDOW_MS, 15 * 60 * 1000),
  max: positive(process.env.STATS_RATE_LIMIT, 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '统计请求过于频繁' }
})
router.use(optionalAuth)
router.use(/* 统计读写响应都禁止缓存，防止 CDN 或浏览器展示旧计数。 */ (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
router.get('/summary', /* 仅汇总公开文章，任何会话身份都使用相同读者口径。 */ (req, res) => res.json(StatsDAO.summary()))
router.get('/views', (req, res) => res.json({ views: StatsDAO.siteViews() }))
router.post('/views', writes, (req, res) => res.json({ views: StatsDAO.incrementSiteViews() }))
for (const field of ['views', 'likes']) {
  router.get(`/article/:id/${field}`, (req, res) => {
    const stats = StatsDAO.article(req.params.id, { includeDrafts: req.user?.role === 'admin' })
    if (!stats) return res.status(404).json({ error: '文章未找到' })
    res.json({ [field]: stats[field] })
  })
  router.post(`/article/:id/${field}`, writes, (req, res) => {
    const source = createHmac('sha256', salt).update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex')
    const stats = field === 'views' ? StatsDAO.incrementViews(req.params.id) : StatsDAO.like(req.params.id, source)
    if (!stats) return res.status(404).json({ error: '文章未找到' })
    res.json(stats)
  })
}
router.get('/all', (req, res) => res.json(StatsDAO.all({ includeDrafts: req.user?.role === 'admin' })))
export default router
