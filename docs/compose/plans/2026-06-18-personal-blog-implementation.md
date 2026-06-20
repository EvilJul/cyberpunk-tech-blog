# 个人博客网站实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于现有简历网站完全重构为个人技术博客网站，采用暗金赛博朋克主题。

**Architecture:** 双端口架构（公开端口9098 + 管理端口3033），React SPA + Express后端，JSON文件存储，WebGL特效背景。

**Tech Stack:** React 18.3, Vite 6.x, Tailwind CSS 3.4, Express 5.2, Three.js, OGL, Sharp

---

## 文件结构映射

```
项目根/
├── src/
│   ├── components/           # React组件
│   │   ├── background/       # WebGL背景组件
│   │   ├── layout/           # 布局组件（Header, Footer）
│   │   ├── blog/             # 博客相关组件
│   │   ├── admin/            # 管理后台组件
│   │   └── ui/               # 通用UI组件
│   ├── hooks/                # 自定义Hooks
│   ├── utils/                # 工具函数
│   ├── data/                 # 初始数据模板
│   ├── App.jsx               # 主应用组件
│   └── main.jsx              # 入口文件
├── server/
│   ├── index.js              # Express服务器入口
│   ├── routes/               # API路由
│   ├── middleware/           # 中间件
│   └── data/                 # 持久化数据目录
├── public/                   # 静态资源
├── tailwind.config.js        # Tailwind配置
├── vite.config.js            # Vite配置
└── deploy.sh                 # 部署脚本
```

---

## Task 1: 项目初始化与基础设置

**Covers:** [S2, S3]

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `index.html`

- [ ] **Step 1: 初始化npm项目**

```bash
npm init -y
```

- [ ] **Step 2: 安装核心依赖**

```bash
npm install react react-dom lucide-react motion ogl three express cors sharp
npm install -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer concurrently
```

- [ ] **Step 3: 创建Vite配置**

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 9099,
    proxy: {
      '/api': 'http://localhost:9098'
    }
  }
})
```

- [ ] **Step 4: 创建Tailwind配置**

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#334155',
          700: '#2a2a3a',
          800: '#202648',
          900: '#141837',
          950: '#0a0a0f',
        },
        gold: {
          DEFAULT: '#ffd700',
          light: '#ffed4a',
          dark: '#b8860b',
          glow: 'rgba(255, 215, 0, 0.15)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.6s ease-out',
        'fade-in': 'fadeIn 0.8s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(255, 215, 0, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 5: 创建PostCSS配置**

```javascript
// postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: 创建HTML入口**

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>技术博客 | 暗金赛博朋克</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 创建React入口**

```jsx
// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 8: 创建CSS文件**

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-dark-950 text-white font-sans;
  }
}

@layer components {
  .glass-card {
    @apply bg-dark-800/50 backdrop-blur-sm border border-dark-600/50 rounded-xl;
  }
  
  .glass-card-hover {
    @apply hover:border-gold/50 hover:shadow-lg hover:shadow-gold/10 transition-all duration-300;
  }
  
  .gradient-text {
    @apply bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent;
  }
  
  .glow-border {
    @apply relative;
  }
  
  .glow-border::before {
    content: '';
    @apply absolute inset-0 rounded-xl bg-gradient-to-r from-gold/20 to-transparent opacity-0 transition-opacity duration-300;
  }
  
  .glow-border:hover::before {
    @apply opacity-100;
  }
}
```

- [ ] **Step 9: 创建App组件**

```jsx
// src/App.jsx
import React from 'react'

function App() {
  return (
    <div className="min-h-screen bg-dark-950">
      <h1 className="text-4xl text-gold p-8">技术博客</h1>
    </div>
  )
}

export default App
```

- [ ] **Step 10: 测试开发服务器**

```bash
npm run dev
```

- [ ] **Step 11: 提交代码**

```bash
git add .
git commit -m "feat: 初始化项目基础设置"
```

---

## Task 2: 数据模型与JSON文件

**Covers:** [S5]

**Files:**
- Create: `src/data/articles.json`
- Create: `src/data/comments.json`
- Create: `server/data/articles.json`
- Create: `server/data/comments.json`
- Create: `server/data/config.json`

- [ ] **Step 1: 创建文章初始模板**

