## Context

规划依据：[共享路线图](../../../../docs/product-evolution-plan.md)、[作者工作区 proposal](../2026-11-09-unify-author-workspace/proposal.md)。已读取当前文章路由、ArticleDAO、上传与 JWT 中间件：现有写入面向管理员、更新直接改文章表，尚不能作为具备工作副本隔离的 v1 协议。以下保留规划时的基线与目标；后续已获授权实施，最终结果见 docs/implementation-verification.md。

A（unify-author-workspace）独占共享文章服务、整数 revision、工作副本存储（如 article_drafts）、发布快照及浏览器身份。B（本变更）依赖 A，新增集成及 v1 适配层，不能复制服务或另起版本字段。既有 secure-api-access 的 MODIFIED delta 只由 A 编写；B 仅 ADDED，归档顺序 A → B，合并前检查 A 已明确承认单独启用的受限机器主体。

## Goals / Non-Goals

**Goals:** 为未来中台提供稳定发布目标，安全同步自有草稿、显式发布、解决本地编辑冲突，并可独立撤销每个调用方。

**Non-Goals:** 中台、平台适配器、远程 URL 下载、删除/回收站、webhook、定时发布和视觉重设计。第一版不授予集成接管本地或其他集成文章的权限，也不提供隐式自动合并。

## Decisions

### 1. 共享服务及路由边界

| 路径 | 主体与行为 | 归属 |
| --- | --- | --- |
| `/api/session/*` | 浏览器登录/退出/会话与 CSRF 获取；不签发机器 key | A |
| `/api/setup/status`、`/api/setup/complete` | 本机一次性 token 安装契约 | A |
| `/api/studio/*` | 浏览器会话；修改要求 CSRF 和来源校验 | A 公共约定 |
| `/api/studio/integrations` 及子资源 | 管理员会话；机器 Bearer 无效 | B |
| `/api/v1/*` | 仅 integration Bearer；Cookie/JWT 不能替代 | B |
| `/studio/integrations` | 中文集成管理页 | B |
| `/studio/editor/new`、`/studio/editor/:id` | 编辑工作副本；与 A 路由契约一致 | A |

选择单服务同源挂载，不启动新端口。只在 v1 使用机器中间件，不让机器 key 进入旧管理权限体系。共享服务接口为 getWorkingCopy/createDraft/saveDraft/publish/unpublish/deleteArticle，输入 actor、articleId、expectedRevision，返回同一 revision/ETag；对应 A 的 articleService.js，B 仅提供路由与集成适配。集成主体携带 integrationId 与 scopes，服务事务内再次验证归属、权限和版本，不能仅在路由检查。

Save：新建默认 draft；已有 published 文章保存仅改变工作副本和整数 revision，不改变公开正文、slug、分类标签、封面、更新时间及 SEO。Publish：需要 publish scope，事务提升完整工作副本快照，revision +1；不要求 write scope 作为发布的隐含前提。Unpublish：需要 publish scope，隐藏公开快照并保留工作副本，revision +1。不允许 write 调用通过 status 字段、分类关联、媒体替换间接影响已发布快照。公共读取始终使用 A 的公开快照；本地与集成都递增同一 revision。

### 2. 集成、密钥与管理

integrations 保存 UUID id、name（1–80 字）、enabled、created_at；不可变 id 就是 source namespace，显示名称可改，删除/重建集成不会继承旧命名空间。keys 保存 key_id、integration_id、验证摘要、scopes、expires_at、revoked_at、last_used_at；机器凭据为随机至少 256 bit secret，格式 `bpk_<key_id>.<secret>`，只用 key_id 定位，SHA-256 摘要常量时间比较。随机高熵 secret 不使用密码式弱输入。未启用 B 前该格式不被任何路由接受。

默认 scope 空，明确勾选 articles:read、articles:write、articles:publish、media:write，不含 admin/settings。默认 90 天有效期，可选 1–365 天，不允许永久密钥。创建/轮换只在当前成功响应显示一次明文，Cache-Control: no-store，不进入 URL、日志、审计、localStorage；丢失后轮换。轮换默认立即撤销旧 key；可明确选择最多 24h 重叠，旧 key 到期时间不能延长。撤销及停用对之后的认证和提交前检查立即生效，已提交事务不回滚。

