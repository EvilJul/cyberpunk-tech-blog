# 博客系统全面优化指南

> **用途**：供 AI Agent 逐条执行修复。每个问题给出：文件位置、当前代码、问题分析、修复方案。
> **优先级**：🔴 P0 必须立即修复 | 🟠 P1 核心功能缺失 | 🟡 P2 代码质量 | 🟢 P3 体验提升 | 🔵 P4 运维部署

---

## 一、安全维度

### SEC-01 🔴 Basic Auth 硬编码凭据（可直接获取 admin 权限）

- **文件**：`server/middleware/auth.js` 第 60-78 行
- **当前代码**：
```javascript
// 尝试 Basic Auth (用于管理后台)
if (authHeader?.startsWith('Basic ')) {
  try {
    const base64Credentials = authHeader.substring(6)
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [username, password] = credentials.split(':')
    // 简单的硬编码验证（仅用于管理后台）
    if (username === 'admin' && password === 'admin123') {
      req.user = { id: 1, username: 'admin', role: 'admin' }
      return next()
    }
  } catch (error) {}
}
```
- **问题**：任何人发送 `Authorization: Basic YWRtaW46YWRtaW4xMjM=` 即可获得管理员权限，完全绕过 JWT 和 bcrypt 密码哈希验证。这是一个**后门级漏洞**。
- **修复方案**：
  1. 删除整个 Basic Auth 分支（第 60-78 行）
  2. 所有认证统一走 JWT Bearer token
  3. 如果管理后台需要 Basic Auth，应从数据库查用户并 bcrypt.compare 验证密码

---

### SEC-02 🔴 文章增删改路由缺少鉴权（任何人可操作）

- **文件**：`server/routes/articles.js` 第 115、156、210 行
- **当前代码**：
```javascript
// 创建文章 — 无任何中间件保护
router.post('/', async (req, res, next) => { ... })
// 更新文章 — 无任何中间件保护
router.put('/:id', async (req, res, next) => { ... })
// 删除文章 — 无任何中间件保护
router.delete('/:id', async (req, res, next) => { ... })
```
- **问题**：POST/PUT/DELETE 路由没有 `authMiddleware` 和 `adminOnly`，任何匿名用户可以通过 curl 直接创建、修改、删除文章。
- **修复方案**：
```javascript
import { authMiddleware, adminOnly } from '../middleware/auth.js'

router.post('/', authMiddleware, adminOnly, async (req, res, next) => { ... })
router.put('/:id', authMiddleware, adminOnly, async (req, res, next) => { ... })
router.delete('/:id', authMiddleware, adminOnly, async (req, res, next) => { ... })
```

---

### SEC-03 🔴 评论接口无输入校验、无防刷、无 XSS 过滤

- **文件**：`server/routes/comments.js` 第 16-33 行
- **当前代码**：
```javascript
router.post('/:articleId', async (req, res, next) => {
  try {
    const newComment = CommentDAO.create({
      id: `comment-${Date.now()}`,
      articleId: req.params.articleId,
      parentId: req.body.parentId || null,
      author: req.body.author,       // 未校验是否为空
      email: req.body.email,          // 未校验格式
      content: req.body.content,      // 未校验是否为空，未限制长度，未过滤 XSS
      status: 'pending'
    })
    ...
  }
})
```
- **问题清单**：
  1. `author` 和 `content` 未校验是否为空
  2. `content` 无长度限制，可提交超大内容
  3. 无 HTML/XSS 过滤，评论内容可注入恶意脚本
  4. `email` 不校验格式
  5. 评论 ID 用 `Date.now()` 生成，高并发下可能冲突
  6. 无速率限制，可被恶意刷评论
  7. 未校验 `articleId` 对应的文章是否存在
- **修复方案**：
```javascript
import { generalLimiter } from '../middleware/rateLimit.js'

// 1. 添加评论速率限制
const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '评论过于频繁，请稍后再试' }
})

router.post('/:articleId', commentLimiter, async (req, res, next) => {
  const { author, email, content, parentId } = req.body

  // 2. 输入校验
  if (!author || !author.trim() || author.length > 50) {
    return res.status(400).json({ error: '昵称不能为空且不超过50字' })
  }
  if (!content || !content.trim() || content.length > 2000) {
    return res.status(400).json({ error: '评论内容不能为空且不超过2000字' })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' })
  }

  // 3. 校验文章存在性
  const article = ArticleDAO.findById(req.params.articleId)
  if (!article) {
    return res.status(404).json({ error: '文章不存在' })
  }

  // 4. XSS 过滤（转义 HTML 标签）
  const sanitize = (str) => str.replace(/[<>&"']/g, c =>
    ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))

  // 5. 使用 crypto.randomUUID() 生成安全 ID
  const newComment = CommentDAO.create({
    id: crypto.randomUUID(),
    articleId: req.params.articleId,
    parentId: parentId || null,
    author: sanitize(author.trim()),
    email: email || null,
    content: sanitize(content.trim()),
    status: 'pending'
  })
})
```

---

### SEC-04 🔴 统计接口无鉴权无防刷 + JSON 文件并发不安全

