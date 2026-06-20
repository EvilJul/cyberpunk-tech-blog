import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const router = express.Router()

const uploadDir = join(__dirname, '..', 'data', 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.memoryStorage()

// 文件类型白名单
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// 文件过滤器
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('不支持的文件类型。只允许上传 JPEG、PNG、WebP 和 GIF 格式的图片'), false)
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // 每次只允许上传 1 个文件
  },
  fileFilter
})

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' })
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
    const filepath = join(uploadDir, filename)

    await sharp(req.file.buffer)
      .resize(800, 800, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true
      })
      .jpeg({ quality: 75, mozjpeg: true })
      .toFile(filepath)

    res.json({ success: true, url: `/uploads/${filename}` })
  } catch (error) {
    // 处理 Multer 错误
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: '一次只能上传 1 个文件' })
      }
      return res.status(400).json({ error: `上传错误: ${error.message}` })
    }

    // 处理文件类型错误
    if (error.message && error.message.includes('不支持的文件类型')) {
      return res.status(400).json({ error: error.message })
    }

    // 其他错误
    console.error('上传失败:', error)
    res.status(500).json({ error: '上传失败，请稍后重试' })
  }
})

export default router