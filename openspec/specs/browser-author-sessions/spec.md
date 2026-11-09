# browser-author-sessions Specification

## Purpose
以本地持有证明安全初始化首位管理员，并通过可撤销浏览器会话保护作者管理。所有管理写入校验CSRF和可信来源，保持已有账号且明确旧JWT兼容及退场边界。

## Requirements
### Requirement: 本地持有证明首装

系统 SHALL 仅空用户库开放初始化；本机CLI生成一次性随机setup token，数据库仅存摘要、30分钟到期；complete在立即事务内原子校验建首位管理员并消费token；既有账号与密码哈希不重建。

#### Scenario: 拒绝抢注
- **WHEN** 远程访客无token或使用过期token创建首位用户
- **THEN** 请求被拒绝且没有管理员被创建

#### Scenario: 首装竞态
- **WHEN** 两次有效初始化并发提交
- **THEN** 只有一次成功，token不可重放且已有用户时入口关闭

### Requirement: 可撤销浏览器会话

系统 SHALL 使用32字节随机不透明ID且服务端存摘要；Cookie为HttpOnly、SameSite=Lax、无Domain、前缀Path，生产Secure；默认空闲12小时绝对7天；登录轮换、每请求验证数据库角色，退出撤销当前会话、改密码撤销全部会话。

#### Scenario: 会话撤销
- **WHEN** 用户退出后重用旧Cookie
- **THEN** 返回401，工作台作者态消失

#### Scenario: 密码更新
- **WHEN** 管理员验证旧密码后修改密码
- **THEN** 全部旧会话失效且新密码可重新登录；不向浏览器返回JWT

### Requirement: CSRF和身份隔离

系统 SHALL 对浏览器管理写请求含multipart要求会话、绑定CSRF token与可信Origin；仅定义的同源Referer可兜底，二者均缺拒绝；身份响应no-store，v1未启用时404，未来机器密钥不能作为studio会话。

#### Scenario: 跨站修改
- **WHEN** 持有Cookie但无正确CSRF或来源不可信
- **THEN** 返回403且数据不变化

#### Scenario: 前缀会话
- **WHEN** 在/blog/登录与写作
- **THEN** Cookie Path和API路径一致，不能通过无前缀副本绕过保护

### Requirement: 兼容身份过渡

系统 SHALL 保留显式LEGACY_JWT_ENABLED过渡，新增user token_version支持改密码撤销JWT；3033仅可选legacy-admin；旧接口兼容例外有记录，关闭前确认B可用与调用方迁移，不自动换JWT_SECRET。

#### Scenario: 升级保留
- **WHEN** 已有管理员和机器JWT升级
- **THEN** 账号哈希不变，显式兼容调用可用，新工作台只使用会话

#### Scenario: 兼容关闭
- **WHEN** 已完成调用方迁移并关闭开关
- **THEN** 旧JWT不再访问管理写接口，Cookie会话和B集成不受影响