- **文件**：`server/routes/stats.js` 全文
- **当前代码**：
```javascript
// POST /api/stats/views — 任何人可无限刷访问量
router.post('/views', (req, res) => {
  const stats = readStats()
  stats.views += 1
  writeStats(stats)  // 并发写入会丢数据
  res.json({ views: stats.views })
})

// POST /api/stats/article/:id/likes — 任何人可无限刷点赞
router.post('/article/:id/likes', (req, res) => {
  const stats = readStats()
  stats.likes[req.params.id] = (stats.likes[req.params.id] || 0) + 1
  writeStats(stats)
  res.json({ likes: stats.likes[req.params.id] })
})
```
- **问题清单**：
  1. `readStats()` + `writeStats()` 使用 `readFileSync/writeFileSync`，两个并发请求同时读 → 同时写 → 后写的覆盖前写的，数据丢失
  2. `POST /views` 和 `POST /likes` 无任何速率限制和身份校验，可以用脚本无限刷量
  3. 数据存在 JSON 文件中而非数据库，与其他数据不一致
  4. `POST /article/:id/views` 没有校验 articleId 是否存在
- **修复方案**：
  1. **将 stats 迁移到 SQLite**（已有数据库基础设施）：
```sql
CREATE TABLE IF NOT EXISTS article_stats (
  article_id TEXT PRIMARY KEY,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS site_stats (
  key TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0
);
```
  2. 使用 SQLite 原子操作 `UPDATE ... SET views = views + 1`
  3. 点赞用 IP 或 cookie 做去重：同一 IP 对同一文章只能点赞一次
  4. 添加速率限制

---

### SEC-05 🔴 Admin 服务绑定 0.0.0.0 + 无认证 + CORS 全放开

- **文件**：`server/index-admin.js`
- **当前代码**：
```javascript
app.use(cors())  // 第 17 行：CORS 全放开，任何来源可访问
// 无任何 authMiddleware

app.listen(PORT, '0.0.0.0', () => {  // 第 112 行：绑定所有网卡
  console.log(`管理服务器运行在 http://0.0.0.0:${PORT}`)
})
```
- **问题**：管理后台在公网可直接访问，且没有任何认证中间件。虽然前端 JS 会在请求中带 token，但 API 代理层完全透传，不做服务端鉴权。
- **修复方案**：
  1. 绑定改为 `127.0.0.1`（仅本地/SSH 隧道可访问）
  2. CORS 限制为 `http://localhost:3033`
  3. 在 API 代理前添加 JWT 认证中间件
  4. 上传接口 `POST /api/upload` 也需要认证保护
```javascript
app.listen(PORT, '127.0.0.1', () => {
  console.log(`管理服务器运行在 http://127.0.0.1:${PORT}`)
})
```

---

### SEC-06 🟠 用户创建接口无鉴权保护

- **文件**：`server/routes/auth.js` 第 79-119 行
- **当前代码**：
```javascript
router.post('/users', async (req, res, next) => {
  // 检查是否是第一个用户
  const users = UserDAO.findAll()
  const isFirstUser = users.length === 0
  const userRole = isFirstUser ? 'admin' : (role || 'user')
  ...
})
```
- **问题**：第一个用户之后的注册也没有鉴权，任何人可以注册新用户。虽然角色默认是 `user`，但这仍然是未授权的用户创建。
- **修复方案**：第一个用户允许公开创建；之后的用户创建必须要求 admin 权限：
```javascript
router.post('/users', async (req, res, next) => {
  const users = UserDAO.findAll()
  const isFirstUser = users.length === 0

  if (!isFirstUser) {
    // 非首个用户，需要管理员权限
    return authMiddleware(req, res, (err) => {
      if (err) return next(err)
      return adminOnly(req, res, () => { /* 执行创建逻辑 */ })
    })
  }
  // 首个用户，公开创建为 admin
})
```

---

### SEC-07 🟠 ID 生成方式可预测且并发不安全

- **文件**：`server/routes/articles.js` 第 7-9 行、`server/routes/comments.js` 第 19 行、`server/routes/auth.js` 第 101 行
- **当前代码**：
```javascript
// articles.js
function generateId() {
  return 'article-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
// comments.js
id: `comment-${Date.now()}`  // 高并发下必然冲突
// auth.js
id: `user-${Date.now()}`
```
- **问题**：
  1. `Date.now()` 精度仅到毫秒，高并发下评论 ID 必然冲突导致数据库报错
  2. `Math.random()` 不是密码学安全的随机源
  3. ID 可预测，可被枚举
- **修复方案**：统一使用 Node.js 内置 `crypto.randomUUID()`：
```javascript
import crypto from 'crypto'
const id = crypto.randomUUID()  // 例如 "550e8400-e29b-41d4-a716-446655440000"
```

---

### SEC-08 🟡 日志接口可被用作攻击面

- **文件**：`server/routes/logs.js`
- **当前代码**：
```javascript
// POST / — 任何已认证用户可写日志（但前端 logger 需要 token，普通用户没有）
router.post('/', (req, res) => {
  const { level, message, data } = req.body
  const logEntry = `[${timestamp}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`
  fs.appendFileSync(logFile, logEntry)  // 直接拼接用户输入写入文件
})

// POST /clear — 任何已认证用户可清空日志
router.post('/clear', (req, res) => {
  fs.writeFileSync(logFile, '')
})
```
- **问题**：
  1. `message` 和 `data` 未做任何校验/长度限制，可通过超大 body 撑爆磁盘
  2. `level` 未校验，可注入任意内容
  3. `/clear` 应仅 admin 可操作
  4. 使用 `appendFileSync` 阻塞事件循环
- **修复方案**：
  1. `level` 白名单校验：`['INFO', 'WARN', 'ERROR', 'DEBUG']`
  2. `message` 限制长度 500 字符
  3. `data` 限制 JSON.stringify 后长度 2000 字符
  4. `/clear` 加 `adminOnly` 中间件
  5. 改用 `fs.appendFile`（异步）或直接写入 winston logger

---

## 二、架构维度

### ARCH-01 🔴 SPA 回退路由位于 404 处理之后（永远不生效）

- **文件**：`server/index.js` 第 117-128 行
- **当前代码**：
```javascript
// 404 处理
app.use(notFoundHandler)        // ← 第 118 行：先注册了 404

// 全局错误处理
app.use(errorHandler)           // ← 第 121 行

// SPA 回退 - 所有非API请求返回 index.html（必须放在最后）
if (fs.existsSync(distDir)) {
  app.use((req, res) => {       // ← 第 125 行：在 404 之后，永远不会被执行
    res.sendFile(join(distDir, 'index.html'))
  })
}
```
- **问题**：Express 中间件按注册顺序执行。所有未匹配的请求会先被 `notFoundHandler` 拦截并返回 404 JSON，SPA 回退代码永远无法执行。生产环境下访问任何前端路由（如 `/article/xxx`）都会返回 404 JSON 而非 index.html。
- **修复方案**：
```javascript
// SPA 回退：非 API 请求返回 index.html（必须在 404 之前）
if (fs.existsSync(distDir)) {
  app.use((req, res, next) => {
    // 仅对非 API 路径做 SPA 回退
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next()
    }
    res.sendFile(join(distDir, 'index.html'))
  })
}

