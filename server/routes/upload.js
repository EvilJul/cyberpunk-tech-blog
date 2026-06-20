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
const upload = multer({ storage })

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' })
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
    const filepath = join(uploadDir, filename)

    await sharp(req.file.buffer)
      .resize(1200, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(filepath)

    res.json({ success: true, url: `/uploads/${filename}` })
  } catch (error) {
    res.status(500).json({ error: '上传失败' })
  }
})

export default router