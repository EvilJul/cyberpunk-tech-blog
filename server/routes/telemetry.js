import express from 'express'
import rateLimit from 'express-rate-limit'
import { appendLog, validateLog } from './logs.js'

const router = express.Router()
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true,
  legacyHeaders: false, message: { error: '遥测过于频繁' } }))
router.post('/', async (req, res, next) => {
  const entry = validateLog(req.body)
  if (!entry || !['WARN', 'ERROR'].includes(entry.level)) {
    return res.status(400).json({ error: '遥测字段无效或超出限制' })
  }
  try {
    await appendLog({ ...entry, source: 'telemetry' })
    res.status(202).json({ success: true })
  } catch (error) { next(error) }
})
export default router
