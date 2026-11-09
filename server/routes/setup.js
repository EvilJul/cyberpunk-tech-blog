import express from 'express'
import rateLimit from 'express-rate-limit'
import { setupStatus, completeSetup } from '../services/setupService.js'
import {
  privateResponse,
  requireSameOrigin,
  securityError
} from '../middleware/csrf.js'
const router = express.Router()
router.use(privateResponse)
router.get('/status', /* 返回首装状态。 */ (req, res) => res.json(setupStatus()))
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: /* 返回初始化尝试过频的限流错误。 */ (req, res) =>
    securityError(
      req,
      res,
      429,
      'RATE_LIMITED',
      '初始化尝试过于频繁，请稍后重试'
    )
})
router.post(
  '/complete',
  setupLimiter,
  requireSameOrigin,
  /* 验证初始化凭据并创建首位管理员。 */ async (req, res, next) => {
    try {
      res.status(201).json({ user: await completeSetup(req.body || {}) })
    } catch (error) {
      if (error.status)
        return securityError(req, res, error.status, error.code, error.message)
      next(error)
    }
  }
)
export default router
