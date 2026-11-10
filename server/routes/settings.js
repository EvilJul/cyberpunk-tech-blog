import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()
const dataDir = process.env.BLOG_DATA_DIR || join(__dirname, '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })
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
  showSidebar: true,
  excerpt: 100,
  perpage: 10,
  color: 'gold',
  sidebar: 'right',
  author: 'Tech Blogger',
  avatar: '',
  bio: '探索技术世界，分享编程经验',
  github: '',
  email: '',
  wechatName: '',
  wechatId: '',
  wechatQr: '',
  theme: defaultTheme
}

// 主题扩展是公开展示配置；限制结构与体积，不能用于保存私密数据。
const MAX_SETTINGS_BYTES = 64 * 1024
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])

/** 拒绝无效配置，同时保留客户端可读的错误状态。 */
function invalidSettings(message) {
  throw Object.assign(new Error(message), { status: 400, code: 'INVALID_SETTINGS' })
}

/** 校验有界 JSON 对象，禁止数组、危险键和过深或过大的扩展。 */
function validateTree(value, depth = 0, budget = { count: 0 }) {
  if (depth > 6) invalidSettings('设置嵌套过深')
  if (typeof value === 'string') {
    if (value.length > 8192) invalidSettings('设置字符串过长')
    return
  }
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidSettings('设置必须使用有效对象和基础类型')
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key) || key.length > 100 || ++budget.count > 256) invalidSettings('设置字段无效或过多')
    validateTree(item, depth + 1, budget)
  }
}

/** 校验主题已知分组的类型，扩展元数据遵循有界 JSON 结构。 */
function validateTheme(theme) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) invalidSettings('主题必须是对象')
  validateTree(theme)
  for (const key of ['name', 'preset', 'id', 'description']) {
    if (Object.hasOwn(theme, key) && typeof theme[key] !== 'string') invalidSettings(`主题 ${key} 必须是字符串`)
  }
  for (const group of ['background', 'colors', 'fonts', 'effects', 'borderRadius', 'spacing']) {
    if (!Object.hasOwn(theme, group)) continue
    const fields = theme[group]
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) invalidSettings(`主题 ${group} 必须是对象`)
    for (const [key, item] of Object.entries(fields)) {
      const expected = group === 'effects' ? 'boolean'
        : group === 'background' && key === 'overlay' || group === 'spacing' && key === 'unit' ? 'number'
          : group === 'spacing' ? typeof item : 'string'
      if (!['string', 'number', 'boolean'].includes(expected) || typeof item !== expected) invalidSettings(`主题 ${group}.${key} 类型无效`)
      if (group === 'background' && key === 'overlay' && (item < 0 || item > 1)) invalidSettings('背景遮罩必须介于 0 和 1')
      if (group === 'spacing' && key === 'unit' && (item < 0 || item > 1000)) invalidSettings('主题间距超出范围')
    }
  }
}

/** 按公开字段白名单校验写入；读取历史文件时仅投影合法字段。 */
function normalizeSettings(value, strict = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidSettings('设置必须是对象')
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(defaultSettings, key)) {
      if (strict) invalidSettings(`未知设置字段：${key.slice(0, 100)}`)
      continue
    }
    try {
      if (key === 'theme') validateTheme(item)
      else {
        if (typeof item !== typeof defaultSettings[key]) invalidSettings(`设置 ${key} 类型无效`)
        validateTree(item)
        if (key === 'perpage' && (!Number.isInteger(item) || item < 1 || item > 100)) invalidSettings('每页条数必须为 1 至 100 的整数')
        if (key === 'excerpt' && (!Number.isInteger(item) || item < 0 || item > 10000)) invalidSettings('摘要长度必须为 0 至 10000 的整数')
      }
      result[key] = item
    } catch (error) {
      if (strict) throw error
    }
  }
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_SETTINGS_BYTES) invalidSettings('设置总大小不能超过 64KB')
  return result
}

/** 合并已校验的默认主题分组，保留有界的公开扩展配置。 */
function mergeTheme(saved, defaults) {
  if (!saved) return defaults
  return {
    ...saved,
    name: saved.name || defaults.name,
    preset: saved.preset || defaults.preset,
    background: { ...defaults.background, ...saved.background },
    colors: { ...defaults.colors, ...saved.colors },
    fonts: { ...defaults.fonts, ...saved.fonts },
    effects: { ...defaults.effects, ...saved.effects },
    borderRadius: { ...defaults.borderRadius, ...saved.borderRadius }
  }
}

/** 读取设置时过滤历史未知字段，避免未经批准的数据公开。 */
export function readSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, 'utf-8')
      const parsed = normalizeSettings(JSON.parse(data), false)
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

/** 保存已校验的公开站点设置。 */
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
router.get('/', /* 返回白名单投影后的公开站点配置。 */ (req, res) => {
  const settings = readSettings()
  res.json({ settings })
})

// 获取默认主题（供管理后台预设使用）
router.get('/default-theme', /* 返回供编辑器使用的默认主题。 */ (req, res) => {
  res.json({ theme: defaultTheme })
})

// 更新设置
router.put('/', /* 校验完整写入后一次保存，拒绝未知站点字段及无效主题。 */ (req, res) => {
  let newSettings
  try {
    const updates = normalizeSettings(req.body)
    newSettings = { ...readSettings(), ...updates }
    if (updates.theme) newSettings.theme = mergeTheme(updates.theme, defaultTheme)
    normalizeSettings(newSettings)
  } catch (error) {
    if (error.code !== 'INVALID_SETTINGS') throw error
    return res.status(400).json({ error: error.message, code: error.code })
  }
  if (saveSettings(newSettings)) {
    res.json({ success: true, settings: newSettings })
  } else {
    res.status(500).json({ error: '保存设置失败' })
  }
})

// 重置设置
router.post('/reset', /* 将公开设置恢复为默认值。 */ (req, res) => {
  if (saveSettings(defaultSettings)) {
    res.json({ success: true, settings: defaultSettings })
  } else {
    res.status(500).json({ error: '重置设置失败' })
  }
})

export default router
