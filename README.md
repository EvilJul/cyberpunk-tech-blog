<p align="center">
  <img src="assets/banner.svg" alt="Bolg" width="100%">
</p>

# Bolg - 博客服务系统

一个轻量级的博客服务系统，支持文章管理、评论、分类标签、全文搜索，采用同源单 Web 服务提供读者站点与作者工作区。

## 技术栈

**前端**

- React 19 + Vite 8
- Tailwind CSS 4
- Lucide React (图标)

**后端**

- Express 5
- SQLite (better-sqlite3)
- 可撤销 Cookie 会话与 CSRF；旧 JWT 过渡兼容
- Sharp (图片处理)

## 功能

- 文章管理（Markdown 支持、草稿/发布状态）
- 评论系统（支持嵌套回复）
- 分类和标签管理
- 全文搜索 (FTS5)
- 图片上传压缩
- 同源作者工作区、独立工作副本与显式发布
- 可配置主题系统
- 响应式设计
- 作者管理（评论审核、媒体库、头像裁剪、主题导入导出、账号与日志）
- 发布集成（独立密钥、权限范围、外部文章同步、幂等重试与调用审计，默认关闭）

## 安装

需要 Node.js 22.12 或更高版本；容器固定使用 Node 22.22.1。在仓库根目录执行：

```bash
npm ci
cp .env.example .env
```

在 `.env` 中填写独立随机 `JWT_SECRET`，可用以下命令生成；不要将 `.env` 提交到仓库：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 启动

**开发模式**

```bash
npm run dev
```

- 浏览器打开 http://localhost:9099，首页、登录和工作台均使用此地址。
- Vite 将 API 和上传请求代理到 9098；开发期两个进程用于热更新，无需打开独立管理端。

**作者工作区**

首次空库安装先完成下方“首次安装与已有账号”。已有账号可从首页“登录”或 http://localhost:9099/login 进入 `/studio`；文章页提供编辑入口。

工作台包含文章、分类、标签、评论审核、媒体、站点设置、外观、账号和日志。**保存草稿只更新工作副本，点击发布才改变公开内容**；版本冲突时保留输入并提示比较、重载或另存。

本地 HTTP 设置 `SESSION_COOKIE_SECURE=false`；生产 HTTPS 必须为 true。

**旧管理后台（短期兼容）**

```bash
npm run admin
```

- 管理界面：http://localhost:3033/

**生产构建**

```bash
npm run build
npm start
```