浏览器管理端：GET/POST `/api/studio/integrations`，PATCH `/:integrationId` 修改名称/启用状态，GET/POST `/:integrationId/keys`，POST `/:integrationId/keys/:keyId/rotate`、`/revoke`，GET `/:integrationId/audit`。列表永不返回 secret/hash；轮换不得扩大原 key scopes，新增权限需另建 key 并显式授权。禁用不删除文章/映射。修改接口均 session+CSRF；没有 machine 自助签发、删除集成或授予文章所有权接口。

### 3. 版本化协议与字段

| 方法与路径 | 权限 | 条件与结果 |
| --- | --- | --- |
| GET `/api/v1/connection` | 有效 key | 200 返回 integration_id、scopes、expires_at、api_version，无秘密 |
| GET `/api/v1/articles` | articles:read | 仅自身映射列表；支持 status=draft/published、page/per_page |
| GET `/api/v1/articles/:id` | articles:read | 工作副本、published_revision、当前 ETag；跨归属或不存在 404 |
| PUT `/api/v1/articles/by-external-id/:externalId` | articles:write | 完整工作副本 upsert；新建 201、已有 200 |
| PATCH `/api/v1/articles/:id` | articles:write | 部分工作副本更新，200 |
| POST `/api/v1/articles/:id/publish` | articles:publish | 原子发布工作副本，200 |
| POST `/api/v1/articles/:id/unpublish` | articles:publish | 撤回公开可见性，200 |
| POST `/api/v1/media` | media:write | multipart 实际文件，201 |

没有 POST articles 随机建文入口，也没有 DELETE。按 external-id 的静态路由优先于 :id。externalId 必须 URL 编码、解码一次，只允许 `[A-Za-z0-9._~-]{1,128}`，大小写敏感，禁止 slash、控制字符及二次解码。归属检查以映射而非 slug/source URL 判定。

PUT 必填 title、body_markdown；可选 slug、tags、category、excerpt、canonical_source、cover_media_id。首次省略可选字段采用默认：tags=[]，其余可空值=null，slug 服务生成；再次 PUT 省略 slug 保持既有 slug，其余可选字段按默认重置，避免不明确的局部 PUT。PATCH 省略保持，tags=[] 清空，category/excerpt/canonical_source/cover_media_id=null 清空；title/body_markdown/slug 不允许 null。未知字段（尤其 status/author/integration_id/revision）返回 422。

title trim 后 1–200 Unicode 字符；body_markdown 原样保存，允许空，UTF-8 最大 1 MiB，不 trim、不改换行或渲染后反写；JSON 总体最大 2 MiB。excerpt 至多 1000 字符，默认 null 不自动抽取；tags 最多 20 个，每项 trim 后 1–50 字符、去除完全相同重复项；category 为 null 或已存在分类 ID，不能借此新建/改名全局分类；tag 新建及关联仅在共享发布事务提升快照时物化，保存阶段只写工作副本，公开目录及计数不得读入草稿标签。slug 为 1–160 字符小写 ASCII 字母数字及连字符；省略新建用 UUID 衍生，不使用标题碰撞重试覆盖。

canonical_source 为 null 或 `{url, external_id}`：url 限 2048 字符 http/https、无账号密码；external_id 必须等于路径来源编号，PATCH 不可改编号。url 仅存储和安全展示，不抓取、不成为授权或 slug 匹配依据。cover_media_id 只能引用同集成已完成本地上传；不接受任意封面 URL。正文远程图片 Markdown 不触发服务器下载，展示安全由既有渲染规则控制。

单资源 `{data,request_id}`；data 含 id、external_id、integration_id、工作字段、status、revision、published_revision（从未发布为 null，撤回后保留最后公开版本）、updated_at（UTC ISO8601）、public_url（未发布 null）。单资源及所有文章写响应返回强 ETag `"article-<id>-r<revision>"`；不含统计等独立变化字段。列表不返回正文，含 revision 和上述概要；pagination 为 `{page,per_page,total,total_pages,has_next,has_prev}`，默认 1/20，per_page 最大100、page 最大1000000，非法值 422；排序 created_at DESC、id ASC，允许 status 筛选；翻页不是快照，新建时客户端按 id 去重。列表总数仅自身映射，公开读取接口保持原行为。

