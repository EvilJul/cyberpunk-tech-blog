# publishing-integrations Specification

## Purpose
为机器调用提供独立来源身份、最小权限和可撤销凭据生命周期。管理员通过浏览器管理密钥和脱敏审计，轮换保留来源归属，机器凭据不能代替全站管理权限。

## Requirements
### Requirement: 独立集成身份与密钥

系统 SHALL 以不可变integration.id作为来源命名空间，提供独立随机至少256bit密钥，仅存摘要且常量时间校验；默认空scope、90天有效，可配置1–365天；明文只在创建或轮换成功响应显示一次，禁止进入URL/日志/持久浏览器存储。

#### Scenario: 凭据隔离
- **WHEN** 中台使用有效集成Bearer调用v1连接检查
- **THEN** 返回integration_id、scope和到期信息，不返回secret或hash

#### Scenario: 错误身份
- **WHEN** 仅携带浏览器Cookie或旧JWT访问v1
- **THEN** 返回401，不将管理员登录等同机器授权

### Requirement: 最小权限与资源归属

系统 SHALL 分别校验articles:read/write/publish和media:write；仅管理自身来源映射的文章与媒体，不操作账号、全局设置、其他集成或本地文章；跨归属文章返回404。

#### Scenario: 受限写作
- **WHEN** write-only集成保存已发布文章
- **THEN** 仅更新工作副本，发布动作403，公开快照不变

#### Scenario: 越权
- **WHEN** 集成访问另一集成的文章或studio账号接口
- **THEN** 文章404，管理接口401或403，无数据变化

### Requirement: 浏览器管理与凭据生命周期

系统 SHALL 在/studio/integrations及/api/studio/integrations提供会话+CSRF的创建、权限选择、禁用、撤销、轮换及审计；机器密钥不可创建密钥。轮换默认撤销旧key，显式重叠最多24小时且不扩大权限；停用或撤销在后续认证和提交前检查生效，保留来源映射。

#### Scenario: 轮换保持来源
- **WHEN** 更换key后重试同一external_id
- **THEN** 仍命中原文章，不因key变化创建副本

#### Scenario: 立即撤销
- **WHEN** 密钥撤销后访问或重放已成功请求
- **THEN** 401且不返回旧幂等结果；已提交事务保留

### Requirement: 脱敏审计与调用限制

系统 SHALL 按集成记录安全的操作、结果、资源、revision、request_id与时间，成功审计与业务事务一致，失败另记；保留90天；默认总量60/分钟、写20/分钟、媒体10/分钟，429返回Retry-After；不记录凭据、正文或密钥响应。

#### Scenario: 失败定位
- **WHEN** 中台请求字段错误或超频
- **THEN** 取得可定位request_id和安全错误；审计无secret与正文

#### Scenario: 权限缩减
- **WHEN** 密钥轮换试图新增未授权scope
- **THEN** 拒绝，新增权限必须由管理员明确创建新key