```json
// src/data/articles.json
{
  "articles": [
    {
      "id": "article-001",
      "title": "欢迎来到我的技术博客",
      "slug": "welcome-to-my-tech-blog",
      "content": "# 欢迎\n\n这是我的第一篇技术博客文章。\n\n## 为什么写博客\n\n记录学习过程，分享技术经验。",
      "excerpt": "这是我的第一篇技术博客文章，记录学习过程，分享技术经验。",
      "category": "技术分享",
      "tags": ["博客", "技术", "入门"],
      "author": "博主",
      "publishDate": "2026-06-18",
      "updateDate": "2026-06-18",
      "status": "published",
      "views": 0,
      "likes": 0
    }
  ]
}
```

- [ ] **Step 2: 创建评论初始模板**

```json
// src/data/comments.json
{
  "comments": []
}
```

- [ ] **Step 3: 创建持久化数据目录**

```bash
mkdir -p server/data/uploads
```

- [ ] **Step 4: 复制初始数据到持久化目录**

```bash
cp src/data/articles.json server/data/articles.json
cp src/data/comments.json server/data/comments.json
```

- [ ] **Step 5: 创建配置文件**

```json
// server/data/config.json
{
  "siteName": "技术博客",
  "siteDescription": "暗金赛博朋克风格的技术博客",
  "adminPassword": "admin123",
  "commentsEnabled": true,
  "commentsRequireApproval": true
}
```

- [ ] **Step 6: 提交代码**

```bash
git add src/data/ server/data/
git commit -m "feat: 添加数据模型和初始数据"
```

---

## Task 3: Express服务器基础

**Covers:** [S4, S6]

**Files:**
- Create: `server/index.js`
- Create: `server/routes/articles.js`
- Create: `server/routes/comments.js`
- Create: `server/routes/upload.js`
- Create: `server/middleware/auth.js`

- [ ] **Step 1: 创建Express服务器入口**

```javascript
// server/index.js
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PUBLIC_PORT || 9098
const ADMIN_PORT = process.env.ADMIN_PORT || 3033
const BASE_PATH = process.env.VITE_BASE_PATH || '/'

// 中间件
app.use(cors())
app.use(express.json())

// 数据目录
const dataDir = join(__dirname, 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`公开服务器运行在 http://0.0.0.0:${PORT}`)
})
```

- [ ] **Step 2: 创建文章路由**

```javascript
// server/routes/articles.js
import express from 'express'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const router = express.Router()

const dataFile = join(__dirname, '..', 'data', 'articles.json')

// 读取文章数据
function readArticles() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    return { articles: [] }
  }
}

// 写入文章数据
function writeArticles(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
}

// 获取所有文章
router.get('/', (req, res) => {
  const { articles } = readArticles()
  res.json(articles)
})

// 获取单篇文章
router.get('/:slug', (req, res) => {
  const { articles } = readArticles()
  const article = articles.find(a => a.slug === req.params.slug)
  if (!article) {
    return res.status(404).json({ error: '文章未找到' })
  }
  res.json(article)
})

export default router
```

- [ ] **Step 3: 创建评论路由**

```javascript
// server/routes/comments.js
import express from 'express'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const router = express.Router()

const dataFile = join(__dirname, '..', 'data', 'comments.json')

// 读取评论数据
function readComments() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    return { comments: [] }
  }
}

// 写入评论数据
function writeComments(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
}

// 获取文章评论
router.get('/:articleId', (req, res) => {
  const { comments } = readComments()
  const articleComments = comments.filter(c => c.articleId === req.params.articleId)
  res.json(articleComments)
})

// 提交评论
router.post('/:articleId', (req, res) => {
  const { comments } = readComments()
  const newComment = {
    id: `comment-${Date.now()}`,
    articleId: req.params.articleId,
    parentId: req.body.parentId || null,
    author: req.body.author,
    email: req.body.email,
    content: req.body.content,
    createdAt: new Date().toISOString(),
    status: 'pending'
  }
  comments.push(newComment)
  writeComments({ comments })
  res.status(201).json(newComment)
})

