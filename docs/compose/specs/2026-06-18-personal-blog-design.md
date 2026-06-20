# 个人博客网站设计文档

## [S1] 问题
基于现有简历网站改造为个人博客网站，主题为暗金赛博朋克风格。

## [S2] 解决方案概述
完全重构现有简历网站，保留技术栈（React + Vite + Tailwind CSS + Express），改造为技术博客网站。

## [S3] 核心需求
1. **内容类型**：技术博客
2. **主题**：暗金赛博朋克风格
3. **核心功能**：文章展示、搜索、评论、代码高亮、响应式设计
4. **技术栈**：React 18.3 + Vite 6.x + Tailwind CSS 3.4 + Express 5.2
5. **数据存储**：JSON文件
6. **部署**：保持现有部署（Bash脚本 + systemd + Nginx）

## [S4] 架构设计
### 整体架构
- **双端口架构**：公开端口9098（博客SPA + 只读API）+ 管理端口3033（SSH隧道访问）
- **SPA无路由**：单页滚动体验
- **数据持久层**：JSON文件存储，符号链接部署

### 组件设计
- **背景层**：PixelSnow、SideRays、GridOverlay WebGL特效
- **交互层**：SplashCursor、Header、SearchBar
- **主内容**：Hero、ArticleList、ArticleDetail、CommentSection、Footer
- **管理后台**：AdminPanel、ArticleEditor、CommentManager、MediaUpload

## [S5] 数据模型
### 文件布局
```
项目根/
├── src/data/                    ← 源码模板（Git跟踪）
│   ├── articles.json            ← 文章初始模板
│   └── comments.json            ← 评论初始模板
└── server/data/                 ← 持久化目录（不跟踪）
    ├── articles.json            ← 用户实际编辑的文章
    ├── comments.json            ← 用户实际编辑的评论
    ├── config.json              ← 站点配置
    └── uploads/                 ← 用户上传的图片
```

### 数据结构
1. **articles.json**：文章数据（id、title、slug、content、excerpt、category、tags、author、publishDate、updateDate、status、views、likes）
2. **comments.json**：评论数据（id、articleId、parentId、author、email、content、createdAt、status）

## [S6] API设计
### 公开API（端口9098）
- GET /health - 健康检查
- GET /api/articles - 获取文章列表
- GET /api/articles/:slug - 获取文章详情
- GET /api/search - 搜索文章
- GET /api/articles/:id/comments - 获取文章评论
- POST /api/articles/:id/comments - 提交评论

### 管理API（端口3033）
- GET/POST/PUT/DELETE /api/articles - 文章CRUD
- POST /api/upload - 图片上传
- GET/PUT /api/comments - 评论管理

## [S7] 认证机制
- **管理后台**：密码认证（环境变量配置）+ SSH隧道物理隔离
- **评论防护**：评论需审核后显示 + 防spam基础验证

## [S8] 主题设计
### 暗金赛博朋克主题
- **主背景**：#0a0a0f（深邃黑）
- **卡片背景**：#1a1a2e（深蓝黑）
- **强调色**：#ffd700（金属金）
- **字体**：Inter（英文）+ Noto Sans SC（中文）
- **特效**：WebGL三层背景 + 毛玻璃UI