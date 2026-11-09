# secure-api-access Specification

## Purpose
TBD - created by archiving change harden-blog-platform. Update Purpose after archive.
## Requirements
### Requirement: 统一管理权限

系统 SHALL 对管理写操作按主体和路由验证身份及权限：/api/studio仅接受有效管理员会话且写请求验证CSRF；旧JWT仅在显式兼容接口接受；独立集成主体只在另行实现并启用的受限/api/v1接受，不能访问账号、设置或studio。默认同源单服务，Basic Auth永不授权，登录无需已有会话；可选旧管理端仅回环与来源白名单。

#### Scenario: 管理授权
- **WHEN** 匿名、Basic、普通用户或集成凭据访问studio写接口
- **THEN** 分别401或403，数据库与文件不变；正确管理员会话可操作

#### Scenario: 预留不授权
- **WHEN** B尚未实现而请求携带bpk格式字符串
- **THEN** v1为404，其他路由不将格式当作已验证身份

### Requirement: 安全评论提交

系统 SHALL 校验字符串类型、trim 后昵称 1–50 字、内容 1–2000 字、可选邮箱格式，验证已发布文章与同文章父评论存在；按来源限制每 15 分钟 10 次提交，内容以安全文本显示。

来源：SEC-03。

#### Scenario: 安全评论提交验收
- **WHEN** 提交空字段、恶意 HTML、跨文章 parentId 或第 11 次评论
- **THEN** 无效字段返回 400，无文章返回 404，超频返回 429；合法内容保存为 pending 且脚本不会执行

### Requirement: 用户创建边界

系统 SHALL 仅空库且持有有效本机一次性setup token时原子创建首位管理员；已有用户后创建账号要求管理员授权及角色白名单；既有本地初始化脚本复用首装事务，不提供公众注册。

#### Scenario: 并发首装
- **WHEN** 两个初始化请求并发到达
- **THEN** 最多一位首装管理员且token只消费一次；无token请求被拒绝

#### Scenario: 已有站点
- **WHEN** 已有任意用户后匿名创建账号
- **THEN** 拒绝且不重置现有账号与密码

### Requirement: 新实体标识

系统 SHALL 为新文章、评论和用户生成 crypto.randomUUID() 标识，既有 ID 和关联保持可读。

来源：SEC-07。

#### Scenario: 新实体标识验收
- **WHEN** 并发创建实体并读取旧文章
- **THEN** 新 ID 唯一且旧链接仍可解析

### Requirement: 日志权限与容量

系统 SHALL 限定日志级别 INFO/WARN/ERROR/DEBUG、message 至多 500 字符、序列化 data 至多 2000 字符，异步输出结构化日志且仅管理员可清空。

来源：SEC-08。

#### Scenario: 日志权限与容量验收
- **WHEN** 提交非法级别、超限消息或普通用户清空日志
- **THEN** 请求被拒绝且不会追加或清空日志

