# 生产运行、备份与恢复

## 配置与数据

使用 Node 22.22.1（满足 Vite 8 的 >=22.12 要求），Docker 构建与运行均使用 Debian bookworm/glibc 和相同 Node ABI。构建阶段安装 python3/make/g++ 以支持 better-sqlite3 原生依赖，运行镜像仅保留生产依赖，以 UID/GID 1000 运行。

复制 `.env.example` 到 `.env`，生成随机 JWT_SECRET，设置 SITE_URL 为真实公开 HTTPS 地址。CORS_ORIGIN 是公开 API 允许的浏览器来源，ADMIN_CORS_ORIGINS 是管理界面允许来源，均为逗号分隔的精确 origin。域名或端口变化时同步调整。CORS 不代替身份、CSRF 与来源校验。新工作区使用同源会话，3033 白名单只供兼容管理台。

TRUST_PROXY 留空表示不信任代理；反向代理部署仅填实际代理 IP/CIDR，不能使用无限信任配置。代理应覆盖来自客户端的转发头。SITE_URL 用于 canonical、RSS、Sitemap，不从请求 Host 推断。VITE_BASE_PATH 同时传入构建阶段与服务运行环境；子路径部署例如设为 /blog/，SITE_URL 则包含 /blog，生产页面、API、上传和 Cookie Path 必须与此前缀一致；Vite 开发代理保留前缀及原 Origin，避免改变 CSRF 来源。修改后需重建镜像。

BLOG_DATA_DIR 是持久数据根目录，包含 blog.db（及在线 WAL/SHM）、uploads、logs、backups。宿主部署推荐 `/var/lib/blog`，目录归运行用户所有。BLOG_BACKUP_DIR 可单独指定备份目录。Compose 固定映射命名卷到 `/app/data`，不把宿主 BLOG_DATA_DIR 路径带入容器；卷内同时保留数据库、上传、设置、日志、备份。文件日志在 logs/，容器 stdout 日志另有大小轮转。不要将数据库、上传、日志、密钥打包进镜像或 Git。

## 容器启动与核对

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 public backup
curl --fail http://localhost:9098/health
curl --fail http://localhost:9098/login
```

默认仅 public Web 服务与无端口 backup，每日备份继续默认启用。旧 admin 仅显式运行 `docker compose --profile legacy-admin up -d` 才启动，通过 `PUBLIC_API_URL=http://public:9098` 访问公开服务。容器内管理监听 0.0.0.0，宿主固定只发布 `127.0.0.1:3033`；本机直接运行默认 ADMIN_HOST=127.0.0.1。远程管理使用 `ssh -L 3033:127.0.0.1:3033 user@host`。public 健康检查探测数据库 `/health`，admin 探测静态入口；后者只证明进程可用，需另外核对公开服务健康和登录。backup 独立进程启动立即备份，其后每 24 小时备份，失败打印错误并非零退出，由重启策略重试；备份任务同时将结构化记录追加到卷内 logs/backup.log，重建后保留；由宿主 logrotate 管理该日志大小。监控日志和最新成功快照时间，失败时报警。

重建验收应使用独立测试项目和测试内容：记录文章/上传及统计数，执行 `docker compose up -d --build --force-recreate`，重新检查数据、探针、匿名管理请求拒绝，并确认默认只有9098端口（无3033），显式兼容 profile 才有宿主回环管理映射。普通 `docker compose down` 保留命名卷；`down -v` 会删除全部持久数据，不用于重建。现有宿主 bind mount 若替换命名卷，需预先设置 UID/GID 1000 的目录权限。

## 在线备份与每日调度

```sh
# 宿主：从 .env 读取 BLOG_DATA_DIR / BLOG_BACKUP_DIR
node scripts/backup-db.js
# 容器：复用同一卷、同一原生依赖
 docker compose run --rm --no-deps backup node scripts/backup-db.js
```

备份打开只读源连接，通过 better-sqlite3 `.backup()` 获取包含已提交 WAL 数据的一致快照；临时文件经 integrity_check、foreign_key_check、fsync 后同目录原子重命名并同步目录。失败不会发布半成品或开始轮转。每次成功只清理备份目录内本工具 `blog-<UTC时间>-<UUID>.db` 命名、超过七天的普通文件；不跟随符号链接，不删除未知文件及源库。保留期按文件名中创建时间计算，无成功备份则不清理历史。不要用 cp 在线复制 SQLite 主文件。

