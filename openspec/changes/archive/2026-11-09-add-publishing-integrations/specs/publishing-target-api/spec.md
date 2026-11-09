## ADDED Requirements

### Requirement: 版本化文章发布协议

系统 SHALL 在/api/v1提供connection、articles列表/详情、PUT articles/by-external-id/:externalId、PATCH articles/:id、POST publish/unpublish和POST media；不提供DELETE。externalId为大小写敏感1–128个[A-Za-z0-9._~-]字符；详情含工作副本、revision、published_revision和强ETag；分页默认1/20、per_page最大100，支持external_id精确筛选。

#### Scenario: 首次接入
- **WHEN** 调用方按外部编号创建并查询
- **THEN** 201草稿，后续按映射读取同一ID和版本；公开接口不可见草稿

#### Scenario: 分页隔离
- **WHEN** 集成列出文章
- **THEN** total和数据仅包含自身映射且排序稳定

### Requirement: 明确字段与内容语义

系统 SHALL PUT必填title和body_markdown，正文原样Markdown最大1MiB、JSON总量2MiB；title1–200字、excerpt最多1000字、tags最多20个每项1–50字；category仅已有分类ID；未知及status/author/integration_id/revision字段422；PATCH省略保持、指定可空字段null清空。PUT省略slug在已有文章时保持，其他可选字段按默认重置。封面仅本集成已登记媒体；canonical_source只接受http/https。

#### Scenario: 保留原文
- **WHEN** 上传含代码换行的Markdown并再读取
- **THEN** 正文完全一致，不经过HTML反写

#### Scenario: 拒绝隐式发布
- **WHEN** 写请求带status=published
- **THEN** 422且无任何公开内容变化

### Requirement: 长期来源识别与唯一地址

系统 SHALL 持久维护UNIQUE(integration_id,external_id)和UNIQUE(article_id)，事务校验归属和slug预留；同slug冲突409 SLUG_CONFLICT，不泄露或接管目标；已被站长删除的映射保留tombstone，后续upsert410。

#### Scenario: 并发建文
- **WHEN** 两个请求并发新建同一外部编号
- **THEN** 最多一篇文章及一个映射；竞争失败不留下关联残留

#### Scenario: 地址撞名
- **WHEN** 中台slug与本地文章相同
- **THEN** 409且原文章不被绑定、覆盖或改名

### Requirement: 统一版本与独立发布

系统 SHALL 使用A共享服务和同一revision；首次upsert必须If-None-Match:*，更新/发布/撤回必须单一强If-Match且拒绝通配；缺条件428、过期412、非法条件400；保存仅更新副本，发布原子提升全部公开字段；发布相同快照或撤回已撤回资源可no-op。

#### Scenario: 本地改文冲突
- **WHEN** 站长保存后中台携带旧ETag更新
- **THEN** 412并保留本地和公开内容，调用方需重新读取和人工合并

#### Scenario: 显式发布
- **WHEN** 有publish权限且条件匹配的集成发布
- **THEN** 公开快照原子更新并返回新ETag；write权限不能代替publish

### Requirement: 可重试的幂等写入

系统 SHALL 所有v1写请求要求8–128字符Idempotency-Key；按integration+method+规范路由+key唯一存储24小时成功响应与类型化请求摘要，包含前置条件。认证/权限/归属在重放前检查；同键同摘要重放原状态/正文/ETag并标记重放，同键异摘要409；并发进行中409+Retry-After；5xx及校验错误不缓存。

#### Scenario: 超时重试
- **WHEN** 已提交成功但响应丢失后使用同键及旧ETag重试
- **THEN** 认证有效时重放原成功，不重复建文或发布

#### Scenario: 重用键
- **WHEN** 同一键提交不同正文或条件
- **THEN** 409 IDEMPOTENCY_CONFLICT，无额外修改

#### Scenario: 保留期外
- **WHEN** 创建响应记录过期后重试If-None-Match:*
- **THEN** 持久映射阻止重复创建并返回412，客户端按external_id恢复查询

### Requirement: 受控本地媒体

系统 SHALL 只接收multipart字段file真实JPEG/PNG/WebP/GIF，最大5MiB且4000万像素，解码验证并转码随机JPEG文件；不抓取远程URL或接收SVG；返回媒体ID、本地URL及摘要。临时和事务失败残留可重入清理，登记未引用媒体7天后才清理，检查工作副本与公开引用且不删除历史未登记文件。

#### Scenario: 恶意上传
- **WHEN** 文件伪MIME或输入远程URL
- **THEN** 415或422，不发起外网下载，不留下已登记媒体

#### Scenario: 媒体重试
- **WHEN** 同集成重复上传相同输入且前次完成
- **THEN** 返回已完成映射，密钥轮换后亦不重复生成；已引用媒体不被清理

### Requirement: 一致错误与接入文档

系统 SHALL 统一返回{error:{code,message,details},request_id}、X-Request-ID与私有响应no-store；安全字段错误不泄露堆栈及其他资源ID。实施产出OpenAPI3.1、中文接入与可执行curl示例，涵盖全部权限、大小、分页、重试、冲突和轮换规则，B未启用前接口不对外开放。

#### Scenario: 契约验证
- **WHEN** 在临时库执行文档中的建草稿、重试、上传、发布、冲突与撤销示例
- **THEN** 请求结果与OpenAPI及实际实现一致，正常和错误分支均可验收
