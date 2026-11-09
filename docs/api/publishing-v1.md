# 发布目标 API v1

协议源文件：[OpenAPI 3.1](publishing-v1.openapi.yaml)。默认 `PUBLISHING_API_ENABLED=false`，未启用返回404，密钥创建也关闭。以下为隔离环境接入示例，本次未对真实业务站点执行 curl。生产使用 HTTPS；子路径站点把 `/blog` 加到 API 地址前。

## 身份与端点

管理员在 `/studio/integrations` 创建集成及密钥，默认 scope 为空、90天有效，可选1–365天。凭据格式 `bpk_<key_id>.<secret>`，至少256bit随机秘密，仅创建/轮换成功显示一次，不进入 URL、日志或浏览器持久存储。机器只用 Authorization Bearer，Cookie 和旧 JWT 无效。归属由不可变 integration.id + 大小写敏感 external_id 确定，轮换不改变归属；不能接管本地或其他集成文章，跨归属404，不按 slug 或来源 URL 接管。

| 方法与 `/api/v1` 下路径 | scope | 成功 |
| --- | --- | --- |
| GET /connection | 有效 key，无 scope 前提 | 200 |
| GET /articles | articles:read | 200 |
| GET /articles/:id | articles:read | 200，ETag |
| PUT /articles/by-external-id/:externalId | articles:write | 创建201/更新200，ETag |
| PATCH /articles/:id | articles:write | 200，ETag |
| POST /articles/:id/publish | articles:publish | 200，ETag |
| POST /articles/:id/unpublish | articles:publish | 200，ETag |
| POST /media | media:write | 201 |

没有 POST articles 或 DELETE，也没有机器账号/设置/签发 key 接口。publish 不隐含要求 write，write 不能发布。所有保存只写工作副本，即使已发布也不改变公开内容、slug、分类标签、封面、时间及 SEO。发布才原子提升完整快照；相同快照发布或已经撤回时再撤回可以 no-op，不增加 revision。

## 请求与 DTO

PUT 必填 title/body_markdown；可选 slug、tags、category、excerpt、canonical_source、cover_media_id。首次省略 tags 默认[]，可空字段默认null，slug 用 UUID 衍生。更新 PUT 省略 slug 保持，其余可选字段按默认重置。PATCH 省略保持，tags=[] 清空；category/excerpt/canonical_source/cover_media_id=null 清空，title/body_markdown/slug 不允许null。未知字段尤其 status、author、integration_id、revision 返回422。

- title trim 后1–200 Unicode字符；正文原样保存、不 trim 或改换行，可空，UTF-8最大1 MiB；JSON总体最大2 MiB。
- excerpt 最多1000字符，默认null不自动摘取；tags最多20项，每项trim后1–50字符，完全相同项去重，发布才物化。
- category 为已有分类的正整数 ID 或null（不接受数字字符串），不能创建全局分类；slug为1–160个小写ASCII字母数字/连字符；冲突409 SLUG_CONFLICT，不泄露目标ID。
- externalId 仅 `[A-Za-z0-9._~-]{1,128}`，URL编码且只解码一次，禁止slash、控制字符和二次解码。
- canonical_source 为null或 `{url,external_id}`：URL为不含账号密码的http/https，最多2048字符，编号必须等于来源映射编号、PATCH不能改；只存储、不抓取。
- cover_media_id 仅本集成已完成上传的媒体ID，不接受封面URL；正文远程图片不触发服务器下载。

单资源为 `{data,request_id}`。文章 data 包含字符串 id（新建为 UUID，不按整数解析）、external_id、integration_id、上述工作字段、status、revision、published_revision、updated_at（UTC ISO8601）、public_url（未发布null）；从未发布时 published_revision 为null；撤回后保留最后公开版本，public_url仍为null。列表为 `{data:[概要],pagination,request_id}`，不含正文，pagination为 `{page,per_page,total,total_pages,has_next,has_prev}`；默认1/20，per_page最大100、page最大1000000，非法422。支持 status=draft/published 和 external_id 精确筛选，仅自身映射，created_at DESC/id ASC；翻页不是快照，按ID去重。

connection.data 为 `{integration_id,scopes,expires_at,api_version}`，api_version 固定 `v1`。media.data 为 `{id,url,mime_type,size,width,height,sha256}`。接口 DTO 由适配层转换：共享 articleService 的 content 对应 body_markdown、category_id 对应 category；内部 category 名称、has_draft/public_slug 不作为 v1 替代字段。v1 强 ETag 是 `"article-<id>-r<revision>"`，studio 是 `"<revision>"`；使用同一整数版本，不能互换响应头格式。

## 条件写入与重试

新建 PUT 必须 `If-None-Match: *`；更新 PUT/PATCH/发布/撤回必须单一当前强 `If-Match`，禁止弱 ETag 或通配。两类条件同时出现或格式错误400，缺条件428，旧版本或创建条件遇到已有映射412。站长删除文章后来源 tombstone 持续存在，upsert返回410 ARTICLE_GONE，不自动重建。

