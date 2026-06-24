<p align="center">
  <img src="assets/banner.svg" alt="TechBlog" width="100%">
</p>

# TechBlog - 博客服务系统

一个轻量级的博客服务系统，支持文章管理、评论、分类标签、全文搜索，采用双服务器架构实现前后端分离与权限隔离。

## 技术栈

**前端**
- React 19 + Vite 8
- Tailwind CSS 4
- Lucide React (图标)

**后端**
- Express 5
- SQLite (better-sqlite3)
- JWT 认证
- Sharp (图片处理)

## 功能

- 文章管理（Markdown 支持、草稿/发布状态）
- 评论系统（支持嵌套回复）
- 分类和标签管理
- 全文搜索 (FTS5)
- 图片上传压缩
- 双服务器架构（公开 API + 管理后台隔离）
- 可配置主题系统
- 响应式设计

## 安装

```bash
npm install
```

## 启动

**开发模式**
```bash
npm run dev
```
- 前端：http://localhost:9099
- 后端 API：http://localhost:9098

**管理后台**
```bash
npm run admin
```
- 管理界面：http://localhost:3033/admin

**生产构建**
```bash
npm run build
npm start
```

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── blog/           # 博客相关组件
│   │   └── layout/         # 布局组件
│   ├── contexts/            # React Context
│   ├── themes/              # 主题配置
│   └── utils/               # 工具函数
│
├── server/                  # 后端源码
│   ├── db/                  # 数据库 DAO
│   ├── middleware/           # Express 中间件
│   ├── routes/              # API 路由
│   └── index-admin.js       # 管理服务器
│
├── admin/                   # 管理后台静态文件
├── scripts/                 # 运维脚本
└── deploy.sh                # 部署脚本
```

## 架构说明

### 双服务器设计

- **公开服务器** (端口 9098)：对外提供只读 API 和前端页面
- **管理服务器** (端口 3033)：内部使用，提供文章 CRUD、图片上传等写操作

生产环境建议通过 SSH 隧道访问管理后台：
```bash
ssh -L 3033:127.0.0.1:3033 user@your-server
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
JWT_SECRET=你的密钥（至少32字符）
NODE_ENV=development
PUBLIC_PORT=9098
ADMIN_PORT=3033
```

## 初始化

```bash
# 创建管理员账号
node scripts/init-admin.js
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/articles | GET | 获取文章列表 |
| /api/articles/:slug | GET | 获取文章详情 |
| /api/categories | GET | 获取分类 |
| /api/tags | GET | 获取标签 |
| /api/comments/:articleId | GET/POST | 评论 |
| /api/stats | GET | 统计数据 |
| /api/auth/login | POST | 登录认证 |

## 部署

使用 `deploy.sh` 脚本进行一键部署：

```bash
./deploy.sh
```

部署脚本支持：
- 自动构建前端
- rsync 同步文件
- systemd 服务管理
- 蓝绿发布与回滚
