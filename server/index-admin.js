import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import db, { initDatabase } from './db/index.js'
import { installLifecycle } from './utils/lifecycle.js'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { authMiddleware, adminOnly } from './middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

// No body parser here: multipart uploads and other request bodies flow unchanged.
export function createAdminApp({ apiUrl = process.env.PUBLIC_API_URL || `http://127.0.0.1:${process.env.PUBLIC_PORT || 9098}`, timeout = 10000, authenticate = authMiddleware, authorize = adminOnly } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: null
  } } }))
  const port = process.env.ADMIN_PORT || 3033
  const allowedOrigins = new Set((process.env.ADMIN_CORS_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map(value => value.trim()).filter(Boolean))
  app.use((req, res, next) => {
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return res.status(403).json({ error: '来源不被允许' })
    next()
  })
  app.use(cors({ origin: [...allowedOrigins], methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] }))
  app.use(express.static(join(__dirname, '..', 'admin')))
  app.use('/uploads', express.static(join(resolve(process.env.BLOG_DATA_DIR || join(__dirname, 'data')), 'uploads')))
  app.use('/api', (req, res, next) => {
    // The public service owns the atomic first-user policy; never duplicate it here.
    if (req.method === 'POST' && ['/auth/login', '/auth/users'].includes(req.path)) return next()
    authenticate(req, res, () => authorize(req, res, next))
  })
  app.use('/api', (req, res) => {
    const target = new URL(`/api${req.url}`, apiUrl)
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !hopHeaders.has(name) && name !== 'host'))
    const connectionHeaders = (req.headers.connection || '').split(',').map(value => value.trim().toLowerCase())
    connectionHeaders.forEach(name => delete headers[name])
    let timedOut = false
    const upstream = http.request(target, { method: req.method, headers }, response => {
      res.statusCode = response.statusCode
      const excluded = new Set([...hopHeaders, ...(response.headers.connection || '').split(',').map(value => value.trim().toLowerCase())])
      for (const [name, value] of Object.entries(response.headers)) {
        if (!excluded.has(name) && value !== undefined && !name.startsWith('access-control-')) res.setHeader(name, value)
      }
      response.on('error', () => res.destroy())
      response.pipe(res)
    })
    const timer = setTimeout(() => { timedOut = true; upstream.destroy(new Error('timeout')) }, timeout)
    const clearTimer = () => clearTimeout(timer)
    res.on('finish', clearTimer)
    res.on('close', () => { clearTimer(); upstream.destroy() })
    req.on('aborted', () => upstream.destroy())
    upstream.on('error', () => {
      clearTimer()
      if (res.headersSent) return res.destroy()
      res.status(timedOut ? 504 : 502).json({ error: timedOut ? '上游请求超时' : '上游服务不可用' })
    })
    req.pipe(upstream)
  })
  return app
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.ADMIN_HOST || '127.0.0.1'
  const port = process.env.ADMIN_PORT || 3033
  initDatabase()
  const server = createAdminApp().listen(port, host, () => console.log(`管理服务器运行在 http://${host}:${port}`))
  installLifecycle(server, db)
}