所有写操作含上传必须提供8–128个ASCII字符的 Idempotency-Key。唯一命名空间是 integration+方法+规范目标路由+key；指纹包含条件头与规范JSON/文件字节和元数据，Markdown内部不改写。成功业务提交与响应快照同事务保存24小时。同键同指纹重放原状态、正文和ETag，`Idempotency-Replayed: true`；响应 X-Request-ID 是本次UUID，而 body.request_id 保留原值。同键不同内容或条件409 IDEMPOTENCY_CONFLICT；并发等待超时409 REQUEST_IN_PROGRESS+Retry-After。认证/撤销/权限/归属在重放前检查，之后才校验首次版本，所以旧ETag可用于成功请求的原样重试；撤销后不能重放。错误和5xx不缓存。

## curl 接入流程

示例需要 curl；响应解析使用 jq。BLOG_KEY 由调用方安全注入，避免命令记录明文。示例域名不可直接作为实际服务；仅在一次性测试数据目录启动的服务中运行。每一步检查HTTP状态成功后再使用响应，禁止把错误JSON当作文章。

```sh
export BLOG_API=https://blog.example/api/v1
# BLOG_KEY 由安全环境提供
curl -i "$BLOG_API/connection" -H "Authorization: Bearer $BLOG_KEY"

# 首次草稿；保存响应与头，失败时不要继续后续步骤
curl -sS --fail-with-body -D /tmp/blog-create.headers -o /tmp/blog-create.json \
  -X PUT "$BLOG_API/articles/by-external-id/post-001" \
  -H "Authorization: Bearer $BLOG_KEY" -H 'Content-Type: application/json' \
  -H 'If-None-Match: *' -H 'Idempotency-Key: draft-post-001-v1' \
  --data '{"title":"第一篇文章","body_markdown":"# 原始 Markdown\n正文","tags":[]}'
ARTICLE_ID=$(jq -r '.data.id' /tmp/blog-create.json)
ETAG=$(awk 'tolower($1)=="etag:" {sub(/\r$/, "", $2); print $2}' /tmp/blog-create.headers)

# 响应丢失时：原方法/目标/键/条件/正文完全一致，24h内重放201
curl -i -X PUT "$BLOG_API/articles/by-external-id/post-001" \
  -H "Authorization: Bearer $BLOG_KEY" -H 'Content-Type: application/json' \
  -H 'If-None-Match: *' -H 'Idempotency-Key: draft-post-001-v1' \
  --data '{"title":"第一篇文章","body_markdown":"# 原始 Markdown\n正文","tags":[]}'

# 部分保存；仅改变工作副本
curl -i -X PATCH "$BLOG_API/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $BLOG_KEY" -H "If-Match: $ETAG" \
  -H 'Idempotency-Key: edit-post-001-v2' -H 'Content-Type: application/json' \
  --data '{"excerpt":"同步后的摘要"}'
# 从每次成功文章响应更新 ETAG（保留双引号），再执行下一项。

curl -i "$BLOG_API/media" -H "Authorization: Bearer $BLOG_KEY" \
  -H 'Idempotency-Key: media-post-001-v1' -F 'file=@cover.png'
# 将返回 data.id 以新的 PATCH/key/当前ETag写入 cover_media_id；再次更新ETag。

curl -i -X POST "$BLOG_API/articles/$ARTICLE_ID/publish" \
  -H "Authorization: Bearer $BLOG_KEY" -H "If-Match: $ETAG" \
  -H 'Idempotency-Key: publish-post-001-v3'
# 更新ETag后撤回：
curl -i -X POST "$BLOG_API/articles/$ARTICLE_ID/unpublish" \
  -H "Authorization: Bearer $BLOG_KEY" -H "If-Match: $ETAG" \
  -H 'Idempotency-Key: unpublish-post-001-v4'
```

上传只接受一个file，JPEG/PNG/WebP/GIF实际解码，最大5 MiB/4000万像素；转JPEG、去元数据、最大宽1200、随机文件名。拒绝SVG、伪MIME及远程URL字段。媒体URL均公开可读，不上传秘密附件。同集成相同输入摘要可在24h后复用已完成媒体；失败残留可重入回收，登记未引用文件7天后检查所有工作/公开引用才清理，不删除历史未登记文件。

## 412、保留期外及轮换恢复

412时保留调用方原稿，GET详情读取最新工作副本与ETag，人工比较并合并，再以新Idempotency-Key和最新ETag提交；不自动 force、不改用If-Match:*。24h外创建重试可能412，按来源映射恢复：

```sh
curl -sS --get "$BLOG_API/articles" \
  -H "Authorization: Bearer $BLOG_KEY" --data-urlencode 'external_id=post-001'
# 从结果取ID，再GET详情；不要另换external_id盲目创建副本。
curl -i "$BLOG_API/articles/$ARTICLE_ID" -H "Authorization: Bearer $BLOG_KEY"
```

