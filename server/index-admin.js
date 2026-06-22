import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import multer from 'multer'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.ADMIN_PORT || 3033
const API_SERVER = process.env.PUBLIC_PORT || 9098

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'admin')))
app.use('/uploads', express.static(join(__dirname, 'data', 'uploads')))

const uploadDir = join(__dirname, 'data', 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('不支持的文件类型'), false)
    }
  }
})

app.post('/api/upload', upload.single('image'), async (req, res) => {
  console.log('[Admin Upload] 收到上传请求, file:', !!req.file, 'body:', Object.keys(req.body || {}))
  try {
    if (!req.file) return res.status(400).json({ error: '没有上传文件' })

    const imageType = req.query.type || req.body.type || 'normal'
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
    const filepath = join(uploadDir, filename)

    let resizeOptions, quality
    if (imageType === 'background') {
      resizeOptions = { width: 2560, fit: 'inside', withoutEnlargement: true }
      quality = 85
    } else if (imageType === 'avatar') {
      resizeOptions = { width: 400, height: 400, fit: 'cover', position: 'centre', withoutEnlargement: true }
      quality = 80
    } else {
      resizeOptions = { width: 1200, fit: 'inside', withoutEnlargement: true }
      quality = 75
    }

    await sharp(req.file.buffer).resize(resizeOptions).jpeg({ quality, mozjpeg: true }).toFile(filepath)
    res.json({ success: true, url: `/uploads/${filename}` })
  } catch (error) {
    console.error('上传失败:', error)
    res.status(500).json({ error: '上传失败' })
  }
})

// 代理所有 /api/* 请求到主后端服务器
app.use('/api', async (req, res) => {
  const targetUrl = `http://localhost:${API_SERVER}/api${req.url}`

  try {
    const headers = {
      'Authorization': req.headers.authorization || ''
    }
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type']
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body)) : undefined
    })

    let data = await response.json()

    // 转换数据格式以兼容管理后台
    if (req.url.startsWith('/articles') && req.method === 'GET') {
      // 文章列表：{data: [], pagination: {}} -> {articles: []}
      if (data.data !== undefined) {
        data = { articles: data.data }
      }
    } else if (req.url.startsWith('/categories') && req.method === 'GET' && Array.isArray(data)) {
      // 分类列表：[] -> {categories: []}
      data = { categories: data }
    } else if (req.url.startsWith('/tags') && req.method === 'GET' && Array.isArray(data)) {
      // 标签列表：[] -> {tags: []}
      data = { tags: data }
    } else if (req.url.startsWith('/settings') && data.settings === undefined) {
      // 设置：如果没有 settings 字段，包装一下
      data = { settings: data }
    }

    res.status(response.status).json(data)
  } catch (error) {
    console.error('代理请求失败:', targetUrl, error.message)
    res.status(500).json({ error: '服务器错误' })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`管理服务器运行在 http://0.0.0.0:${PORT}`)
  console.log(`API 代理到 http://localhost:${API_SERVER}`)
})