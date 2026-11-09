import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { randomUUID } from 'node:crypto'
import sessionRouter from './routes/session.js'
import setupRouter from './routes/setup.js'
import studioRouter from './routes/studio.js'
import integrationsRouter from './routes/integrations.js'
import publishingRouter from './routes/publishing.js'
import { cleanupPublishing } from './services/mediaService.js'
import db, { initDatabase } from './db/index.js'
import discoveryRouter, { injectMetadata } from './routes/discovery.js'
import telemetryRouter from './routes/telemetry.js'
import { installLifecycle } from './utils/lifecycle.js'
import authRouter from './routes/auth.js'
import articlesRouter from './routes/articles.js'
import commentsRouter from './routes/comments.js'
import uploadRouter from './routes/upload.js'
import statsRouter from './routes/stats.js'
import logsRouter from './routes/logs.js'
import categoriesRouter from './routes/categories.js'
import tagsRouter from './routes/tags.js'
import settingsRouter from './routes/settings.js'
import {
  authMiddleware,
  adminOnly,
  requireAdminSession,
  requireCsrf
} from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import {
  generalLimiter,
  authLimiter,
  uploadLimiter
} from './middleware/rateLimit.js'
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

export const app = express()
app.disable('x-powered-by')
app.use(/* 为每个请求生成标识并写入响应头。 */ (req, res, next) => {
  req.id = randomUUID()
  res.setHeader('X-Request-ID', req.id)
  next()
})
// Accept the same optional deployment prefix used by the Vite build.
const basePath = (process.env.VITE_BASE_PATH || '/').replace(/\/$/, '')
if (basePath)
  app.use(/* 校验并剥离部署前缀，保留独立健康检查入口。 */ (req, res, next) => {
    if (
      req.url === basePath ||
      req.url.startsWith(`${basePath}/`) ||
      req.url.startsWith(`${basePath}?`)
    ) {
      req.url = req.url.slice(basePath.length) || '/'
      if (req.url.startsWith('?')) req.url = `/${req.url}`
      return next()
    }
    if (req.path === '/health') return next()
    return res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: '部署路径不存在' } })
    next()
  })
if (process.env.TRUST_PROXY)
  app.set(
    'trust proxy',
    process.env.TRUST_PROXY.split(',').map(/* 去除可信代理配置项两侧空白。 */ (value) => value.trim())
  )
app.use(compression())
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests:
          process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
)
const PORT = process.env.PUBLIC_PORT || 9098

// Keep credentials and arbitrary query strings out of request logs.
morgan.token('safe-path', /* 仅记录请求路径，避免查询参数泄露凭据。 */ (req) => req.path)
app.use(
  morgan(
    ':remote-addr :method :safe-path :status :res[content-length] :response-time ms',
    {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }
  )
)

// CORS 配置 - 限制允许的来源
const allowedOrigins = (
  process.env.CORS_ORIGIN || 'http://localhost:9099,http://localhost:3033'
)
  .split(',')
  .map((o) => o.trim())

app.use(/* 按当前请求的同源信息应用跨域策略。 */ (req, res, next) =>
  cors({
    /** 允许无来源、同源或白名单来源的跨域请求。 */
    origin: (origin, callback) => {
      if (
        !origin ||
        origin === `${req.protocol}://${req.get('host')}` ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true)
      } else {
        callback(
          Object.assign(new Error('Not allowed by CORS'), { status: 403 })
        )
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'If-Match',
      'If-None-Match',
      'Idempotency-Key'
    ],
    maxAge: 3600
  })(req, res, next)
)

// The machine router owns its 2MiB JSON and multipart limits before generic parsers.
app.use('/api/v1', publishingRouter)
app.use(
  ['/api/comments', '/api/logs', '/api/telemetry'],
  express.json({ limit: '16kb' })
)
app.use(express.json({ limit: '10mb' }))

const dataDir = process.env.BLOG_DATA_DIR || join(__dirname, 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

app.get('/health', /* 探测数据库连通性并返回服务健康状态。 */ (req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      memory: { rss: process.memoryUsage().rss },
      timestamp: new Date().toISOString()
    })
  } catch {
    res.status(503).json({ status: 'unavailable' })
  }
})

// 托管上传的图片
const uploadsDir = join(dataDir, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', etag: true }))

// 托管前端静态文件
const distDir = process.env.BLOG_DIST_DIR || join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      /** 为带哈希资源设置长期缓存，其他静态文件要求重新验证。 */
      setHeaders(res, path) {
        res.setHeader(
          'Cache-Control',
          /[.-][a-zA-Z0-9_-]{8,}\.(?:js|css|woff2?|png|webp|svg)$/.test(path) &&
            path.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache'
        )
      }
    })
  )
}