### 4. 来源唯一性、并发和幂等

article_sources：UNIQUE(integration_id, external_id)、UNIQUE(article_id)，持久保存；key_id 不参与归属。任何 slug 与本地/其他集成/自身其他文章冲突均 409 SLUG_CONFLICT，不更新、接管或泄露目标 ID；即使未发布工作副本也须共享 slug 预留以避免发布时意外覆盖。手工删掉的映射文章保留 tombstone，之后 upsert 410 ARTICLE_GONE，不自动重建。来源记录保留原文章ID及外部编号，活动外键可置空；由B迁移创建的删除触发器或共享事务扩展点在文章删除时原子写入tombstone，禁止ON DELETE CASCADE丢失来源身份。

新建 upsert 必须 If-None-Match: *；已存在 upsert/PATCH/publish/unpublish 必须单一强 If-Match 当前 ETag，禁止 * 和弱 ETag。缺必要条件 428 PRECONDITION_REQUIRED；格式不合法或同时出现两类条件 400；stale 或新建条件遇到已有映射 412 REVISION_CONFLICT。读到最新版本后人工合并，再提交；不提供 force。新建竞争用 DB 唯一约束+事务串行化，最多一篇文章；失败的正文/标签/slug 预留全部回滚。发布已经相同快照或撤回已撤回的当前版本可返回 200 且不增加 revision，审计标注 no-op。

所有 v1 写操作要求 Idempotency-Key（ASCII 8–128 字符），缺少 400。记录主键为 integration_id+method+规范路由（含目标参数）+key；请求指纹为类型化规范 JSON SHA-256 或上传文件字节/规范元数据摘要，包含 If-Match/If-None-Match，Markdown 字符串内部不改写。不能把 payload digest 放入唯一主键，否则同键不同内容无法报错。成功提交和响应快照同一数据库事务存储，24h 保存；相同指纹重放原 status/body/ETag，X-Request-ID 为本次请求，body.request_id 保留原值，Idempotency-Replayed: true 表明重放。不同指纹 409 IDEMPOTENCY_CONFLICT；并发同键通过唯一约束等待提交后重放，等待超时 409 REQUEST_IN_PROGRESS+Retry-After。

先认证/撤销/权限/归属，再查重放，再校验首次操作版本；因此超时重试带旧 ETag 可重放成功，但撤销后不能重放。不缓存凭据错误、校验失败或 5xx。保留期外按当前版本重新执行；持久来源映射保证不重复建文，过期创建重试 If-None-Match 得 412，客户端查询映射需列表 external_id 精确筛选（加入列表唯一额外参数 external_id），再读取 ID。轮换后仍按 integration 复用幂等记录。对于媒体，记录 integration_id+输入 SHA-256 唯一绑定已完成媒体，可超24h复用；失败残留不当作完成。

### 5. 媒体、安全和错误

multipart 字段 file，仅一文件，最大5 MiB；只收 JPEG/PNG/WebP/GIF，实际解码且最多4000万像素，拒绝 SVG/伪 MIME/远程 URL 字段。静态转码 JPEG，移除元数据、最大宽1200，随机文件名。返回 id、url、mime_type、size、width、height、sha256；url 使用既有本地 uploads 路径，不覆盖旧文件。所有上传图片 URL 均可公开读取，不用于秘密附件，界面须说明。

临时文件→验证转码→最终文件→事务登记媒体和幂等成功；文件已落盘而事务失败的残留通过可重入清扫回收。已登记未引用媒体保留7天后清理，检查所有工作副本/公开快照引用，不清理既有无登记上传，不通过媒体去重更新既有字节。上传失败清理临时文件；扫除任务必须可观测、可重试。

统一错误 `{error:{code,message,details},request_id}`，message 中文，details 只含安全字段错误；不返回堆栈、正文、其他文章 ID。400 格式、401 凭据、403 scope、404 不存在/无归属、409 slug/幂等/进行中、410 已删除映射、412 版本、413 大小、415 类型、422 字段、428 条件、429 限流、500 内部错误。响应均 X-Request-ID；私有响应 no-store。应用生成 UUID request_id，不信任任意传入值。

