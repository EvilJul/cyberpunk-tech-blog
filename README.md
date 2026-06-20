# 赛博朋克技术博客

一个带 WebGL 特效的技术博客系统，使用 React + Express + SQLite 构建。

## 技术栈

**前端**
- React 19
- Vite 8
- Tailwind CSS 4
- Three.js / OGL (WebGL)
- Framer Motion

**后端**
- Express 5
- SQLite (better-sqlite3)
- JWT 认证
- Sharp (图片处理)

## 功能

- 文章管理（Markdown 支持）
- 评论系统
- 分类和标签
- WebGL 动态背景（粒子雪花、光线效果）
- 响应式设计
- 图片上传压缩
- 全文搜索

## 安装

```bash
npm install
```

## 启动

**开发模式**
```bash
npm run dev
```
前端：http://localhost:9099
后端：http://localhost:9098

**管理后台**
```bash
npm run admin
```
管理界面：http://localhost:3033/admin

**生产构建**
```bash
npm run build
npm start
```

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── background/      # WebGL 背景组件
│   │   ├── blog/           # 博客相关组件
│   │   └── layout/         # 布局组件
│   ├── contexts/            # React Context
│   ├── hooks/              # 自定义 Hooks
│   ├── themes/              # 主题配置
│   ├── plugins/             # 插件系统
│   └── utils/               # 工具函数
│
├── server/                  # 后端源码
│   ├── db/                  # 数据库 DAO
│   ├── middleware/           # Express 中间件
│   ├── routes/              # API 路由
│   └── utils/               # 工具函数
│
├── admin/                   # 管理后台静态文件
├── scripts/                 # 运维脚本
└── plugins/                 # 外部插件
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
JWT_SECRET=你的密钥（至少32字符）
NODE_ENV=development
PUBLIC_PORT=9098
ADMIN_PORT=3033
CORS_ORIGIN=http://localhost:9099
```

## 初始化

```bash
# 创建管理员账号
node scripts/init-admin.js

# 数据库备份
./scripts/backup-db.sh

# 健康检查
./scripts/health-check.sh
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/articles | GET | 获取文章列表 |
| /api/articles/:id | GET | 获取文章详情 |
| /api/categories | GET | 获取分类 |
| /api/tags | GET | 获取标签 |
| /api/comments | GET/POST | 评论 |
| /api/stats | GET | 统计数据 |

认证接口：`/api/auth/login`
