# 作者工作区迁移与回滚

本说明适用于 unify-author-workspace 与 add-publishing-integrations。先在一次性数据副本验证，完成后再安排真实停写窗口。本文不代表已经迁移真实数据。

## 上线前

记录当前应用版本、配置、持久数据目录、JWT 调用方及回滚负责人。保持 JWT_SECRET，备份整个数据目录和配置；SQLite 在线快照用 `node scripts/backup-db.js`，不要在线只复制 blog.db。数据库快照不包含上传及设置文件，整站备份需停止写入后归档。备份保存至独立介质。

恢复到全新一次性目录，用该目录的 BLOG_DATA_DIR 启动新版本迁移；环境变量须在导入数据库模块之前设置。禁止把真实库作为验收 fixture。核对用户 ID/角色/bcrypt 哈希、文章 ID/slug/公开正文及时间、分类标签、评论、统计、主题、上传和 FTS；重复迁移无额外改变，外键/完整性检查通过。迁移失败必须事务回滚并阻止写服务启动。

A 增量加入会话、setup token、用户 token_version、revision/published_revision 及工作副本；既有已发布文章 revision/published_revision 初值1，草稿公开版本 null。历史 slug 不批量更改。B 增量维护集成、密钥摘要、来源/tombstone、媒体、幂等和审计；不把历史文章自动分配给集成。密钥轮换不改变 integration.id 或来源。

## 首装与已有账号

已有任意用户时首装关闭，不重建或覆盖账号；已有用户但无管理员的异常库需本地运维修复，不开放远程匿名注册。空库先在运行服务所用的同一数据目录执行：

```sh
BLOG_DATA_DIR=/absolute/path/disposable-data node scripts/create-setup-token.js
# 容器使用同一卷（仅在计划好的空库安装时执行）
docker compose exec public node scripts/create-setup-token.js
```

本地 CLI 显示一次性 token，30分钟有效；重发废弃旧 token，不放 URL 或通用日志。打开 `/setup` 输入 token 与首位账号；并发初始化最多创建一位管理员。`scripts/init-admin.js` 为本地替代入口，复用同一首装事务。已有站点从 `/login` 登录，再到 `/studio`。

## 切换与核对

1. 确认所有旧写接口已通过同一共享文章服务，禁止新旧写入者绕过服务混跑。
2. 默认启用 public+backup，3033 仅 legacy-admin profile；非 root、持久卷、每日备份及七天轮转保持。健康探针、登录与工作区同源；`/` 与 `/blog/` 分别验收，Cookie Path、上传地址、API 和 returnTo 均在前缀内。
3. 在副本完成建草稿→发布→保存新草稿而公开正文/关联/SEO不变→再发布→撤回。两个编辑器的旧 ETag 提交应412，缺条件428；不自动覆盖。studio ETag 是 `"<revision>"`，v1 是 `"article-<id>-r<revision>"`，共享同一整数版本。
4. 验证评论祖先拒绝后整棵子树隐藏、主题背景与旧链接不变、退出与改密码撤销会话。重建后核对草稿和设置，备份恢复可用。
5. B 默认关闭；验收后显式启用并测试草稿、重试、上传、发布、冲突、轮换与撤销。旧 JWT 关闭必须另行满足所有调用方迁移及无旧请求观察窗口。

保存只改变工作副本和 revision，发布才提升公开快照。编辑器本机恢复按账号隔离；退出前先导出需要保留的文字，再清除公共设备本机草稿。媒体首版不提供作者删除；B 的清扫仅处理登记媒体并检查工作/公开引用，不触及历史未登记文件。

## 回滚

优先回退到理解新 schema 的兼容应用。仅停用 B 时先关闭开关、撤销测试密钥、停止机器写入，保留新表和来源身份，不逆向删除 schema。

若必须回到 A 之前版本：停止所有写入和 backup/宿主 timer，完整保留上线后数据并导出需保留的新内容。使用上线前同一时点的应用、数据库和配置恢复到全新目录，不能让旧程序继续写新工作副本库，不能在线覆盖 blog.db 或混入旧 WAL/SHM。上传保留超集，禁止删除上线后新媒体。明确恢复窗口内新写丢失范围，核对账号、链接、计数、主题及健康后再恢复服务与每日备份。