export default router
```

- [ ] **Step 4: 创建上传路由**

```javascript
// server/routes/upload.js
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
```

- [ ] **Step 5: 创建认证中间件**

```javascript
// server/middleware/auth.js
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function authMiddleware(req, res, next) {
  const configPath = join(__dirname, '..', 'data', 'config.json')
  let config = {}
  
  try {
    const data = fs.readFileSync(configPath, 'utf8')
    config = JSON.parse(data)
  } catch (error) {
    // 使用默认密码
    config.adminPassword = 'admin123'
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: '需要认证' })
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString()
  const [username, password] = credentials.split(':')

  if (password !== config.adminPassword) {
    return res.status(401).json({ error: '密码错误' })
  }

  next()
}
```

- [ ] **Step 6: 更新服务器入口集成路由**

```javascript
// 更新 server/index.js
import articlesRouter from './routes/articles.js'
import commentsRouter from './routes/comments.js'
import uploadRouter from './routes/upload.js'

// 添加路由
app.use('/api/articles', articlesRouter)
app.use('/api/comments', commentsRouter)
app.use('/api/upload', uploadRouter)
```

- [ ] **Step 7: 添加package.json脚本**

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"node server/index.js\"",
    "build": "vite build",
    "start": "node server/index.js"
  }
}
```

- [ ] **Step 8: 测试服务器**

```bash
npm run dev
curl http://localhost:9098/health
```

- [ ] **Step 9: 提交代码**

```bash
git add server/
git commit -m "feat: 实现Express服务器和API路由"
```

---

## Task 4: WebGL背景组件

**Covers:** [S4, S8]

**Files:**
- Create: `src/components/background/PixelSnow.jsx`
- Create: `src/components/background/SideRays.jsx`
- Create: `src/components/background/SplashCursor.jsx`
- Create: `src/components/background/GridOverlay.jsx`

- [ ] **Step 1: 创建PixelSnow组件**

```jsx
// src/components/background/PixelSnow.jsx
import React, { useRef, useEffect } from 'react'
import * as THREE from 'three'

export default function PixelSnow() {
  const mountRef = useRef(null)

  useEffect(() => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    mountRef.current.appendChild(renderer.domElement)

    // 创建雪花粒子
    const geometry = new THREE.BufferGeometry()
    const count = 500
    const positions = new Float32Array(count * 3)
    
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 20
      positions[i + 1] = (Math.random() - 0.5) * 20
      positions[i + 2] = (Math.random() - 0.5) * 20
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    
    const material = new THREE.PointsMaterial({
      color: 0xffd700,
      size: 0.05,
      transparent: true,
      opacity: 0.6,
    })
    
    const snow = new THREE.Points(geometry, material)
    scene.add(snow)
    camera.position.z = 5

    const animate = () => {
      requestAnimationFrame(animate)
      snow.rotation.y += 0.0005
      snow.rotation.x += 0.0002
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      mountRef.current?.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [])

  return <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" />
}
```

- [ ] **Step 2: 创建SideRays组件**

```jsx
// src/components/background/SideRays.jsx
import React, { useRef, useEffect } from 'react'
import { OGL } from 'ogl'

export default function SideRays() {
  const mountRef = useRef(null)

  useEffect(() => {
    const renderer = new OGL.Renderer({ dpr: 2 })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    mountRef.current.appendChild(gl.canvas)

    const scene = new OGL.Scene()
    const camera = new OGL.Camera({ fov: 75 })
    camera.position.z = 5

    // 创建光线
    const geometry = new OGL.Plane(gl, 2, 2)
    const material = new OGL.ShaderMaterial({
      vertex: `
        attribute vec2 position;
        void main() {
          gl_Position = vec4(position, 0, 1);
        }
      `,
      fragment: `
        precision highp float;
        uniform float uTime;
        void main() {
          vec2 uv = gl_FragCoord.xy / vec2(1920.0, 1080.0);
          float ray = sin(uv.x * 10.0 + uTime) * 0.5 + 0.5;
          ray *= exp(-uv.x * 3.0);
          gl_FragColor = vec4(1.0, 0.84, 0.0, ray * 0.1);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
      },
    })

    const mesh = new OGL.Mesh(gl, { geometry, material })
    scene.addChild(mesh)

    const animate = (time) => {
      requestAnimationFrame(animate)
      material.uniforms.uTime.value = time * 0.001
      renderer.render({ scene, camera })
    }
    animate(0)

    const handleResize = () => {
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    }
    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      mountRef.current?.removeChild(gl.canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" />
}
```

- [ ] **Step 3: 创建GridOverlay组件**

```jsx
// src/components/background/GridOverlay.jsx
import React from 'react'