// API 404 处理（仅处理 /api/* 路径）
app.use(notFoundHandler)

// 全局错误处理（必须放最后，且必须有 4 个参数）
app.use(errorHandler)
```

---

### ARCH-02 🟠 Settings 和 Theme 双重轮询同一接口

- **文件**：`src/contexts/SettingsContext.jsx` 第 25-48 行 + `src/themes/ThemeProvider.jsx` 第 10-47 行
- **当前代码**：
```javascript
// SettingsContext.jsx — 每 30 秒轮询 /api/settings
useEffect(() => {
  fetchSettings()
  const interval = setInterval(fetchSettings, 30000) // ← 定时请求
  document.addEventListener('visibilitychange', handleVisibilityChange) // ← 可见性请求
  ...
})

// ThemeProvider.jsx — 也是每 30 秒轮询同一个 /api/settings
useEffect(() => {
  fetchTheme()
  const interval = setInterval(fetchTheme, 30000) // ← 又一个定时请求
  document.addEventListener('visibilitychange', handleVisibilityChange) // ← 又一个可见性请求
  ...
})
```
- **问题**：两个 Context 各自独立地每 30 秒请求同一个 `/api/settings` 接口。每 30 秒就有 2 次冗余请求。页面可见性变化时也会触发 2 次。
- **修复方案**：将 ThemeProvider 改为从 SettingsContext 消费数据，而非自己请求：
```javascript
// ThemeProvider.jsx — 从 SettingsContext 获取 theme 数据
export function ThemeProvider({ children }) {
  const { settings, loading } = useSettings()
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    if (settings?.theme) {
      const newTheme = {
        id: settings.theme.preset || DEFAULT_THEME,
        ...settings.theme
      }
      setTheme(newTheme)
    }
  }, [settings])
  // ... 不再自己 fetch
}
```
**注意**：这要求 ThemeProvider 嵌套在 SettingsProvider 内部（当前 `main.jsx` 中已经是这个顺序）。

---

### ARCH-03 🟠 没有客户端路由 — 无法分享/收藏文章链接

- **文件**：`src/App.jsx` 全文
- **当前代码**：
```javascript
function App() {
  const [selectedArticle, setSelectedArticle] = useState(null)  // ← 用 state 管理视图

  // 点击文章 → 设置 state
  const handleArticleClick = (article) => {
    setSelectedArticle(article)
  }

  // 返回 → 清空 state
  const handleBack = () => {
    setSelectedArticle(null)
  }

  return (
    <div>
      {selectedArticle ? (
        <ArticleDetail article={selectedArticle} onBack={handleBack} />
      ) : (
        <ArticleList onArticleClick={handleArticleClick} />
      )}
    </div>
  )
}
```
- **问题**：
  1. 整个前端用 `useState` 做条件渲染，没有 URL 路由
  2. 用户无法通过 URL 直接访问某篇文章（如 `/article/my-post`）
  3. 刷新页面即丢失当前视图状态，回到文章列表
  4. 无法分享文章链接给他人
  5. 浏览器前进/后退按钮无法使用
  6. Header 组件有导航按钮（首页/文章/标签/关于）但 App 没有使用 Header，也没有对应的多视图逻辑
- **修复方案**：
  1. 安装 `react-router-dom`：`npm install react-router-dom`
  2. 重构路由结构：
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<ArticleList />} />
        <Route path="/article/:slug" element={<ArticleDetail />} />
        <Route path="/category/:name" element={<ArticleList />} />
        <Route path="/tag/:name" element={<ArticleList />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}
```
  3. ArticleDetail 从 URL 参数获取 slug 并请求文章
  4. 配合 ARCH-01 的 SPA 回退修复

---

### ARCH-04 🟡 Header 组件与 App 完全脱钩

- **文件**：`src/App.jsx`（未引入 Header）+ `src/components/layout/Header.jsx`
- **问题**：Header 组件有完整的导航按钮（首页/文章/标签/关于/搜索）和 `onNavigate` 回调，但 App.jsx 根本没有使用 Header 组件。Header 的 `currentView` 和 `onNavigate` 无处对接。Hero 组件也被导入但未使用。
- **修复方案**：引入路由（ARCH-03）后，Header 改为使用 `useNavigate` 和 `useLocation` 对接路由系统，而非 prop callback。