403表示 scope 不足；换幂等键不会增加权限，需管理员明确授权。轮换在工作区执行，默认立即撤销旧key，可显式最多24小时重叠且不延长旧有效期，不得扩大旧scope；增加权限须另建key。安全注入新BLOG_KEY后先GET connection，再按原integration的ID/来源继续；撤销旧key后旧key访问及重放都应401。集成禁用保留文章和映射。

管理端仅浏览器管理员会话：GET/POST `/api/studio/integrations`、PATCH `/:integrationId`、GET/POST `/:integrationId/keys`、POST `/:integrationId/keys/:keyId/rotate` 或 `/revoke`、GET `/:integrationId/audit`；写入要求CSRF与可信Origin，机器key不可调用。审计90天、时间/id倒序分页并脱敏，不记录secret、Authorization、正文或密钥响应。

## 错误与限流

统一 `{error:{code,message,details},request_id}`，message中文，details仅安全字段；所有响应X-Request-ID且no-store。400格式/幂等键、401凭据、403权限、404不存在/归属/关闭、409冲突或进行中、410已删映射、412版本、413大小、415类型、422字段、428条件、429限流、500内部错误。总量60次/分钟、写20次/分钟、媒体10次/分钟同时计数；认证失败每IP30次/分钟。429返回Retry-After秒，调用方退避；默认不开放跨源CORS。

## 2026-11-09 契约交叉核对记录

本次核对 `publishingService.js`、`integrationService.js`、`mediaService.js` 与 `routes/publishing.js`，并读取 main 的挂载位置；不将 `/api/studio` 的错误结构混入 v1 OpenAPI。OpenAPI 范围仅机器 v1，浏览器集成管理端点仅在本指南解释身份边界。

已修正文档错误：文章 id 是不透明字符串（实际新建 UUID），路径参数与 ETag 不得限制为整数；connection.api_version 固定 v1；public_url/media.url 可为站内相对引用；PUT两种条件头互斥及发布/撤回不发送字段已明确。每操作显式要求 integrationBearer，没有 `security: []` 或匿名备选 `{}`；HTTP Bearer 的scope通过各操作 `x-required-scopes` 描述，不能误当OAuth安全scheme的scope数组，客户端仍需服务端鉴权。

实际执行证据：

- `node --test tests/publishing-api.test.js`：首次沙箱回环监听被EPERM阻止（8通过/2失败）；允许本地监听重跑后 **10/10通过**。使用测试自身在导入数据库前创建的临时BLOG_DATA_DIR。
- `node --test /tmp/blog-v1-contract.test.mjs`：最终 **4/4通过**，临时数据库与真实v1 router；全部8个操作的成功响应、Cookie不能替代Bearer、空scope仅能connection、非法分页/状态/来源编号、multipart媒体响应。比较OpenAPI的局部 `$ref`、type、required、additionalProperties、enum、const、pattern及字符串长度等子集；**不是完整OpenAPI/JSON Schema验证器**。初次媒体探针因临时脚本Sharp路径错误失败，改为从项目package.json解析后重跑通过，未改应用代码。
- 静态检查覆盖全部本地 `$ref` 解析、8个操作的Bearer声明、scope矩阵及所有写请求Idempotency-Key参数；PUT的条件头XOR不能靠OpenAPI参数required单独表达，另以说明和x-preconditions标记。

交叉核对差异的最终处理（2026-11-09）：

| 项目 | 最终行为 | 验证证据 |
| --- | --- | --- |
| published_revision | 从未发布为 null；撤回后保留最后一次公开版本，public_url 为 null | 与共享文章服务一致，指南、B design 和 OpenAPI 描述已对齐；发布生命周期测试覆盖撤回 |
| category 输入 | 只接受安全正整数/null，并检查分类存在；数字字符串拒绝422 | publishing-api 严格分类回归覆盖字符串、小数、布尔、对象、零与越界值 |
| 前置中间件错误 | v1 在全局错误处理中也返回安全 DTO、request_id、no-store；开发环境不泄露堆栈 | publishing-main 使用真实主服务和 /blog/ 前缀验证 CORS 拒绝 |

`node --test tests/publishing-api.test.js tests/publishing-main.test.js`：13 项通过、0 失败。此前临时契约探针仍只代表其明确列出的 schema 子集，不是完整 OpenAPI 验证器。

其他静态边界：列表未知查询键当前被忽略，空status视为无筛选；文档只列支持的查询参数，不承诺拒绝所有额外参数。Idempotency-Key实际接受可打印ASCII（0x20–0x7e），所有写请求必需；发布权限独立且不要求write/read，跨来源404；媒体仅file，实际MIME与解码格式匹配，非法表单422/格式415/大小413。v1错误details当前统一null，schema允许安全对象/数组/null为协议形状上限，不表示实际412一定附当前版本，恢复应GET详情。

这些证据不等同真实main整链路、文档全部curl执行、Docker、浏览器UI、全状态码/限流边界或完整schema合规已经通过；最终集成由父任务执行。
