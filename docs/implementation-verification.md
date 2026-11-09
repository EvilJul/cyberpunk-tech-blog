# 博客平台实施验收

以下首段保留 harden-blog-platform 当时的验收结果；作者工作区与发布集成的最终结果见文末。

日期：2026-11-09。对应变更：`openspec/changes/archive/2026-11-09-harden-blog-platform/`。

## 实施与验证范围

全部 37 项任务已按安全、导航、数据、阅读、SEO、运维分工实施并集成。初始逐项事实见 [优化审计](optimization-audit.md)，该审计保留了早期各代理验证范围；本文件记录最终集成结果。代码已在本地工作区修改，未提交、发布或迁移真实业务数据。

## 可复现检查

- `npm run build`：通过；文章详情已单独懒加载。主包约 975 KB（gzip 270 KB），构建仍报告大块体积提示，后续可继续拆分 WebGL 等依赖。
- `npm test`：34 项通过、0 失败，包含子测试。测试使用临时数据库、上传目录和回环服务，不依赖仓库业务库。
- 权限：Basic 拒绝、JWT 签名/过期/算法校验、数据库角色撤销、首用户竞态、文章和上传写保护、草稿隐藏。
- 数据：SQLite 并发递增、持久点赞去重、安全整数边界、分类标签事务与故障回滚、中文搜索、统计迁移校验及源文件移除后幂等重跑。
- 服务：未知 API/资源保持 404，文章深链接及带点号 slug 可刷新，数据库探针故障返回 503，信号与致命异常受控退出。
- 浏览器：真实 Chromium 检查文章导航/刷新/历史、GFM 表格/代码高亮/复制、XSS 不执行、目录唯一锚点、图片 Escape 与焦点恢复、评论待审和回复树、单次设置刷新、10 卡片零逐卡统计请求。
- 子路径：独立构建 `/blog/` 产物，在实际浏览器联合验证资源、API 前缀、文章导航刷新与 canonical；覆盖同源模块 Origin 请求。
- 主题：桌面与手机明暗截图已生成并检查；深色整页背景保持可读，未发现水平溢出及正常交互的运行时/CORS/CSP 错误。
- SEO：原始 HTTP HTML 包含文章元信息与 canonical，RSS 最近 20 篇、Sitemap 完整发布文章集合、robots 链接正确且不泄露草稿。
- `npm audit fix`：仅兼容范围更新，无 force；报告 0 个已知漏洞。
- `openspec validate harden-blog-platform --strict`（归档前）、`openspec validate --all --strict`（归档后）与 `git diff --check`：通过。

## 容器与恢复

使用独立 `bolg-acceptance` 项目、临时测试环境文件和独立命名卷构建、启动与重建。公开服务和管理服务健康，进程 UID 1000，管理端口仅宿主 `127.0.0.1` 发布。通过 HTTP 创建测试管理员/文章、检查匿名写入拒绝和统计，重建后文章和统计保留。容器内在线备份成功，在新目录恢复并通过完整性和文章读取检查。测试上传文件也位于持久卷；最终重建后核对后清理独立测试容器与测试卷。

真实环境的每日任务安装、域名/代理配置、生产迁移和发布没有执行，按 [运维说明](operations.md) 进行。管理界面原有“评论管理开发中”占位保持原状，本次实现公开评论安全提交、审核状态提示及已审核回复展示，未宣称交付新的后台审核界面。统计防刷窗口为单进程内存限流，点赞去重由 SQLite 持久化。

## 浏览器证据

截图和 JSON 位于被 Git 忽略的 `test-results/frontend-acceptance/`，可重新运行测试生成：

- `desktop-dark.png`、`desktop-light.png`
- `mobile-dark.png`、`mobile-light.png`
- `image-preview.png`、`evidence.json`、`report.md`


## 作者工作区与发布集成（2026-11-09）

对应 `unify-author-workspace`（32项）和 `add-publishing-integrations`（25项）。使用多 agent 按身份、文章、前端管理、发布接口、运维文档分工实施，并独立审查权限与协议。最终工作区基于 Git `c9017c0`，包含既有未提交改动；没有提交、推送、生产部署或迁移真实业务数据。受测131个代码/测试/配置文件摘要：`5933b703196080fae6b81a8d4279bfb9e32723a6e568052490779edbab549ff1`，清单口径见 `test-results/two-changes-source.json`。