---

### ARCH-05 🟡 Admin 后台是 3033 行的单体 HTML 文件

- **文件**：`admin/index.html`（3033 行）
- **问题**：整个管理后台（包含 CSS、HTML、JavaScript 逻辑）全部写在一个 HTML 文件中，难以维护和扩展。文章编辑、主题管理、评论管理、设置等功能全部耦合在一起。
- **修复方案**（长期）：
  1. 将 JS 拆分到独立文件：`admin/js/articles.js`、`admin/js/themes.js`、`admin/js/settings.js`
  2. 将 CSS 拆分到 `admin/css/style.css`
  3. 或者直接改用轻量前端框架（如 Preact/Alpine.js）重写
- **当前可接受**：如果功能稳定不再频繁修改，单文件可以暂时保留。

---

### ARCH-06 🟡 Admin 服务的 API 代理存在数据格式不一致

- **文件**：`server/index-admin.js` 第 68-110 行
- **当前代码**：
```javascript
app.use('/api', async (req, res) => {
  ...
  // 转换数据格式以兼容管理后台
  if (req.url.startsWith('/articles') && req.method === 'GET') {
    if (data.data !== undefined) {
      data = { articles: data.data }  // ← 丢弃了 pagination 信息
    }
  }
})
```
- **问题**：
  1. 代理层丢弃了分页信息（pagination），管理后台无法分页浏览文章
  2. `response.json()` 如果响应不是 JSON 会抛异常（如 404 HTML 页面）
  3. 代理使用全局 `fetch`（Node 18+ 内置），但没有超时处理
  4. 上传请求走单独的 multer 处理而非代理，两套上传逻辑重复
- **修复方案**：
  1. 代理转换时保留 pagination
  2. 添加 try-catch 处理非 JSON 响应
  3. 统一上传逻辑，避免 admin 服务和 public 服务各有一套

---

## 三、前端功能维度

### FE-01 🔴 Markdown 渲染简陋且缺少代码高亮与安全过滤

- **文件**：`src/components/blog/ArticleDetail.jsx` 第 58-85 行
- **当前代码**：
```javascript
const renderContent = (content) => {
  if (!content) return null
  return content.split('\n').map((line, index) => {
    ...
    if (line.startsWith('# ')) return <h1 ...>{line.slice(2)}</h1>
    if (line.startsWith('## ')) return <h2 ...>{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 ...>{line.slice(4)}</h3>
    if (line.startsWith('- ')) return <li ...>{line.slice(2)}</li>
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) return <img ... />
    return <p ...>{line}</p>
  })
}
```
- **问题**：
  1. 仅简单按换行分割，无法解析多行 Markdown 语法（如代码块 ```` ```js ````、多行引用、列表嵌套）。
  2. 依赖 `package.json` 中的 `prismjs` 却根本没有生效。技术博客核心体验之一是代码高亮与行号、复制按钮。
  3. 不支持行内格式（粗体 `**`、斜体 `*`、行内代码 `` `code` ``、超链接 `[text](url)`、删除线 `~~` 等）。
  4. 不支持表格（GFM）、数学公式或嵌入 HTML 安全清洗。
- **修复方案**：
  引入成熟的 Markdown 渲染生态（如 `react-markdown` + `remark-gfm` + `rehype-highlight` / `rehype-prism-plus` + `rehype-sanitize`）：
```bash
npm install react-markdown remark-gfm rehype-highlight rehype-sanitize
```
```jsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import 'highlight.js/styles/github-dark.css' // 或配套赛博朋克主题样式

<div className="prose prose-invert max-w-none">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight, rehypeSanitize]}
  >
    {fullArticle.content}
  </ReactMarkdown>
</div>
```

---

### FE-02 🟠 ArticleCard 与 Sidebar 产生严重的 N+1 网络请求风暴

- **文件**：`src/components/blog/ArticleCard.jsx` 第 33-43 行、`src/components/layout/Sidebar.jsx` 第 20-59 行
- **当前代码**：
```javascript
// ArticleCard.jsx：每渲染一张卡片就发 2 个独立请求
useEffect(() => {
  fetch(`/api/stats/article/${article.id}/views`)
  fetch(`/api/stats/article/${article.id}/likes`)
}, [article.id])

