import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { initDatabase } from './db/index.js'
import authRouter from './routes/auth.js'
import articlesRouter from './routes/articles.js'
import commentsRouter from './routes/comments.js'
import uploadRouter from './routes/upload.js'
import statsRouter from './routes/stats.js'
import logsRouter from './routes/logs.js'
import categoriesRouter from './routes/categories.js'
import tagsRouter from './routes/tags.js'
import settingsRouter from './routes/settings.js'
import { authMiddleware, adminOnly } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { generalLimiter, authLimiter, uploadLimiter } from './middleware/rateLimit.js'
import logger from './utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 初始化数据库
try {
  initDatabase()
  logger.info('数据库初始化成功')
} catch (error) {
  logger.error('数据库初始化失败', { error: error.message })
  process.exit(1)
}

const app = express()
const PORT = process.env.PUBLIC_PORT || 9098

// HTTP 请求日志
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}))

// CORS 配置 - 限制允许的来源
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:9099,http://localhost:3033')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
}))

app.use(express.json({ limit: '10mb' }))

const dataDir = join(__dirname, 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 托管上传的图片
const uploadsDir = join(__dirname, 'data', 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
app.use('/uploads', express.static(uploadsDir))

// 托管前端静态文件
const distDir = join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
}

// 认证路由（公开）- 应用登录速率限制
app.use('/api/auth/login', authLimiter)
app.use('/api/auth', authRouter)

// 公开 API（只读）- 应用通用速率限制
app.use('/api/', generalLimiter)
app.use('/api/articles', articlesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/stats', statsRouter)

// 需要认证的 API
app.use('/api/logs', authMiddleware, logsRouter)

// Comments: GET 公开, POST 公开（匿名评论）
app.use('/api/comments', commentsRouter)

// 管理员专用 API（需要认证 + 管理员权限）- 应用上传速率限制
app.use('/api/upload', uploadLimiter, authMiddleware, adminOnly, uploadRouter)

// Settings: GET 公开, PUT/POST 需要管理员权限
app.use('/api/settings', (req, res, next) => {
  if (req.method === 'GET') return next()
  authMiddleware(req, res, (err) => {
    if (err) return next(err)
    adminOnly(req, res, next)
  })
}, settingsRouter)

// 404 处理
app.use(notFoundHandler)

// 全局错误处理
app.use(errorHandler)

// SPA 回退 - 所有非API请求返回 index.html（必须放在最后）
if (fs.existsSync(distDir)) {
  app.use((req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`公开服务器运行在 http://0.0.0.0:${PORT}`)
  console.log(`公开服务器运行在 http://0.0.0.0:${PORT}`)
})