构建后由一个 Web 服务在 http://localhost:9098 提供首页、`/login`、`/studio`、API 和上传。修改后端或 `.env` 后需重启服务；修改前端后需重新构建。

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── blog/           # 博客相关组件
│   │   ├── layout/         # 读者布局组件
│   │   └── studio/         # 作者工作台与集成管理
│   ├── contexts/            # React Context
│   ├── themes/              # 主题配置
│   └── utils/               # 工具函数
│
├── server/                  # 后端源码
│   ├── db/                  # 数据库 DAO 与增量迁移
│   ├── middleware/           # Express 中间件
│   ├── routes/              # API 路由
│   ├── services/            # 共享文章、会话、首装与发布业务
│   ├── index.js             # 同源 Web 服务
│   └── index-admin.js       # 可选旧管理服务器
│
├── admin/                   # 兼容期旧管理界面
├── scripts/                 # 运维脚本
├── tests/                   # 隔离 API 与浏览器验收
├── docs/                    # 接入、迁移与运维说明
├── openspec/                # 主规格及归档变更
├── Dockerfile               # 多阶段生产镜像
├── docker-compose.yml       # 默认 Web 与每日备份服务
└── deploy.sh                # 部署脚本
```

## 架构说明

### 单入口与兼容管理

- **Web 服务** (端口 9098)：读者页、登录、作者工作区、API 和上传同源；`npm start` 只启动此服务。
- **旧管理服务器** (端口 3033)：仅短期兼容 JWT；Compose 需显式 `--profile legacy-admin`，宿主仅回环绑定。新工作区不用旧端口授权。

若临时启用旧 3033 管理端，建议仅通过 SSH 隧道访问；新 `/studio` 使用站点 HTTPS 地址：
```bash
ssh -L 3033:127.0.0.1:3033 user@your-server
```

## 环境变量

完整字段见 [.env.example](.env.example)，常用配置如下：

| 配置 | 用途 |
| --- | --- |
| `JWT_SECRET` | 独立随机签名密钥；已有站点升级时保留原值 |
| `PUBLIC_PORT` | Web 服务端口，默认 9098 |
| `SITE_URL` | 公开站点地址，用于 canonical、RSS 和 Sitemap |
| `SESSION_COOKIE_SECURE` | 本地 HTTP 为 false，生产 HTTPS 为 true |
| `BLOG_DATA_DIR` | 持久数据目录；本机默认 `server/data/`，Compose 使用卷内 `/app/data` |
| `PUBLISHING_API_ENABLED` | 默认 false；显式启用机器发布 API 与密钥创建 |
| `LEGACY_JWT_ENABLED` | 默认 true；旧调用方全部迁移后再关闭 |
| `VITE_BASE_PATH` | 部署前缀，默认 `/`；改动后重新构建并保持服务配置一致 |

## 首次安装与已有账号

**仅空用户库**需要初始化。在与 Web 服务相同的环境和数据目录运行：

```bash
node scripts/create-setup-token.js
```

打开开发地址 `/setup`（生产为站点地址加 `/setup`），输入 CLI 显示的一次性 token，自行设置管理员账号和密码。token 30 分钟有效，重新生成会废弃旧 token；不要放进 URL 或共享日志。没有默认账号密码，也不开放公众注册。

已有账号直接在 `/login` 登录，升级不会重建账号或重置密码。`node scripts/init-admin.js` 保留为可信本机初始化的替代入口。迁移、数据备份与异常账号处理见 [迁移与首装](docs/author-workspace-migration.md)。

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/articles | GET | 获取文章列表 |
| /api/articles/:slug | GET | 获取文章详情 |
| /api/categories | GET | 获取分类 |
| /api/tags | GET | 获取标签 |
| /api/comments/:articleId | GET/POST | 评论 |
| /api/stats/views | GET/POST | 站点访问统计（写入限流） |
| /rss.xml | GET | 已发布文章订阅 |
| /sitemap.xml | GET | 已发布内容站点地图 |
| /robots.txt | GET | 抓取规则 |
| /api/session/login | POST | 浏览器会话登录 |
| /api/session/me | GET | 当前会话与 CSRF 信息 |
| /api/session/logout | POST | 撤销当前会话，要求 CSRF |
| /api/setup/status | GET | 查询是否需要首装 |
| /api/setup/complete | POST | 使用有效本机 token 完成空库首装 |
| /api/studio/* | 按资源定义 | 管理员会话接口；写请求要求 CSRF |
| /api/v1/* | 按协议定义 | 独立集成 Bearer 接口，默认关闭 |
| /api/auth/login | POST | 旧 JWT 过渡登录 |

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

## 生产容器与恢复

运行环境使用 Node 22.22.1，满足 Vite 8 并兼容 better-sqlite3 原生模块。先复制 `.env.example` 到 `.env`，生成 JWT_SECRET，配置 SITE_URL、CORS 白名单及可信代理；数据根目录由 BLOG_DATA_DIR 指定。

```sh
cp .env.example .env
# 编辑 .env，填写随机 JWT_SECRET 和站点地址
docker compose up -d --build
docker compose ps
```

Compose 默认启动 public 和每日 backup（无监听端口），以非 root 用户运行并共享持久数据卷。唯一 Web 端口默认 9098；旧管理界面仅在 `docker compose --profile legacy-admin up -d` 显式启用后通过 http://127.0.0.1:3033/ 访问。重建容器保留卷；不要使用 `docker compose down -v` 删除数据。

全新容器空库在服务启动后执行以下命令，再打开站点 `/setup`：

```sh
docker compose exec public node scripts/create-setup-token.js
```

在线备份使用 `node scripts/backup-db.js`，经完整性校验和原子落盘后保留最近七天。恢复到全新目录：`node scripts/restore-db.js <快照文件> <新目录>`。备份验证入口为 `node --test tests/backup.test.js`，仅使用临时数据。

SQLite 快照不包含上传图片和 `settings.json`；整站恢复需匹配的文件备份，不能只恢复数据库。

完整配置、systemd 每日调度、容器重建验收、上传归档、恢复演练及统计迁移/回滚步骤见 [运维说明](docs/operations.md)。旧 `deploy.sh` 是独立的宿主发布路径；生产配置与数据保护要求仍以运维说明为准。

## 验收测试

```sh
npm ci
npm exec -- playwright install chromium
npm run build
npm test
```

`tests/*.test.js` 覆盖首装与会话、草稿/公开快照隔离、发布集成权限与幂等、作者管理、子路径、读者交互、迁移和备份恢复。测试使用临时 SQLite/上传目录，不依赖已有博客数据；浏览器证据输出到 `test-results/`。仅检查公共服务可运行 `npm run test:platform`。历史根目录 smoke 脚本不作为唯一验收入口。

## 发布集成与迁移

机器 API 默认关闭：`PUBLISHING_API_ENABLED=false`；`LEGACY_JWT_ENABLED=true` 保留旧调用方过渡。只有共享文章服务、会话和发布接口验收后才显式启用机器 API；所有旧调用方迁移且观察窗口无旧请求后才停用 JWT，不因升级更换 JWT_SECRET。

接入步骤：

1. 在目标环境设置 `PUBLISHING_API_ENABLED=true`，重启进程；Compose 需重新创建服务以加载环境配置。
2. 管理员登录 `/studio/integrations`，创建集成，按需选择读、写、发布及媒体权限，设置密钥有效期。
3. 将只显示一次的密钥交给中台安全保存，先调用 `/api/v1/connection` 检查连接。
4. 按外部文章编号保存草稿，携带幂等键和版本条件；发布是独立动作。遇到 412 先读取最新版本并合并，不能盲目覆盖。

集成只能操作自身来源文章，不能管理账号或全站设置；轮换密钥保留原来源关系。本站提供发布目标接口，多平台分发逻辑由未来中台实现。

- [发布 API 中文接入指南](docs/api/publishing-v1.md)
- [OpenAPI 3.1](docs/api/publishing-v1.openapi.yaml)
- [账号、草稿、首装与回滚说明](docs/author-workspace-migration.md)

作者工作区与发布集成已完成本地验收并归档；2026-11-09 的完整验收为96项测试通过，含独立容器重建及备份恢复。这是对应代码版本的历史结果，详见 [实施验收记录](docs/implementation-verification.md)；不代表已经部署生产或迁移真实业务数据。
