import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.ADMIN_PORT || 3033
const API_SERVER = process.env.PUBLIC_PORT || 9098

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'admin')))
app.use('/uploads', express.static(join(__dirname, 'data', 'uploads')))

// 代理所有 /api/* 请求到主后端服务器
app.use('/api', async (req, res) => {
  const targetUrl = `http://localhost:${API_SERVER}/api${req.url}`

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || ''
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
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