宿主 systemd 示例在 scripts/blog-backup.service 和 scripts/blog-backup.timer。创建 blog 用户、安装项目到 `/opt/blog`、创建 `/var/lib/blog` 并授权，将环境配置写入 `/etc/blog.env`（BLOG_DATA_DIR=/var/lib/blog），按实际 Node 路径调整 ExecStart；如自定义备份路径还需更新 ReadWritePaths。将两个 unit 安装到 `/etc/systemd/system/` 后执行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now blog-backup.timer
systemctl list-timers blog-backup.timer
journalctl -u blog-backup.service
```

每天 03:15 左右执行，错过时间会补执行。容器与宿主调度选择一个即可。数据库快照不包含上传文件和设置 JSON；需要完整站点恢复时，应停止写入并归档整个数据目录，同时另存应用版本及配置。备份仍在同卷，必须定期复制到独立介质或远端并验证可恢复性。

## 恢复演练与上线恢复

```sh
node scripts/restore-db.js /absolute/path/snapshot.db /tmp/blog-restore-new
# 容器内演练，目标必须不存在；完成后目录留在数据卷内供检查
 docker compose run --rm --no-deps backup node scripts/restore-db.js /app/data/backups/快照.db /app/data/restore-drill-new
```

恢复命令先校验快照，仅允许全新目标目录；拒绝覆盖现有文件，避免旧 WAL/SHM 回放。复制到临时文件，再校验、同步、原子发布 blog.db。演练在临时目录核对文章/统计、外键及已提交内容，不连接真实服务。新增测试只运行 `node --test tests/backup.test.js`，使用系统临时目录，覆盖 WAL 持续写入、恢复、轮转边界和损坏文件拒绝。

真实恢复先停止 public/admin/backup 及宿主 timer，保留当前整个数据目录；用上述命令恢复到新的目录，然后配齐对应时点的上传、设置等文件。宿主将 BLOG_DATA_DIR 切至新目录；容器在服务停写状态下由运维将已验证目录切换到挂载卷，恢复 UID/GID 1000 权限。不可把新 blog.db 直接盖到仍含旧 WAL/SHM 的在线目录。启动后核对健康、登录、文章、上传、统计。恢复到快照时点之后的写入会丢失，需明确恢复窗口。

## 统计迁移与回滚

升级前停止写入，运行在线备份并保存原 stats.json、整站数据目录和旧应用版本。先在 BLOG_DATA_DIR 指向的一次性副本上执行新版本的数据初始化/统计迁移流程；核对站点访问量、逐文章浏览/点赞总数、外键和迁移标记，再重跑确认不累加。异常数据应生成报告并阻止切换，不能静默归零。显式统计迁移入口（环境变量在命令行设置，不依赖脚本读取 .env）：

```sh
BLOG_DATA_DIR=/absolute/path/disposable-data node scripts/migrate-stats.js
# 重跑应返回 skipped: true，不累加计数
BLOG_DATA_DIR=/absolute/path/disposable-data node scripts/migrate-stats.js
```

源文件默认是数据目录的 stats.json，可作为最后一个参数显式传入。工具在 `migration-backups/<时间-UUID>/` 保存 JSON、在线数据库快照及失败时的 validation-errors.json。服务启动不自动读取历史 JSON。副本验收完成后，在实际停写窗口用生产数据目录显式执行同一命令，再启动新版。`scripts/migrate-to-sqlite.js` 是旧内容迁移工具，不能当作统计迁移命令。

成功后仅 SQLite 作为在线统计来源，保留 JSON 作审计与回滚材料。若新版本异常，停止所有写入，使用同一时点应用版本及完整备份恢复；如需保留升级后的统计，先由数据模块导出旧版兼容 JSON 并核对再降级。禁止在生产在线库上试验降级或让旧 JSON 和 SQLite 同时计数。

## 作者会话与发布开关

`SESSION_COOKIE_SECURE` 在镜像和 Compose 默认 true；生产必须使用 HTTPS。复制环境模板在本地 HTTP 验收时设 false，生产部署必须改回 true。Cookie 为 HttpOnly、SameSite=Lax、无 Domain，Path 为部署前缀，默认空闲12小时、绝对7天。仅填精确可信代理；不要为修复登录而放宽信任。会话/身份响应 no-store，工作区不进入 sitemap。跨源管理写请求必须拒绝，multipart 同样要求 CSRF。

`LEGACY_JWT_ENABLED=true` 为迁移默认值；不要升级时轮换 JWT_SECRET。新工作台不返回 JWT。浏览器退出仅撤销当前会话，不代表旧 JWT 撤销；修改密码撤销全部会话并通过 token_version 使旧 JWT 失效。旧 JWT 无 If-Match 写入是过渡例外，应观察 legacy-unconditional 事件、登记调用方和迁移负责人，日志不得含令牌。

`PUBLISHING_API_ENABLED=false` 默认关闭 `/api/v1` 与密钥创建。A 的共享版本、公开快照隔离及 B 的权限/幂等/媒体/撤销验收完成后，在隔离部署中显式设 true 并重建服务环境，再由管理员在 `/studio/integrations` 创建测试集成。确认全部旧调用方迁移且约定观察窗口无旧请求后，才设 `LEGACY_JWT_ENABLED=false` 并停用旧 admin。不要把启用 B 当作可以立即关闭 JWT 的依据。

首装、数据副本核对与回滚步骤见 [作者工作区迁移](author-workspace-migration.md)。接口和 curl 见 [发布接入](api/publishing-v1.md)。上线记录须分别列出测试、浏览器、容器重建和备份恢复的实际证据，未执行项不得标为通过。