### 实际执行

- `npm run build`：退出0；主包约956KB/gzip264KB，仍有大包提示。
- `npm test`：**96通过、0失败、0跳过**；包括真实 Chromium 作者/管理/集成流程、子路径、移动端及原背景/整卡/Markdown/SEO回归。日志：`test-results/two-changes-{build,tests}.log`。
- 真实后端作者流程覆盖登录→草稿→发布→公开阅读→仅存新草稿→冲突恢复/再发布→评论审核→退出。管理UI10个子场景、集成UI5个子场景均通过，浏览器错误为空。
- `/blog/` 独立构建验证Cookie Path、UI写作/发布、媒体前缀与设置CSRF；根路径携带有效会话仍404。
- 身份/数据覆盖一次性本地首装、并发、过期与撤销、跨源拒绝、密码变更竞态、事务CAS与故障回滚、公开快照隔离、旧账号哈希和链接保留。发布覆盖来源/权限隔离、幂等、媒体、轮换与撤销。
- OpenAPI3.1全部117处局部引用解析通过；临时契约探针仅覆盖已列明schema子集，不代表完整OpenAPI认证。最终严格分类编号与前置CORS安全DTO回归通过，历史公开版本语义已对齐。

### 容器与恢复

使用独立 `bolg-unified-acceptance` 项目和测试卷，最终镜像构建、重建通过。默认仅public+backup，唯一宿主Web端口19098（验收映射），UID1000；无3033。重建前后逐表内容摘要一致，保留1个测试账号、2篇文章、1份工作副本、1个来源映射、1把密钥、2个会话和2份幂等记录；背景文件、设置和原会话有效。

在线快照恢复到全新目录，`integrity_check=ok`、外键检查为空，逐表摘要一致。另复制对应测试上传与设置，启动恢复副本，实际验证健康、原公开正文、背景、站点设置与匿名拒绝。恢复探针首次因先取样再查询会话导致活动时间变化而比较失败；改为查询后取备份基线，再重建/备份/恢复验证通过，未修改应用代码。

发布开关回退也已实测：关闭时v1返回404，登录页与studio保护保留；再次启用后要求机器凭据，关闭前后及重启后逐表/文件摘要均一致。

每日backup进程随默认Compose启动，并实际触发同一在线备份实现；未等待24小时调度。快照不含上传和设置，完整恢复仍须匹配文件副本。证据：`test-results/two-changes-container.json`。

### 交付与兼容边界

`/login` 与 `/studio` 使用同一网站地址；生产只需 `npm start` 的一个Web服务。`PUBLISHING_API_ENABLED=false` 为默认；启用后从 `/studio/integrations` 创建专用凭据。没有连接真实中台，也没有自动分配历史文章归属。

旧JWT调用清单：仓库旧 `admin/js/auth.js`、`admin/js/core.js`、文章及上传模块仍属legacy调用方，`npm run admin`/Compose `legacy-admin` 是兼容入口；外部调用方尚未盘点，不能推断为空。`LEGACY_JWT_ENABLED=true` 保留，关闭须完成逐调用方迁移及约定观察窗口无旧请求；日志只统计legacy事件，不存凭据。浏览器退出仅撤销会话，密码修改才使旧JWT版本失效。

截图见 `test-results/author-workspace/`、`studio-management-ui/`、`studio-integrations-ui/`；头像裁剪像素和主题JSON扩展字段已实际验收。第3项主页视觉方案仍待讨论。本地现有进程需要重启才能加载新后端；真实数据迁移/停写和上线按 [迁移说明](author-workspace-migration.md) 执行。


最终归档：`openspec/changes/archive/2026-11-09-unify-author-workspace/`（32/32）与 `2026-11-09-add-publishing-integrations/`（25/25），先A后B同步9个能力规格，无冲突；归档命令的“超过10个delta可考虑拆分”是非阻塞建议。隔离测试容器、网络、卷和含测试凭据的临时文件已清理，镜像保留于本机；实际站点未重启。

归档后 `openspec validate --all --strict`：12个主规格全部通过；`git diff --check`通过；当前活动change为空。最终源码摘要与96项测试时一致。