// Sidebar.jsx：请求一次 /api/articles 获取文章总数，又请求一次 /api/articles 计算分类文章数量
fetch('/api/articles').then(...) // 获取总数
fetch('/api/categories').then(cats => {
  fetch('/api/articles').then(...) // 再次全量拉取文章做本地分类统计
})
```
- **问题**：
  1. 列表页若展示 10 篇文章，ArticleCard 会瞬间并发产生 20 个网络请求，严重阻塞浏览器 HTTP/1.1 队列并增加服务器并发压力。
  2. Sidebar 重复调用全量文章接口，而实际上 `/api/categories` 和 `/api/articles` 分页接口本身就自带 `count` / `pagination.total`。
- **修复方案**：
  1. 在 `server/db/articleDAO.js` 的 `findAll` 查询中，通过 `LEFT JOIN` 一次性带出 `views` 与 `likes`（或由后端批量组装），卡片直接从 `article.views` / `article.likes` 渲染。
  2. 简化 `Sidebar.jsx`，直接使用 `/api/categories` 返回的 `count` 字段，去除二次请求。

---

### FE-03 🟠 评论区缺少审核提示与评论树状层级渲染

- **文件**：`src/components/blog/CommentSection.jsx`
- **问题**：
  1. 提交评论后接口返回状态为 `status: "pending"`，但前端直接追加到列表末尾，让用户误以为审核机制未生效或评论未入库。
  2. 数据库设计支持 `parent_id`（回复楼中楼），但前端展示时没有缩进与递归树状结构，无法区分回复对象。
  3. 缺乏空数据占位与错误边界，若接口返回报错无明确 UI 提示。
- **修复方案**：
  1. 提交成功后提示：“评论已提交，审核通过后将正式显示”。
  2. 增加回复按钮，点击后设置 `parentId`，在列表中按层级缩进展示回复。

---

### FE-04 🟡 生产代码散落大量调试输出与冗余日志上报

- **文件**：`src/themes/ThemeProvider.jsx` 第 35-36、72-77、102-107 行；`src/main.jsx` 第 8-22 行；`src/utils/logger.js`
- **当前代码**：
```javascript
// ThemeProvider.jsx
console.log('🎨 useEffect 触发，准备应用主题:', { ... })
console.log('🔧 applyTheme 被调用:', { ... })

