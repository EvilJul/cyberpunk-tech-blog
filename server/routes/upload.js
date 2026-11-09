import express from 'express'
import { randomUUID } from 'node:crypto'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import multer from 'multer'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const router = express.Router()

const uploadDir = join(
  process.env.BLOG_DATA_DIR || join(__dirname, '..', 'data'),
  'uploads'
)
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
    cb(
      new Error(
        '不支持的文件类型。只允许上传 JPEG、PNG、WebP 和 GIF 格式的图片'
      ),
      false
    )
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1, // 每次只允许上传 1 个文件
    fields: 4,
    fieldSize: 1024,
    parts: 5
  },
  fileFilter
})

/** 解析旧上传接口的单张图片，并限制文件及表单大小。 */
const parseImage = (req, res, next) =>
  upload.single('image')(req, res, /* 解析失败时返回上传错误，否则继续处理图片。 */ (error) => {
    if (error)
      return res
        .status(400)
        .json({ error: '上传文件或表单无效（图片最大 5MB）' })
    next()
  })

// Studio supports both the documented `file` and the settings/media `image` field.
// The shared limits.files=1 rejects two files even when field names differ.
/** 兼容工作台的image与file字段，共享限制每次仅上传一张图片。 */
export const parseStudioImage = (req, res, next) =>
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 }
  ])(req, res, /* 处理表单解析错误，并将兼容字段统一为单个上传文件。 */ (error) => {
    if (error)
      return res
        .status(400)
        .json({ error: '上传文件或表单无效（图片最大 5MB，每次一张）' })
    req.file = req.files?.image?.[0] || req.files?.file?.[0]
    next()
  })

/** 解码校验上传图片，按用途缩放并保存为JPEG后返回访问地址。 */
export async function handleStudioImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' })
    }

    // 从请求参数中获取图片类型，默认为普通图片
    const imageType = req.query.type || req.body?.type || 'normal'

    const filename = `${randomUUID()}.jpg`
    const filepath = join(uploadDir, filename)

    // 根据图片类型设置不同的处理参数
    let resizeOptions, quality

    if (imageType === 'background') {
      // 背景图片：保持原始尺寸，最大宽度 2560px
      resizeOptions = {
        width: 2560,
        fit: 'inside',
        withoutEnlargement: true
      }
      quality = 85
    } else if (imageType === 'avatar') {
      // 头像：裁剪为正方形
      resizeOptions = {
        width: 400,
        height: 400,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true
      }
      quality = 80
    } else {
      // 普通图片（文章配图）：限制宽度
      resizeOptions = {
        width: 1200,
        fit: 'inside',
        withoutEnlargement: true
      }
      quality = 75
    }

    // Decode before writing: MIME labels alone do not establish a valid image.
    try {
      const metadata = await sharp(req.file.buffer, {
        limitInputPixels: 40000000
      }).metadata()
      if (imageType === 'avatar') {
        // A target no larger than either source dimension lets cover crop small
        // rectangular inputs too, without ever enlarging their pixels.
        resizeOptions.width = resizeOptions.height = Math.min(
          400,
          metadata.width,
          metadata.height
        )
      }
    } catch {
      return res.status(400).json({ error: '图片内容无效或尺寸过大' })
    }
    await sharp(req.file.buffer, { limitInputPixels: 40000000 })
      .resize(resizeOptions)
      .jpeg({ quality, mozjpeg: true })
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
}

// Session callers mount the exported adapter behind their own session + CSRF guards.
router.post('/', authMiddleware, adminOnly, parseImage, handleStudioImage)

export default router