export default function GridOverlay() {
  return (
    <div 
      className="fixed inset-0 z-0 pointer-events-none opacity-10"
      style={{
        backgroundImage: `
          linear-gradient(rgba(255, 215, 0, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 215, 0, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px'
      }}
    />
  )
}
```

- [ ] **Step 4: 创建SplashCursor组件**

```jsx
// src/components/background/SplashCursor.jsx
import React, { useRef, useEffect } from 'react'

export default function SplashCursor() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const particles = []
    const mouse = { x: 0, y: 0 }

    const handleMouseMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      
      for (let i = 0; i < 5; i++) {
        particles.push({
          x: mouse.x,
          y: mouse.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 1,
          color: `hsla(${Math.random() * 60 + 30}, 100%, 50%, 0.8)`,
        })
      }
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.02

        if (p.life <= 0) {
          particles.splice(i, 1)
          continue
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2)
        ctx.fillStyle = p.color.replace('0.8', String(p.life * 0.8))
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('resize', resize)
    animate()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50 pointer-events-none"
    />
  )
}
```

- [ ] **Step 5: 提交代码**

```bash
git add src/components/background/
git commit -m "feat: 实现WebGL背景组件"
```

---

## Task 5: 博客前端组件

**Covers:** [S4, S6, S8]

**Files:**
- Create: `src/components/layout/Header.jsx`
- Create: `src/components/layout/Footer.jsx`
- Create: `src/components/blog/Hero.jsx`
- Create: `src/components/blog/ArticleList.jsx`
- Create: `src/components/blog/ArticleCard.jsx`
- Create: `src/components/blog/ArticleDetail.jsx`
- Create: `src/components/blog/CommentSection.jsx`
- Create: `src/components/blog/SearchBar.jsx`
- Create: `src/hooks/useData.js`

- [ ] **Step 1: 创建Header组件**

```jsx
// src/components/layout/Header.jsx
import React, { useState, useEffect } from 'react'
import { Search, Menu, X } from 'lucide-react'

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-dark-950/80 backdrop-blur-md border-b border-dark-700/50' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="text-2xl font-bold gradient-text">
          TechBlog
        </div>
        
        <nav className="hidden md:flex items-center gap-8">
          <a href="#home" className="text-dark-200 hover:text-gold transition-colors">首页</a>
          <a href="#articles" className="text-dark-200 hover:text-gold transition-colors">文章</a>
          <a href="#about" className="text-dark-200 hover:text-gold transition-colors">关于</a>
          <button className="p-2 text-dark-200 hover:text-gold transition-colors">
            <Search size={20} />
          </button>
        </nav>

        <button 
          className="md:hidden p-2 text-dark-200"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-dark-900/95 backdrop-blur-md border-b border-dark-700/50">
          <nav className="flex flex-col p-4 gap-4">
            <a href="#home" className="text-dark-200 hover:text-gold">首页</a>
            <a href="#articles" className="text-dark-200 hover:text-gold">文章</a>
            <a href="#about" className="text-dark-200 hover:text-gold">关于</a>
          </nav>
        </div>
      )}
    </header>
  )
}
```

- [ ] **Step 2: 创建Footer组件**

```jsx
// src/components/layout/Footer.jsx
import React from 'react'

export default function Footer() {
  return (
    <footer className="bg-dark-900/50 border-t border-dark-700/50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-dark-400 text-sm">
            © 2026 TechBlog. Built with React + Vite + Tailwind CSS
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-dark-400 hover:text-gold text-sm transition-colors">GitHub</a>
            <a href="#" className="text-dark-400 hover:text-gold text-sm transition-colors">Twitter</a>
            <a href="#" className="text-dark-400 hover:text-gold text-sm transition-colors">RSS</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: 创建Hero组件**

```jsx
// src/components/blog/Hero.jsx
import React from 'react'
import { ChevronDown } from 'lucide-react'

export default function Hero() {
  return (
    <section id="home" className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in">
          <span className="gradient-text">技术博客</span>
        </h1>
        <p className="text-xl md:text-2xl text-dark-300 mb-8 animate-slide-up">
          探索技术世界，分享编程经验
        </p>
        <div className="flex flex-wrap justify-center gap-4 mb-12 animate-slide-up">
          <span className="px-4 py-2 glass-card text-gold text-sm">React</span>
          <span className="px-4 py-2 glass-card text-gold text-sm">Node.js</span>
          <span className="px-4 py-2 glass-card text-gold text-sm">Python</span>
          <span className="px-4 py-2 glass-card text-gold text-sm">WebGL</span>
        </div>
      </div>
      <a 
        href="#articles" 
        className="absolute bottom-8 text-dark-400 hover:text-gold transition-colors animate-float"
      >
        <ChevronDown size={32} />
      </a>
    </section>
  )
}
```

- [ ] **Step 4: 创建ArticleCard组件**

```jsx
// src/components/blog/ArticleCard.jsx
import React from 'react'
import { Calendar, Eye, Heart } from 'lucide-react'

export default function ArticleCard({ article, onClick }) {
  return (
    <div 
      className="glass-card glass-card-hover p-6 cursor-pointer transition-all duration-300"
      onClick={() => onClick(article)}
    >
      <div className="flex items-center gap-2 text-sm text-dark-400 mb-3">
        <Calendar size={14} />
        <span>{article.publishDate}</span>
        <span className="px-2 py-1 bg-gold/10 text-gold rounded text-xs">{article.category}</span>
      </div>
      
      <h3 className="text-xl font-semibold mb-2 text-white hover:text-gold transition-colors">
        {article.title}
      </h3>
      
      <p className="text-dark-300 mb-4 line-clamp-2">
        {article.excerpt}
      </p>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {article.tags.slice(0, 3).map((tag, index) => (
          <span key={index} className="px-2 py-1 bg-dark-700/50 text-dark-300 rounded text-xs">
            {tag}
          </span>
        ))}
      </div>
      
      <div className="flex items-center gap-4 text-sm text-dark-400">
        <div className="flex items-center gap-1">
          <Eye size={14} />
          <span>{article.views}</span>
        </div>
        <div className="flex items-center gap-1">
          <Heart size={14} />
          <span>{article.likes}</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 创建ArticleList组件**

```jsx
// src/components/blog/ArticleList.jsx
import React, { useState, useEffect } from 'react'
import ArticleCard from './ArticleCard'

export default function ArticleList({ onArticleClick }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/articles')
      .then(res => res.json())
      .then(data => {
        setArticles(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('获取文章失败:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold"></div>
      </div>
    )
  }

  return (
    <section id="articles" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          <span className="gradient-text">最新文章</span>
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map(article => (
            <ArticleCard 
              key={article.id} 
              article={article} 
              onClick={onArticleClick}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: 创建CommentSection组件**

```jsx
// src/components/blog/CommentSection.jsx
import React, { useState, useEffect } from 'react'
import { User, Mail, MessageSquare } from 'lucide-react'

export default function CommentSection({ articleId }) {
  const [comments, setComments] = useState([])
  const [formData, setFormData] = useState({ author: '', email: '', content: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/comments/${articleId}`)
      .then(res => res.json())
      .then(data => setComments(data))
      .catch(err => console.error('获取评论失败:', err))
  }, [articleId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    
    try {
      const res = await fetch(`/api/comments/${articleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (res.ok) {
        const newComment = await res.json()
        setComments([...comments, newComment])
        setFormData({ author: '', email: '', content: '' })
      }
    } catch (err) {
      console.error('提交评论失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-12">
      <h3 className="text-2xl font-bold mb-6 gradient-text">评论区</h3>
      
      <form onSubmit={handleSubmit} className="glass-card p-6 mb-8">
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="relative">
            <User className="absolute left-3 top-3 text-dark-400" size={18} />
            <input
              type="text"
              placeholder="昵称"
              value={formData.author}
              onChange={e => setFormData({ ...formData, author: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none"
              required
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-dark-400" size={18} />
            <input
              type="email"
              placeholder="邮箱"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none"
              required
            />
          </div>
        </div>
        <div className="relative mb-4">
          <MessageSquare className="absolute left-3 top-3 text-dark-400" size={18} />
          <textarea
            placeholder="评论内容"
            value={formData.content}
            onChange={e => setFormData({ ...formData, content: e.target.value })}
            className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none h-24 resize-none"
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-gold text-dark-950 rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50"
        >
          {submitting ? '提交中...' : '发表评论'}
        </button>
      </form>

      <div className="space-y-4">
        {comments.map(comment => (
          <div key={comment.id} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
                {comment.author.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold">{comment.author}</span>
              <span className="text-dark-400 text-sm">{new Date(comment.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-dark-300">{comment.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 创建SearchBar组件**

```jsx
// src/components/blog/SearchBar.jsx
import React, { useState } from 'react'
import { Search, X } from 'lucide-react'

export default function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch(query)
  }

  const handleClear = () => {
    setQuery('')
    onSearch('')
  }

  return (
    <form onSubmit={handleSubmit} className="relative max-w-md mx-auto mb-8">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" size={20} />
      <input
        type="text"
        placeholder="搜索文章..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full pl-10 pr-10 py-3 bg-dark-800 border border-dark-600 rounded-xl focus:border-gold focus:outline-none transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-gold"
        >
          <X size={20} />
        </button>
      )}
    </form>
  )
}
```

- [ ] **Step 8: 创建useData Hook**

```javascript
// src/hooks/useData.js
import { useState, useEffect } from 'react'

export function useData(url) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error('请求失败')
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [url])

  return { data, loading, error }
}
```

- [ ] **Step 9: 提交代码**

```bash
git add src/components/layout/ src/components/blog/ src/hooks/
git commit -m "feat: 实现博客前端组件"
```

---

## Task 6: 主应用集成

**Covers:** [S4]

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 更新App组件**

```jsx
// src/App.jsx
import React, { useState } from 'react'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import Hero from './components/blog/Hero'
import ArticleList from './components/blog/ArticleList'
import ArticleDetail from './components/blog/ArticleDetail'
import SearchBar from './components/blog/SearchBar'
import PixelSnow from './components/background/PixelSnow'
import SideRays from './components/background/SideRays'
import GridOverlay from './components/background/GridOverlay'
import SplashCursor from './components/background/SplashCursor'

function App() {
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="min-h-screen bg-dark-950 relative">
      {/* 背景层 */}
      <PixelSnow />
      <SideRays />
      <GridOverlay />
      <SplashCursor />

      {/* 主内容 */}
      <div className="relative z-10">
        <Header />
        
        {selectedArticle ? (
          <ArticleDetail 
            article={selectedArticle} 
            onBack={() => setSelectedArticle(null)} 
          />
        ) : (
          <>
            <Hero />
            <div className="max-w-6xl mx-auto px-4">
              <SearchBar onSearch={setSearchQuery} />
            </div>
            <ArticleList onArticleClick={setSelectedArticle} />
          </>
        )}
        
        <Footer />
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 2: 创建ArticleDetail组件**

```jsx
// src/components/blog/ArticleDetail.jsx
import React, { useState, useEffect } from 'react'
import { ArrowLeft, Calendar, Eye, Heart, Tag } from 'lucide-react'
import CommentSection from './CommentSection'

export default function ArticleDetail({ article, onBack }) {
  const [likes, setLikes] = useState(article.likes || 0)

  const handleLike = async () => {
    setLikes(likes + 1)
    // 可以添加API调用记录点赞
  }

  return (
    <article className="min-h-screen pt-24 pb-12 px-4">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-dark-400 hover:text-gold mb-8 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>返回文章列表</span>
        </button>

        <header className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            {article.title}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-dark-400">
            <div className="flex items-center gap-1">
              <Calendar size={16} />
              <span>{article.publishDate}</span>
            </div>
            <div className="flex items-center gap-1">
              <Eye size={16} />
              <span>{article.views} 阅读</span>
            </div>
            <button 
              onClick={handleLike}
              className="flex items-center gap-1 hover:text-gold transition-colors"
            >
              <Heart size={16} />
              <span>{likes} 喜欢</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {article.tags.map((tag, index) => (
              <span 
                key={index}
                className="flex items-center gap-1 px-3 py-1 bg-gold/10 text-gold rounded-full text-sm"
              >
                <Tag size={12} />
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="glass-card p-8 mb-12">
          <div className="prose prose-invert prose-gold max-w-none">
            {article.content.split('\n').map((paragraph, index) => (
              <p key={index} className="mb-4 text-dark-200 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <CommentSection articleId={article.id} />
      </div>
    </article>
  )
}
```

- [ ] **Step 3: 测试完整应用**

```bash
npm run dev
```

- [ ] **Step 4: 提交代码**

```bash
git add src/App.jsx src/components/blog/ArticleDetail.jsx
git commit -m "feat: 完成主应用集成"
```

---

## Task 7: 管理后台

**Covers:** [S4, S6, S7]

**Files:**
- Create: `server/index-admin.js`
- Create: `admin.html`

- [ ] **Step 1: 创建管理服务器**

```javascript
// server/index-admin.js
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { authMiddleware } from './middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.ADMIN_PORT || 3033

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'admin')))

// 所有管理API需要认证
app.use('/api', authMiddleware)

// 管理文章API
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`管理服务器运行在 http://0.0.0.0:${PORT}`)
})
```

- [ ] **Step 2: 创建管理后台HTML**

```html
<!-- admin.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>博客管理后台</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #fff; }
    .container { display: flex; min-height: 100vh; }
    .sidebar { width: 240px; background: #141837; padding: 20px; border-right: 1px solid #2a2a3a; }
    .main { flex: 1; padding: 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #ffd700; margin-bottom: 30px; }
    .nav-item { padding: 12px; cursor: pointer; border-radius: 8px; margin-bottom: 8px; }
    .nav-item:hover, .nav-item.active { background: #202648; color: #ffd700; }
    .card { background: #1a1a2e; border: 1px solid #2a2a3a; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .btn { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .btn-primary { background: #ffd700; color: #0a0a0f; }
    .btn-danger { background: #ef4444; color: white; }
    input, textarea { width: 100%; padding: 12px; background: #202648; border: 1px solid #2a2a3a; border-radius: 8px; color: white; margin-bottom: 16px; }
    textarea { min-height: 200px; resize: vertical; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="logo">TechBlog Admin</div>
      <div class="nav-item active" onclick="showSection('articles')">文章管理</div>
      <div class="nav-item" onclick="showSection('comments')">评论管理</div>
      <div class="nav-item" onclick="showSection('settings')">系统设置</div>
    </div>
    <div class="main">
      <div id="articles-section">
        <div class="header">
          <h2>文章管理</h2>
          <button class="btn btn-primary" onclick="showEditor()">新建文章</button>
        </div>
        <div id="articles-list"></div>
      </div>
      <div id="editor-section" style="display:none">
        <div class="header">
          <h2 id="editor-title">新建文章</h2>
          <button class="btn" onclick="hideEditor()">返回</button>
        </div>
        <input id="article-title" placeholder="文章标题">
        <input id="article-slug" placeholder="URL别名">
        <input id="article-category" placeholder="分类">
        <input id="article-tags" placeholder="标签（逗号分隔）">
        <textarea id="article-content" placeholder="文章内容（支持Markdown）"></textarea>
        <button class="btn btn-primary" onclick="saveArticle()">保存文章</button>
      </div>
    </div>
  </div>

  <script>
    let currentEditId = null;

    async function loadArticles() {
      const res = await fetch('/api/articles');
      const data = await res.json();
      const list = document.getElementById('articles-list');
      list.innerHTML = data.articles.map(article => `
        <div class="card">
          <h3>${article.title}</h3>
          <p style="color:#888;margin:10px 0">${article.excerpt}</p>
          <div style="display:flex;gap:10px">
            <button class="btn" onclick="editArticle('${article.id}')">编辑</button>
            <button class="btn btn-danger" onclick="deleteArticle('${article.id}')">删除</button>
          </div>
        </div>
      `).join('');
    }

    function showEditor(id = null) {
      currentEditId = id;
      document.getElementById('articles-section').style.display = 'none';
      document.getElementById('editor-section').style.display = 'block';
      document.getElementById('editor-title').textContent = id ? '编辑文章' : '新建文章';
    }

    function hideEditor() {
      document.getElementById('articles-section').style.display = 'block';
      document.getElementById('editor-section').style.display = 'none';
      currentEditId = null;
    }

    async function saveArticle() {
      const article = {
        title: document.getElementById('article-title').value,
        slug: document.getElementById('article-slug').value,
        category: document.getElementById('article-category').value,
        tags: document.getElementById('article-tags').value.split(',').map(t => t.trim()),
        content: document.getElementById('article-content').value,
        excerpt: document.getElementById('article-content').value.substring(0, 100) + '...',
        publishDate: new Date().toISOString().split('T')[0],
        updateDate: new Date().toISOString().split('T')[0],
        author: '博主'
      };

      const url = currentEditId ? `/api/articles/${currentEditId}` : '/api/articles';
      const method = currentEditId ? 'PUT' : 'POST';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article)
      });

      hideEditor();
      loadArticles();
    }

    async function deleteArticle(id) {
      if (confirm('确定删除这篇文章？')) {
        await fetch(`/api/articles/${id}`, { method: 'DELETE' });
        loadArticles();
      }
    }

    loadArticles();
  </script>
</body>
</html>
```

- [ ] **Step 3: 添加admin脚本到package.json**

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"node server/index.js\" \"node server/index-admin.js\"",
    "admin": "node server/index-admin.js"
  }
}
```

- [ ] **Step 4: 提交代码**

```bash
git add server/index-admin.js admin.html
git commit -m "feat: 实现管理后台"
```

---

## Task 8: 部署配置

**Covers:** [S4]

**Files:**
- Create: `deploy.sh`
- Create: `deploy.config`

- [ ] **Step 1: 创建部署配置**

```bash
# deploy.config
REMOTE_HOST="your-server-ip"
REMOTE_USER="deploy"
REMOTE_PORT="22"
REMOTE_DIR="/opt/blog"
PUBLIC_PORT="9098"
ADMIN_PORT="3033"
VITE_BASE_PATH="/blog/"
KEEP_RELEASES="3"
SERVICE_NAME="tech-blog.service"
```

- [ ] **Step 2: 创建部署脚本**

```bash
#!/bin/bash
# deploy.sh - 博客部署脚本

set -e

# 加载配置
source deploy.config

echo "开始部署 TechBlog..."

# 本地构建
echo "构建项目..."
VITE_BASE_PATH=$VITE_BASE_PATH npm run build

# 上传到服务器
echo "上传文件..."
rsync -avz --delete \
  dist/ \
  server/ \
  src/data/ \
  package.json \
  package-lock.json \
  $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/releases/$(date +%Y%m%d_%H%M%S)/

# 远程设置
echo "配置服务器..."
ssh $REMOTE_USER@$REMOTE_HOST << 'EOF'
cd /opt/blog

# 创建新版本目录
NEW_RELEASE=$(ls -t releases | head -1)
cd releases/$NEW_RELEASE

# 安装依赖
npm install --production

# 数据迁移
if [ ! -d "../shared/data" ]; then
  mkdir -p ../shared/data
  cp -r src/data/* ../shared/data/
fi

# 创建符号链接
ln -sfn /opt/blog/shared/data server/data

# 更新current链接
ln -sfn /opt/blog/releases/$NEW_RELEASE ../current

# 重启服务
sudo systemctl restart tech-blog.service
EOF

echo "部署完成！"
echo "访问地址: https://$REMOTE_HOST$VITE_BASE_PATH"
```

- [ ] **Step 3: 添加执行权限**

```bash
chmod +x deploy.sh
```

- [ ] **Step 4: 提交代码**

```bash
git add deploy.sh deploy.config
git commit -m "feat: 添加部署配置"
```

---

## Task 9: 测试与验证

**Covers:** [S3, S6]

**Files:**
- Create: `tests/api.test.js`

- [ ] **Step 1: 创建API测试**

```javascript
// tests/api.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import express from 'express'

describe('API测试', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    // 这里可以导入实际的路由进行测试
    server = app.listen(0)
    baseUrl = `http://localhost:${server.address().port}`
  })

  afterAll(() => {
    server.close()
  })

  it('健康检查返回200', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
npm test
```

- [ ] **Step 3: 启动开发服务器测试**

```bash
npm run dev
```

- [ ] **Step 4: 浏览器测试**

访问 http://localhost:9099 测试前端
访问 http://localhost:3033 测试管理后台

- [ ] **Step 5: 提交代码**

```bash
git add tests/
git commit -m "feat: 添加测试用例"
```

---

## 执行说明

此计划包含9个任务，预计执行时间2-3小时。建议按照任务顺序执行，每个任务完成后进行验证。

**关键验证点：**
1. Task 1: 开发服务器正常启动
2. Task 3: API端点响应正确
3. Task 6: 前端页面正常显示
4. Task 7: 管理后台可访问
5. Task 9: 所有测试通过

**注意事项：**
- 确保Node.js版本>=18
- 确保端口9098、3033、9099未被占用
- 管理后台默认密码：admin123