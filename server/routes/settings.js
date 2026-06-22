import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()
const dataDir = join(__dirname, '..', 'data')
const settingsFile = join(dataDir, 'settings.json')

// 默认主题配置
const defaultTheme = {
  name: '暗金赛博朋克',
  preset: 'cyberpunk',
  background: {
    image: '',
    size: 'cover',
    position: 'center',
    repeat: 'no-repeat',
    overlay: 0.7
  },
  colors: {
    background: '#0a0a0f',
    surface: '#141837',
    surfaceLight: '#202648',
    border: '#2a2a3a',
    primary: '#6366f1',
    primaryLight: '#818cf8',
    primaryDark: '#4f46e5',
    secondary: '#8b5cf6',
    secondaryLight: '#a78bfa',
    accent: '#C4612F',
    accentLight: '#A94E22',
    textPrimary: '#ffffff',
    textSecondary: '#a0aec0',
    textMuted: '#5C635D',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6'
  },
  fonts: {
    heading: 'Fraunces, "DM Serif Display", serif',
    body: 'Inter, "Noto Sans SC", system-ui, sans-serif',
    code: '"Fira Code", "JetBrains Mono", monospace'
  },
  effects: {
    pixelSnow: true,
    sideRays: true,
    splashCursor: true,
    gridOverlay: true,
    glassEffect: true,
    animations: true
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
    xl: '1.5rem'
  }
}

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
  avatar: '',
  bio: '探索技术世界，分享编程经验',
  github: '',
  email: '',
  theme: defaultTheme
}

// 深度合并 theme 对象（防止部分字段丢失）
function mergeTheme(saved, defaults) {
  if (!saved) return defaults
  return {
    name: saved.name || defaults.name,
    preset: saved.preset || defaults.preset,
    background: { ...defaults.background, ...saved.background },
    colors: { ...defaults.colors, ...saved.colors },
    fonts: { ...defaults.fonts, ...saved.fonts },
    effects: { ...defaults.effects, ...saved.effects },
    borderRadius: { ...defaults.borderRadius, ...saved.borderRadius }
  }
}

// 读取设置
function readSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, 'utf-8')
      const parsed = JSON.parse(data)
      return {
        ...defaultSettings,
        ...parsed,
        theme: mergeTheme(parsed.theme, defaultTheme)
      }
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

// 获取默认主题（供管理后台预设使用）
router.get('/default-theme', (req, res) => {
  res.json({ theme: defaultTheme })
})

// 更新设置
router.put('/', (req, res) => {
  const currentSettings = readSettings()
  const newSettings = { ...currentSettings, ...req.body }

  if (req.body.theme) {
    newSettings.theme = mergeTheme(req.body.theme, defaultTheme)
  }

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