// main.jsx
window.addEventListener('error', (e) => {
  fetch('/api/logs', { ... }) // 未做频率限制与鉴权适配
})
```
- **问题**：
  1. 生产构建后控制台仍然不断打印 emoji 调试信息，显得不专业且浪费内存。
  2. `main.jsx` 捕获全局报错上报给 `/api/logs`，但 `server/routes/logs.js` 需要 token 认证（或无过滤），普通访客遇错触发时将引发二次 401 报错风暴。
- **修复方案**：
  1. 封装统一的客户端 logger，仅在 `import.meta.env.DEV` 时输出控制台。
  2. 清理 `ThemeProvider.jsx` 中的硬编码 `console.log`。
  3. 对错误上报接口做匿名鉴权隔离并加入防抖（debounce）。

---

### FE-05 🟡 缺少文章目录（TOC - Table of Contents）与回到顶部

- **文件**：`src/components/blog/ArticleDetail.jsx`
- **问题**：作为正式的技术 Blog，长文缺少右侧或悬浮目录导读，读者无法快速跳转指定章节标题，阅读体验差。
- **修复方案**：
  1. 从 Markdown 解析出的 h1, h2, h3 自动提取标题数组与锚点 ID。
  2. 在文章右侧展示目录树，监听页面滚动事件实现阅读进度高亮。
  3. 添加平滑回到顶部按钮。

---

### FE-06 🟡 浅色主题支持不完整（CSS 变量与硬编码类冲突）

- **文件**：`src/index.css`、`src/themes/index.js`、`src/components/blog/ArticleCard.jsx`
- **问题**：
  1. 组件内大量使用 Tailwind 硬编码类（如 `text-white`、`bg-dark-800`、`text-dark-400`）。
  2. 即使在 `themes/index.js` 中切换到 `minimal`（极简白），许多文字依然强制显示为白色或者深灰色背景，导致在浅色背景下看不清文字（白底白字）。
- **修复方案**：
  将写死的 `text-white`、`bg-dark-800` 改为使用 CSS 变量或 Tailwind 语义化类（例如 `text-[var(--theme-text-primary)]`、`bg-[var(--theme-surface)]`）。

---

### FE-07 🟢 缺少图片预览、图片懒加载与文章阅读时长预估

- **文件**：`src/components/blog/ArticleDetail.jsx`、`src/components/blog/ArticleCard.jsx`
- **问题**：
  1. 大图在详情页无法点击放大查看（缺少 Lightbox 功能）。
  2. 文章卡片未标注“预计阅读时长”和“字数统计”。
  3. 未设置 `loading="lazy"`，多图文章一次性加载浪费带宽。
- **修复方案**：
  1. 引入图片查看器（如 `yet-another-react-lightbox` 或自制简单遮罩层）。
  2. 计算文章字数，按每分钟 400 字计算阅读时长。
  3. 所有 `<img>` 标签补充 `loading="lazy"` 与 `decoding="async"`。

---

## 四、后端健壮性维度

### BE-01 🔴 进程退出未做 SQLite 优雅关闭，易损坏 WAL 文件

- **文件**：`server/index.js`、`server/db/index.js`
- **问题**：
  SQLite 在开启 WAL 模式 (`PRAGMA journal_mode = WAL`) 时，会生成 `-wal` 和 `-shm` 临时文件。当前服务在收到 `SIGINT` (Ctrl+C) 或 `SIGTERM` (Docker/Systemd 重启停止信号) 时，直接被系统强制 kill，没有调用 `db.close()`。如果在写入事务或 checkpoints 过程中被强制终止，极易造成数据库文件损坏或 WAL 写入丢失。
- **修复方案**：
  在 `server/index.js` 中监听退出信号，执行优雅停机：
```javascript
function gracefulShutdown(signal) {
  logger.info(`收到 ${signal} 信号，准备优雅退出服务...`)
  server.close(() => {
    logger.info('HTTP 服务器已关闭连接')
    try {
      db.close()
      logger.info('SQLite 数据库连接已安全关闭')
      process.exit(0)
    } catch (err) {
      logger.error('关闭数据库连接失败', { error: err.message })
      process.exit(1)
    }
  })

  // 超时强制退出保底（10秒）
  setTimeout(() => {
    logger.error('优雅关闭超时，强制退出')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
```

---

### BE-02 🟠 数据库与统计数据割裂（SQLite + JSON 混合存储）

- **文件**：`server/routes/stats.js`、`server/db/index.js`
- **当前代码**：
  访问量、点赞量存放在 `server/data/stats.json`，而文章实体存放在 `server/data/blog.db`。
- **问题**：
  1. 数据孤岛：获取一篇文章的统计需要先查 SQLite，再由前端或后端单独读 JSON 文件匹配。
  2. 备份困难：备份数据库时无法保证文章与点赞数的一致性快照。
  3. 当文章被删除时，JSON 文件中的统计项残留变成垃圾数据。
- **修复方案**：
  直接在 SQLite 中建立统计表，并与文章表建立外键级联关系：
```sql
CREATE TABLE IF NOT EXISTS article_stats (
  article_id TEXT PRIMARY KEY,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);
```
  在 `ArticleDAO` 中整合：
  - 文章新建时自动插入初始统计行；
  - 文章查询时自动 `LEFT JOIN article_stats` 获取阅读量和点赞量；
  - 弃用并删除 `server/routes/stats.js` 中的 JSON 读写逻辑。

---

### BE-03 🟠 文章状态筛选逻辑不完备（草稿泄露隐患）

- **文件**：`server/routes/articles.js` 第 12-41 行、`server/db/articleDAO.js` 第 94-133 行
- **当前代码**：
```javascript
// router.get('/')
const { status, ... } = req.query
const result = ArticleDAO.findAll({ ..., status })
```
- **问题**：
  1. 公共端 `/api/articles` 默认如果客户端未传 `status`，`ArticleDAO.findAll` 会把所有文章（包括 `status = 'draft'` 草稿文章）全部查出并公开返回给访客。
  2. 虽然后台管理系统需要查草稿，但同一个 API 没有区分普通请求与已登录管理员请求。
- **修复方案**：
  1. 在公共端 API 强制约束：若用户未登录管理员，强制注入 `status = 'published'`：
```javascript
// server/routes/articles.js
router.get('/', optionalAuth, async (req, res, next) => {
  const isAdmin = req.user?.role === 'admin'
  const filterStatus = isAdmin ? req.query.status : 'published'
  const result = ArticleDAO.findAll({
    ...
    status: filterStatus
  })
})
```
  2. 同理检查 `search/advanced` 路由，避免草稿文章被全文搜索索引暴露给公共访客。

---

### BE-04 🟡 分类与标签删除未清理关联关系（孤儿数据风险）

- **文件**：`server/routes/categories.js`、`server/db/otherDAO.js` 第 212-218 行
- **当前代码**：
```javascript
static delete(id) {
  const stmt = db.prepare('DELETE FROM categories WHERE id = ?')
  return stmt.run(id).changes > 0
}
```
- **问题**：
  1. 删除分类时，引用了该分类的文章其 `category_id` 会变成悬空外键（尽管由于 SQLite 默认外键若未配 `ON DELETE SET NULL`，可能直接报错导致删除失败，或者留下脏数据）。
  2. 没有提供“重命名分类/标签”的接口，用户打错字只能删了重建。
- **修复方案**：
  1. 删除分类前，在事务中把对应文章的 `category_id` 重置为 `NULL`（或设为默认“未分类”）：
```javascript
static delete(id) {
  const deleteCategory = db.transaction((catId) => {
    db.prepare('UPDATE articles SET category_id = NULL WHERE category_id = ?').run(catId)
    return db.prepare('DELETE FROM categories WHERE id = ?').run(catId).changes > 0
  })
  return deleteCategory(id)
}
```
  2. 补充 `CategoryDAO.update(id, { name, description })` 接口。

---

### BE-05 🟡 FTS5 中文分词与搜索高亮局限

- **文件**：`server/db/index.js` 第 134-140 行、`server/db/articleDAO.js` 第 10-18 行
- **问题**：
  1. SQLite 原生 FTS5 默认使用的是 `unicode61` 分词器，它按空格和标点符号切分词汇。对于连续书写的中文句子（例如“深入理解计算机系统”），如果不带空格，FTS5 无法将其拆分为词组，导致搜索中文必须精确命中完整句子或输入首尾通配符，中文检索体验较差。
  2. `articleDAO.js` 中的高亮逻辑使用了 `snippet(...)`，但遇到复杂的特殊字符可能抛出 SQLITE 异常。
- **修复方案**：
  1. 对于轻量自建博客，可在写入 FTS 虚拟表前对中文做简单的 n-gram 切词或使用纯 SQL `LIKE %query%` 作为 FTS 查不到时的后备降级策略。
  2. 完善 FTS 查询过滤，当特殊字符替换后为空时，安全回退到普通查询。

---

### BE-06 🟡 异常处理漏网之鱼与未捕获 Promise Rejection

- **文件**：`server/index.js`
- **问题**：
  当前只在 Express 层面配置了全局 `errorHandler` 中间件，但缺乏进程级别的未捕获异常监控：
  - `process.on('unhandledRejection', ...)`
  - `process.on('uncaughtException', ...)`
  一旦某些后台异步任务（如文件自动备份、定时任务）抛错，整个 Node 进程将直接挂掉。
- **修复方案**：
  在 `server/index.js` 最顶部补充：
```javascript
process.on('uncaughtException', (err) => {
  logger.error('未捕获的全局异常 uncaughtException:', { error: err.message, stack: err.stack })
})
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝 unhandledRejection:', { reason: String(reason) })
})
```

---

## 五、SEO 维度

### SEO-01 🔴 缺少 RSS / Atom Feed 订阅生成器

- **文件**：`server/index.js`、`server/routes/feed.js`（新建）
- **问题**：
  任何成熟的个人技术博客，RSS 订阅都是极客与技术同行阅读的核心入口。Footer 里写了 `<a href="#">RSS</a>` 却是空链接，没有提供任何 XML Feed 接口。
- **修复方案**：
  1. 安装 `feed` 库或手动拼接 XML：
```bash
npm install feed
```
  2. 新增路由 `GET /rss.xml` 或 `GET /api/feed.xml`：
```javascript
import { Feed } from 'feed'
import { ArticleDAO } from '../db/articleDAO.js'

router.get('/rss.xml', (req, res) => {
  const articles = ArticleDAO.findAll({ page: 1, perPage: 20, status: 'published' }).data
  const feed = new Feed({
    title: 'TechBlog',
    description: '探索技术世界，分享编程经验',
    id: req.protocol + '://' + req.get('host'),
    link: req.protocol + '://' + req.get('host'),
    language: 'zh-CN',
    updated: new Date()
  })

  articles.forEach(post => {
    feed.addItem({
      title: post.title,
      id: `${req.protocol}://${req.get('host')}/article/${post.slug}`,
      link: `${req.protocol}://${req.get('host')}/article/${post.slug}`,
      description: post.excerpt,
      date: new Date(post.publish_date || post.created_at)
    })
  })

  res.header('Content-Type', 'application/xml')
  res.send(feed.rss2())
})
```

---

### SEO-02 🟠 缺少 Sitemap.xml 与 Robots.txt 自动化生成

- **文件**：`server/index.js`、`public/robots.txt`
- **问题**：
  搜索引擎爬虫（Googlebot、Bingbot、BaiduSpider）进入站点时无法得知全站文章链接分布，也没有 `robots.txt` 声明抓取范围与 Sitemap 路径。
- **修复方案**：
  1. 静态增加 `public/robots.txt`：
```txt
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: https://yourdomain.com/sitemap.xml
```
  2. 动态路由 `GET /sitemap.xml`，遍历所有已发布的文章与分类标签，输出 XML 格式的 URL 集合。

---

### SEO-03 🟠 SPA 单页应用缺少动态 OpenGraph / Meta 标签

- **文件**：`index.html`、`src/components/blog/ArticleDetail.jsx`
- **问题**：
  1. 页面所有文章共用 `index.html` 里的硬编码标题和空描述，分享文章链接到微信、Telegram、Twitter/X 时，无法展示文章专属的标题、摘要封面图（Open Graph Protocol / Twitter Cards）。
  2. 纯客户端渲染（CSR）对不执行 JS 的搜索引擎爬虫不友好。
- **修复方案**：
  1. 引入 `react-helmet-async`，在 `ArticleDetail.jsx` 中根据文章内容动态设置：
```jsx
<Helmet>
  <title>{`${article.title} - ${settings.title}`}</title>
  <meta name="description" content={article.excerpt} />
  <meta property="og:title" content={article.title} />
  <meta property="og:description" content={article.excerpt} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={window.location.href} />
</Helmet>
```
  2. （进阶推荐）后端在 SPA 回退时，对于包含社交爬虫 User-Agent 的请求，简单在 `index.html` 模版中注入对应的 meta 标签。

---

### SEO-04 🟡 规范链接（Canonical URL）与语义化标签增强

- **文件**：`src/components/blog/ArticleDetail.jsx`、`src/components/blog/ArticleList.jsx`
- **问题**：
  缺少 `<link rel="canonical" href="...">` 防止因为多重参数（如分页、筛选参数）导致搜索引擎判定重复页面；部分标题层级跳跃（从 h1 直接跳到 h3）。
- **修复方案**：
  保持严谨的 HTML5 语义化标签（`<article>`, `<header>`, `<main>`, `<time>`），规范 canonical url。

---

## 六、运维部署维度

### OPS-01 🔴 静态资源缺少 HTTP 缓存与 ETag 控制

- **文件**：`server/index.js` 第 80-86 行
- **当前代码**：
```javascript
app.use('/uploads', express.static(uploadsDir))
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
}
```
- **问题**：
  `express.static` 默认只带弱验证，没有显式设置 `maxAge`。每次刷新网页，浏览器都会重新对几十张图片和静态资源发条件请求或重新拉取，极度浪费服务器带宽，也拖慢网页在移动端的首屏加载。
- **修复方案**：
  对 Vite 打包出来的带 hash 的 JS/CSS 文件设置长效缓存（1年），对图片设置适度缓存：
```javascript
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  immutable: false
}))

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    maxAge: '1y', // dist 下的 assets 都有 contenthash
    setHeaders: (res, path) => {
      // index.html 绝不能长效缓存，必须每次协商
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    }
  }))
}
```

---

### OPS-02 🟠 缺少 Gzip / Brotli 传输压缩

- **文件**：`server/index.js`
- **问题**：
  项目使用了 Three.js / OGL 等重量级 3D 依赖，Vite 打包出来的 vendor bundle 通常较大（通常 500KB~1MB）。Express 没有启用任何压缩中间件，全量明文下发 JS/CSS，导致国内弱网或移动端加载白屏时间过长。
- **修复方案**：
  1. 安装 `compression`：
```bash
npm install compression
```
  2. 在 `server/index.js` 路由前注入中间件：
```javascript
import compression from 'compression'
app.use(compression())
```

---

### OPS-03 🟠 缺少安全响应头保护（Helmet）

- **文件**：`server/index.js`
- **问题**：
  缺少 `Content-Security-Policy`、`X-Frame-Options`（防点击劫持）、`X-Content-Type-Options: nosniff` 等标准 HTTP 安全响应头。
- **修复方案**：
  引入 `helmet` 中间件，并微调 CSP 以允许 WebGL 与 Google Fonts 资源：
```bash
npm install helmet
```
```javascript
import helmet from 'helmet'
app.use(helmet({
  crossOriginResourcePolicy: false, // 允许跨源加载静态图片
  contentSecurityPolicy: false // 若与 WebGL inline worker/canvas 冲突可先放开，其他头正常启用
}))
```

---

### OPS-04 🟡 健康检查探针信息单一

- **文件**：`server/index.js` 第 71-73 行
- **当前代码**：
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
```
- **问题**：
  即使 SQLite 数据库已被锁死或磁盘已满，该健康检查仍然返回 200 `status: ok`，导致 Docker / Kubernetes / 负载均衡探针无法发现后端真实故障。
