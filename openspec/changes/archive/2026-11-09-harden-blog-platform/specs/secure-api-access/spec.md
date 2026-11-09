## ADDED Requirements

### Requirement: 统一管理权限

系统 SHALL 仅接受有效 JWT Bearer 身份访问管理写接口，包括文章增删改和上传；管理代理同样校验身份，默认仅监听 127.0.0.1 并使用明确 CORS 来源白名单，登录入口不要求已有 token。

来源：SEC-01 SEC-02 SEC-05。

#### Scenario: 统一管理权限验收
- **WHEN** 匿名、Basic Auth 或非管理员请求文章写入或上传
- **THEN** 分别返回 401 或 403，且数据库和文件不变化；有效管理员可以操作

### Requirement: 安全评论提交

系统 SHALL 校验字符串类型、trim 后昵称 1–50 字、内容 1–2000 字、可选邮箱格式，验证已发布文章与同文章父评论存在；按来源限制每 15 分钟 10 次提交，内容以安全文本显示。

来源：SEC-03。

#### Scenario: 安全评论提交验收
- **WHEN** 提交空字段、恶意 HTML、跨文章 parentId 或第 11 次评论
- **THEN** 无效字段返回 400，无文章返回 404，超频返回 429；合法内容保存为 pending 且脚本不会执行

### Requirement: 用户创建边界

系统 SHALL 仅在无用户时允许原子创建首位管理员；之后用户创建要求管理员 JWT，并限制角色白名单。

来源：SEC-06。

#### Scenario: 用户创建边界验收
- **WHEN** 两个首次注册并发到达或之后匿名创建用户
- **THEN** 最多一个请求走首次管理员初始化路径，之后匿名请求被拒绝

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
