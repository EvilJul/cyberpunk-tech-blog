import express from 'express'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const router = express.Router()

const logFile = join(__dirname, '..', 'data', 'app.log')

// 清空日志
router.post('/clear', (req, res) => {
  fs.writeFileSync(logFile, '')
  res.json({ success: true })
})

// 写入日志
router.post('/', (req, res) => {
  const { level, message, data } = req.body
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`
  
  try {
    fs.appendFileSync(logFile, logEntry)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 读取日志
router.get('/', (req, res) => {
  try {
    const logs = fs.readFileSync(logFile, 'utf8')
    res.type('text/plain').send(logs)
  } catch (err) {
    res.type('text/plain').send('No logs yet')
  }
})

export default router