app.use('/api/session/login', authLimiter)
app.use('/api/session', sessionRouter)
app.use('/api/setup', setupRouter)
app.get('/api/studio/overview', requireAdminSession, /* 汇总管理员可见的文章、分类标签和访问统计。 */ (req, res) =>
  res.json({
    articles: db.prepare('SELECT COUNT(*) AS count FROM articles').get().count,
    published: db
      .prepare(
        "SELECT COUNT(*) AS count FROM articles WHERE status='published'"
      )
      .get().count,
    drafts: db
      .prepare(
        "SELECT COUNT(*) AS count FROM articles WHERE status!='published'"
      )
      .get().count,
    categories: db.prepare('SELECT COUNT(*) AS count FROM categories').get()
      .count,
    tags: db.prepare('SELECT COUNT(*) AS count FROM tags').get().count,
    views: db.prepare('SELECT views FROM site_stats WHERE id=1').get().views
  })
)
app.get('/api/studio/capabilities', requireAdminSession, /* 返回工作台可用的发布集成能力开关。 */ (req, res) =>
  res.json({ publishingEnabled: process.env.PUBLISHING_API_ENABLED === 'true' })
)

app.use(
  '/api/studio/integrations',
  requireAdminSession,
  requireCsrf,
  /* 发布集成未启用时拒绝访问管理接口。 */ (req, res, next) => {
    if (process.env.PUBLISHING_API_ENABLED !== 'true')
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: '发布集成未启用' } })
    next()
  },
  integrationsRouter
)
app.use('/api/studio', studioRouter)

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
app.use(
  '/api/settings',
  /* 设置读取公开放行，写入要求旧JWT及管理员权限。 */ (req, res, next) => {
    if (req.method === 'GET') return next()
    authMiddleware(req, res, /* 认证通过后复核设置写入的管理员权限。 */ (err) => {
      if (err) return next(err)
      adminOnly(req, res, next)
    })
  },
  settingsRouter
)

// Discovery routes must precede the HTML fallback.
app.use(discoveryRouter)
app.use('/api/telemetry', telemetryRouter)

if (fs.existsSync(join(distDir, 'index.html'))) {
  app.use(/* 为合法页面路径返回SPA及公开文章元信息，禁止缓存作者页面。 */ (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html'))
      return next()
    const match = req.path.match(/^\/article\/([^/]+)\/?$/)
    if (
      /^\/(?:api|uploads|assets)(?:\/|$)/.test(req.path) ||
      (!match && /\.[^/]+$/.test(req.path))
    )
      return next()
    res.setHeader('Cache-Control', 'no-cache')
    if (/^\/(?:studio|login|setup)(?:\/|$)/.test(req.path)) {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    }
    let article
    if (match) {
      try {
        article = db
          .prepare(
            "SELECT * FROM articles WHERE slug = ? AND status = 'published'"
          )
          .get(decodeURIComponent(match[1]))
      } catch {
        return res.status(400).json({ error: '无效文章地址' })
      }
      if (!article)
        return res
          .status(404)
          .type('html')
          .send(
            injectMetadata(
              fs.readFileSync(join(distDir, 'index.html'), 'utf8'),
              null,
              req.path
            )
          )
    }
    res
      .type('html')
      .send(
        injectMetadata(
          fs.readFileSync(join(distDir, 'index.html'), 'utf8'),
          article,
          req.path
        )
      )
  })
}
app.use(notFoundHandler)
app.use(errorHandler)

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
) {
  const server = app.listen(
    PORT,
    process.env.PUBLIC_HOST || '0.0.0.0',
    /* 报告监听结果并向父进程发送实际端口。 */ (error) => {
      if (error) {
        logger.error('监听失败', { message: error.message })
        process.exitCode = 1
        return
      }
      logger.info(`公开服务器已启动，端口 ${server.address().port}`)
      process.send?.({ port: server.address().port })
    }
  )
  installLifecycle(server, db)
  {
    // Retention remains enforced when machine access is temporarily disabled.
    /** 定期清理集成过期数据并记录清理失败。 */
    const cleanup = () => {
      try {
        cleanupPublishing()
      } catch (error) {
        logger.error('集成清理失败', { message: error.message })
      }
    }
    const timer = setInterval(cleanup, 3600000)
    timer.unref()
  }
}
