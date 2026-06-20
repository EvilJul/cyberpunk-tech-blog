import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import multer from 'multer'
import sharp from 'sharp'
import { authMiddleware } from './middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.ADMIN_PORT || 3033

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'admin')))
app.use('/uploads', express.static(join(__dirname, 'data', 'uploads')))

app.use('/api', authMiddleware)

const dataDir = join(__dirname, 'data')
const settingsFile = join(dataDir, 'settings.json')

const defaultSettings = {
  title: 'TechBlog',
  description: '探索技术世界，分享编程经验',
  grid: true,
  footer: true,
  excerpt: 100,
  perpage: 10,
  color: 'gold',
  sidebar: 'right',
  author: 'Tech Blogger',
  bio: '探索技术世界，分享编程经验',
  github: '',
  email: ''
}

function readSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, 'utf-8')
      return { ...defaultSettings, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error('读取设置失败:', error)
  }
  return defaultSettings
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('保存设置失败:', error)
    return false
  }
}

app.get('/api/settings', (req, res) => {
  const settings = readSettings()
  res.json({ settings })
})

app.put('/api/settings', (req, res) => {
  const newSettings = { ...defaultSettings, ...req.body }
  if (saveSettings(newSettings)) {
    res.json({ success: true, settings: newSettings })
  } else {
    res.status(500).json({ error: '保存设置失败' })
  }
})

app.post('/api/settings/reset', (req, res) => {
  if (saveSettings(defaultSettings)) {
    res.json({ success: true, settings: defaultSettings })
  } else {
    res.status(500).json({ error: '重置设置失败' })
  }
})

const uploadDir = join(__dirname, 'data', 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.memoryStorage()
const upload = multer({ storage })

app.post('/api/upload', upload.single('image'), async (req, res) => {
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

app.get('/api/articles', (req, res) => {
  const dataFile = join(__dirname, 'data', 'articles.json')
  try {
    const data = fs.readFileSync(dataFile, 'utf8')
    res.json(JSON.parse(data))
  } catch (error) {
    res.json({ articles: [] })
  }
})

app.post('/api/articles', (req, res) => {
  const dataFile = join(__dirname, 'data', 'articles.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    const newArticle = {
      id: `article-${Date.now()}`,
      ...req.body,
      views: 0,
      likes: 0,
      status: 'published'
    }
    data.articles.push(newArticle)
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.status(201).json(newArticle)
  } catch (error) {
    res.status(500).json({ error: '创建失败' })
  }
})

app.put('/api/articles/:id', (req, res) => {
  const dataFile = join(__dirname, 'data', 'articles.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    const index = data.articles.findIndex(a => a.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '文章未找到' })
    }
    data.articles[index] = { ...data.articles[index], ...req.body }
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.json(data.articles[index])
  } catch (error) {
    res.status(500).json({ error: '更新失败' })
  }
})

app.delete('/api/articles/:id', (req, res) => {
  const dataFile = join(__dirname, 'data', 'articles.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    data.articles = data.articles.filter(a => a.id !== req.params.id)
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '删除失败' })
  }
})

// 分类管理
app.get('/api/categories', (req, res) => {
  const dataFile = join(__dirname, 'data', 'categories.json')
  try {
    const data = fs.readFileSync(dataFile, 'utf8')
    res.json(JSON.parse(data))
  } catch (error) {
    res.json({ categories: [] })
  }
})

app.post('/api/categories', (req, res) => {
  const dataFile = join(__dirname, 'data', 'categories.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    const newCategory = {
      id: `cat-${Date.now()}`,
      ...req.body,
      count: 0
    }
    data.categories.push(newCategory)
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.status(201).json(newCategory)
  } catch (error) {
    res.status(500).json({ error: '创建失败' })
  }
})

app.put('/api/categories/:id', (req, res) => {
  const dataFile = join(__dirname, 'data', 'categories.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    const index = data.categories.findIndex(c => c.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '分类未找到' })
    }
    data.categories[index] = { ...data.categories[index], ...req.body }
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.json(data.categories[index])
  } catch (error) {
    res.status(500).json({ error: '更新失败' })
  }
})

app.delete('/api/categories/:id', (req, res) => {
  const dataFile = join(__dirname, 'data', 'categories.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    data.categories = data.categories.filter(c => c.id !== req.params.id)
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '删除失败' })
  }
})

// 标签管理
app.get('/api/tags', (req, res) => {
  const dataFile = join(__dirname, 'data', 'tags.json')
  try {
    const data = fs.readFileSync(dataFile, 'utf8')
    res.json(JSON.parse(data))
  } catch (error) {
    res.json({ tags: [] })
  }
})

app.post('/api/tags', (req, res) => {
  const dataFile = join(__dirname, 'data', 'tags.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    const newTag = {
      id: `tag-${Date.now()}`,
      ...req.body,
      count: 0
    }
    data.tags.push(newTag)
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.status(201).json(newTag)
  } catch (error) {
    res.status(500).json({ error: '创建失败' })
  }
})

app.put('/api/tags/:id', (req, res) => {
  const dataFile = join(__dirname, 'data', 'tags.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    const index = data.tags.findIndex(t => t.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '标签未找到' })
    }
    data.tags[index] = { ...data.tags[index], ...req.body }
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.json(data.tags[index])
  } catch (error) {
    res.status(500).json({ error: '更新失败' })
  }
})

app.delete('/api/tags/:id', (req, res) => {
  const dataFile = join(__dirname, 'data', 'tags.json')
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    data.tags = data.tags.filter(t => t.id !== req.params.id)
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '删除失败' })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`管理服务器运行在 http://0.0.0.0:${PORT}`)
})