- **修复方案**：
  在探针中加入数据库连通性探测（`db.prepare('SELECT 1').get()`）与内存使用情况上报。

---

### OPS-05 🟡 自动化定时备份脚本健全化

- **文件**：`scripts/backup-db.sh`
- **问题**：
  现有备份脚本依赖外部手工触发，缺乏自动轮转机制（保留最近 7 天，自动清理过期备份），且直接复制运行中的 SQLite WAL 文件有产生不一致快照的风险。
- **修复方案**：
  使用 SQLite 官方推荐的在线备份命令 `sqlite3 server/data/blog.db ".backup 'server/data/backup_xxx.db'"`，并在脚本中加入 `find ... -mtime +7 -delete` 滚动淘汰。

---

### OPS-06 🟢 容器化支持（Dockerfile & docker-compose.yml）

- **问题**：
  当前项目仅支持单机本地启动，没有标准容器编排配置。自建 Blog 用户期望能够一键 `docker compose up -d` 部署。
- **修复方案**：
  编写多阶段构建的 `Dockerfile`（Node 22 Alpine + better-sqlite3 编译环境）与 `docker-compose.yml`，持久化挂载 `./data` 目录。

---

## 七、修复执行路线图（Roadmap & Checklists）

| 阶段 | 周期 | 核心任务列表 | 交付成果与验收标准 |
|:---|:---|:---|:---|
| **第一阶段：封堵严重安全漏洞** | 1~2 天 | 1. 移除 `auth.js` 中的 Basic Auth 硬编码漏洞 (SEC-01)<br>2. 给文章 POST/PUT/DELETE 挂载鉴权中间件 (SEC-02)<br>3. 评论接口增加字段校验、XSS 过滤与频率限制 (SEC-03)<br>4. 限制 Admin 监听 `127.0.0.1` 隔离公网 (SEC-05)<br>5. 替换可预测 ID 为 `crypto.randomUUID()` (SEC-07) | 匿名无法写文章；Basic Auth 无法提权；评论无法注入 XSS；渗透测试无未授权写接口 |
| **第二阶段：修复架构硬伤与路由** | 2~3 天 | 1. 调整 Express SPA 回退顺序解决 404 (ARCH-01)<br>2. 引入 `react-router-dom` 改造为规范路由 (ARCH-03)<br>3. 将文章详情、分类、关于页与 Header 全面接通 (ARCH-04)<br>4. 合并 Theme 与 Settings 的重复请求 (ARCH-02) | 任意文章支持链接直达、刷新不掉、支持前进后退、控制台不再出现重复 30s 轮询 |
| **第三阶段：打磨内容核心体验** | 3~4 天 | 1. 升级为标准 GFM Markdown 引擎 + 代码语法高亮 (FE-01)<br>2. 修复 ArticleCard N+1 请求风暴 (FE-02)<br>3. 添加文章目录 TOC 与平滑滚动 (FE-05)<br>4. 修复浅色主题下的样式错乱 (FE-06)<br>5. 完善评论审核提示与楼中楼渲染 (FE-03) | 能够舒适阅读长篇技术代码文章；无请求堆积；暗/亮色切换无白底白字 |
| **第四阶段：数据层与后端稳健化** | 2 天 | 1. 实现 SQLite 进程退出优雅关闭 (BE-01)<br>2. 将 stats.json 彻底迁移合并进 SQLite (BE-02/SEC-04)<br>3. 修复分类/标签级联清理与文章草稿越权 (BE-03/BE-04)<br>4. 补充进程级未捕获异常监控 (BE-06) | 重启/终止不丢数据；数据存储单一化且具备事务一致性；后台不再报错崩溃 |
| **第五阶段：SEO 与生产运维加固** | 2 天 | 1. 实现 RSS 订阅接口 `rss.xml` (SEO-01)<br>2. 生成 `sitemap.xml` 与 `robots.txt` (SEO-02)<br>3. 开启 `compression` 开启 gzip 压缩 (OPS-02)<br>4. 设置合理的静态资源 HTTP 缓存头 (OPS-01)<br>5. 编写一键 Docker 部署配置 (OPS-06) | RSS 阅读器正常拉取更新；Lighthouse 性能与 SEO 评分大幅提升；一键拉起部署 |




