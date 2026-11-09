import express from 'express'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const router = express.Router()
const dataDir = process.env.BLOG_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const logFile = join(dataDir, 'app.log')
let queue = Promise.resolve()

// Share validation and serialized asynchronous writes with anonymous telemetry.
export function validateLog(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['level', 'message', 'data'].includes(key)) ||
      !['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(body.level) ||
      typeof body.message !== 'string' || !body.message.trim() || body.message.length > 500) return null
  try {
    const serialized = JSON.stringify(body.data)
    if (serialized && serialized.length > 2000) return null
    return { timestamp: new Date().toISOString(), level: body.level, message: body.message, data: body.data }
  } catch { return null }
}

function enqueue(operation) {
  const result = queue.then(operation)
  queue = result.catch(() => {})
  return result
}

export function appendLog(entry) {
  return enqueue(async () => {
    await fs.mkdir(dataDir, { recursive: true })
    // Bound the active file and retain one rotated file.
    const size = await fs.stat(logFile).then(stat => stat.size).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return 0
    })
    if (size >= 5 * 1024 * 1024) await fs.rename(logFile, `${logFile}.1`)
    await fs.appendFile(logFile, `${JSON.stringify(entry)}\n`)
  })
}

router.use(authMiddleware, adminOnly)
router.post('/clear', async (req, res, next) => {
  try {
    await enqueue(async () => {
      await fs.mkdir(dataDir, { recursive: true })
      await fs.writeFile(logFile, '')
      await fs.rm(`${logFile}.1`, { force: true })
    })
    res.json({ success: true })
  } catch (error) { next(error) }
})
router.post('/', async (req, res, next) => {
  const entry = validateLog(req.body)
  if (!entry) return res.status(400).json({ error: '日志字段无效或超出限制' })
  try { await appendLog(entry); res.json({ success: true }) } catch (error) { next(error) }
})
router.get('/', async (req, res, next) => {
  try {
    await queue
    res.type('text/plain').send(await fs.readFile(logFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return res.type('text/plain').send('No logs yet')
    next(error)
  }
})
export default router
