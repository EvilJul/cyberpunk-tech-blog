# shared-article-writing Specification

## Purpose
以唯一文章服务统一工作副本、公开快照、修订并发控制和原子发布权限。浏览器与集成共享版本时钟，保存不泄露草稿，冲突不覆盖内容，并保留历史文章地址。

## Requirements
### Requirement: 独立工作副本与公开快照

系统 SHALL 以articleService作为唯一业务入口，articles保留公开快照，article_drafts保存全部编辑字段，revision表示并发版本，published_revision标记公开快照；公开列表、详情、搜索、目录、统计、RSS与SEO不读取工作副本。

#### Scenario: 保存不发布
- **WHEN** 管理员保存已发布文章的新正文、slug、分类和标签
- **THEN** 仅副本和revision变化；公开正文、关联、时间、搜索与SEO保持原样

#### Scenario: 升级迁移
- **WHEN** 已有草稿及已发布文章迁移并重跑
- **THEN** ID和链接不变，草稿进入工作副本，迁移幂等

### Requirement: 条件写入与原子发布

系统 SHALL 已有资源saveDraft/publish/unpublish/deleteArticle要求强ETag If-Match；缺条件428、过期412、不支持通配绕过；新建草稿revision=1；事务内检查权限、版本、字段、分类标签与唯一slug，失败全部回滚；发布提升完整快照并递增revision，完全相同发布及已撤回的重复撤回为no-op。

#### Scenario: 写冲突
- **WHEN** 两个标签页用同一revision修改
- **THEN** 第一项成功，第二项412且保留输入供比较

#### Scenario: 发布失败
- **WHEN** 提升快照期间关联写入失败
- **THEN** 正文、关联、版本和公开时间均回滚

### Requirement: 稳定文章地址

系统 SHALL 新建生成非空唯一稳定slug，中文标题支持Unicode或UUID降级；标题改变不自动改地址；显式冲突409且不覆盖其他文章；历史地址不批量修正，已发布slug修改须确认且只在发布生效。

#### Scenario: 中文建文
- **WHEN** 仅填写中文标题并保存
- **THEN** 得到非空唯一地址，后续标题编辑不改变它

#### Scenario: 地址冲突
- **WHEN** 显式slug已被另一文章占用
- **THEN** 409 SLUG_CONFLICT，不接管另一篇文章

### Requirement: 共享发布权限边界

系统 SHALL 统一用户与未来集成主体的服务授权；集成write仅保存工作副本、publish另行授权，来源由integration.id命名空间约束；旧JWT无条件直接写仅保留明确legacy兼容适配，并整体事务更新一次revision。

#### Scenario: 机器不可间接发布
- **WHEN** 未来write-only主体修改已发布文章的status或公开关联
- **THEN** 未知状态字段拒绝或仅保存副本，公开内容不变

#### Scenario: 本地与机器并发
- **WHEN** 站长修改后机器携带旧版本提交
- **THEN** 同样返回412，不存在第二套版本时钟