默认每集成60请求/分钟、写操作20/分钟、媒体10/分钟（同时计入总量），认证失败每IP30/分钟；429 给 Retry-After 秒。生产 HTTPS，Bearer 不允许 query 参数，CORS 默认不开放跨源机器接口。审计追加 integration/key ID、操作、article/media ID、结果码、revision、request_id、时间、脱敏来源地址，绝不记 secret、Authorization、正文或密钥响应；成功操作审计与业务事务一致，失败安全事件另记。保留90天后清理，管理页分页按时间/id倒序，不能通过机器读取全局审计。

### 6. 文档和接入验收样例

实施时新增 OpenAPI 3.1（建议 docs/api/publishing-v1.openapi.yaml）及中文指南，描述 Bearer scheme、每操作 scope、条件头、幂等/分页/错误及上限；本次不创建该源文件。示例使用虚构域名与环境变量，不包含真实 key：

```sh
# BLOG_API=https://blog.example/api/v1；BLOG_KEY 由调用方安全注入
curl -i "$BLOG_API/connection" -H "Authorization: Bearer $BLOG_KEY"
curl -i -X PUT "$BLOG_API/articles/by-external-id/post-001" \
  -H "Authorization: Bearer $BLOG_KEY" -H 'Content-Type: application/json' \
  -H 'If-None-Match: *' -H 'Idempotency-Key: draft-post-001-v1' \
  --data '{"title":"第一篇文章","body_markdown":"# 原始 Markdown\n正文","tags":[]}'
# 从成功响应取 ARTICLE_ID 与含双引号的 ETAG，重试原请求仍用原键和原条件。
curl -i -X PATCH "$BLOG_API/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $BLOG_KEY" -H "If-Match: $ETAG" \
  -H 'Idempotency-Key: edit-post-001-v2' -H 'Content-Type: application/json' \
  --data '{"excerpt":"同步后的摘要"}'
# 每次成功后更新 ETAG；发布需独立 articles:publish。
curl -i -X POST "$BLOG_API/articles/$ARTICLE_ID/publish" \
  -H "Authorization: Bearer $BLOG_KEY" -H "If-Match: $ETAG" \
  -H 'Idempotency-Key: publish-post-001-v2'
curl -i "$BLOG_API/media" -H "Authorization: Bearer $BLOG_KEY" \
  -H 'Idempotency-Key: media-post-001-v1' -F 'file=@cover.png'
```

指南还应展示 unpublish、24h 外恢复、412 人工合并、scope 不足和轮换；密钥创建只在工作区，不能用上述 curl 机器凭据创建 key。

## Risks / Trade-offs

- 工作副本与公开关联分离不足 → 必须通过 A 的保存/发布公开快照验收后再启用 B，禁止仅隔离正文。
- SQLite 并发/磁盘失败 → 短事务、唯一约束、明确忙重试上限，故障注入验证事务与文件清理。
- key 泄漏 → 一次显示、期限、撤销、最小 scope；备份中的摘要仍按敏感数据保护。
- offset 翻页变动与24h后响应无法重放 → 明确去重和映射恢复流程，不承诺快照或永久响应。
- 独立命名空间不能自动接管旧文章 → 首版明确拒绝，未来另设可审计迁移流程。

## Migration Plan

1. A 先落地 shared-article-writing 与 session 契约，检查公开 URL、revision、发布快照及旧 JWT 兼容隔离；B 不另行迁移旧文章至集成。
2. 在数据副本备份/恢复演练，增量创建 integration/key/source/idempotency/media/audit 表、唯一索引、外键及 schema version，重复迁移无副作用；现有 ID/slug/快照/媒体目录不变。
3. 默认关闭 v1 路由和 key 创建；部署迁移与服务检查通过后由管理员启用并创建测试集成，执行全链路再开放调用方。轮换不是数据库迁移，不改归属。
4. 回滚先停用 B、撤销测试密钥及停止新写，保留新增表不逆向破坏；如需回到 A 之前版本，停机并匹配应用/数据库备份恢复，明确恢复窗口内新写丢失风险；不在线恢复覆盖数据。

## Open Questions

产品取舍已明确。实施门槛是与 A 的最终 design/spec 核对服务导出名、编辑器实际路径、slug 预留及通用权限 delta；有差异先更新双方文档再编码。该门槛不影响本变更规划产物完整性，不代表实施已经获准或已经完成。
