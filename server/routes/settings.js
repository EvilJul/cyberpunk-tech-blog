import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()
const dataDir = join(__dirname, '..', 'data')
const settingsFile = join(dataDir, 'settings.json')

// 默认设置
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
  avatar: '',  // 头像URL
  bio: '探索技术世界，分享编程经验',
  github: '',
  email: ''
}

// 读取设置
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

// 保存设置
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('保存设置失败:', error)
    return false
  }
}

// 获取设置
router.get('/', (req, res) => {
  const settings = readSettings()
  res.json({ settings })
})

// 更新设置
router.put('/', (req, res) => {
  // 读取当前设置，与新设置合并
  const currentSettings = readSettings()
  const newSettings = { ...currentSettings, ...req.body }

  if (saveSettings(newSettings)) {
    res.json({ success: true, settings: newSettings })
  } else {
    res.status(500).json({ error: '保存设置失败' })
  }
})

// 重置设置
router.post('/reset', (req, res) => {
  if (saveSettings(defaultSettings)) {
    res.json({ success: true, settings: defaultSettings })
  } else {
    res.status(500).json({ error: '重置设置失败' })
  }
})

export default router
