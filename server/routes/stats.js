import express from 'express'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const router = express.Router()

const statsFile = join(__dirname, '..', 'data', 'stats.json')

function readStats() {
  try {
    const data = fs.readFileSync(statsFile, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    return { views: 0, likes: {}, articleViews: {} }
  }
}

function writeStats(data) {
  fs.writeFileSync(statsFile, JSON.stringify(data, null, 2))
}

// 获取总访问量
router.get('/views', (req, res) => {
  const stats = readStats()
  res.json({ views: stats.views })
})

// 增加访问量
router.post('/views', (req, res) => {
  const stats = readStats()
  stats.views += 1
  writeStats(stats)
  res.json({ views: stats.views })
})

// 获取文章访问量
router.get('/article/:id/views', (req, res) => {
  const stats = readStats()
  const views = stats.articleViews[req.params.id] || 0
  res.json({ views })
})

// 增加文章访问量
router.post('/article/:id/views', (req, res) => {
  const stats = readStats()
  if (!stats.articleViews[req.params.id]) {
    stats.articleViews[req.params.id] = 0
  }
  stats.articleViews[req.params.id] += 1
  writeStats(stats)
  res.json({ views: stats.articleViews[req.params.id] })
})

// 获取文章点赞数
router.get('/article/:id/likes', (req, res) => {
  const stats = readStats()
  const likes = stats.likes[req.params.id] || 0
  res.json({ likes })
})

// 增加文章点赞数
router.post('/article/:id/likes', (req, res) => {
  const stats = readStats()
  if (!stats.likes[req.params.id]) {
    stats.likes[req.params.id] = 0
  }
  stats.likes[req.params.id] += 1
  writeStats(stats)
  res.json({ likes: stats.likes[req.params.id] })
})

// 获取所有统计数据
router.get('/all', (req, res) => {
  const stats = readStats()
  res.json(stats)
})

export default router