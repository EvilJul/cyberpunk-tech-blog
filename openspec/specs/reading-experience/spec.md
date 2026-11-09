# reading-experience Specification

## Purpose
TBD - created by archiving change harden-blog-platform. Update Purpose after archive.
## Requirements
### Requirement: 安全完整 Markdown

系统 SHALL 渲染 GFM 表格、嵌套列表、引用、行内格式和代码块，提供代码高亮、行号和复制；禁止不安全 HTML 与脚本 URL。数学公式作为后续扩展，不包含在本期。

来源：FE-01。

#### Scenario: 安全完整 Markdown验收
- **WHEN** 打开包含代码表格与 XSS 载荷的文章
- **THEN** 格式正确、可复制代码且载荷不会执行

### Requirement: 列表请求预算

系统 SHALL 从文章列表响应获取 views/likes，从分类响应 count 和分页 total 获取侧栏计数，不逐卡请求统计或重复拉全量文章。

来源：FE-02。

#### Scenario: 列表请求预算验收
- **WHEN** 展示 10 张文章卡片并加载侧栏
- **THEN** 卡片新增统计请求为零且侧栏无需额外全量文章请求

### Requirement: 评论审核与回复

系统 SHALL 提交成功后明确显示待审核提示，不将 pending 评论加入公开列表；展示已审核回复树、回复目标、空态和可恢复错误提示。

来源：FE-03。

#### Scenario: 评论审核与回复验收
- **WHEN** 提交回复后其他访客刷新或接口失败
- **THEN** 公开列表不泄露待审内容，已审回复层级正确且失败有可见提示

### Requirement: 受控客户端遥测

系统 SHALL 仅开发环境输出调试日志，匿名错误进入独立限流校验的遥测入口，不具备日志查询或清空权限；客户端去重防抖且上报失败不递归上报。

来源：FE-04。

#### Scenario: 受控客户端遥测验收
- **WHEN** 生产访客连续触发同一错误且上报失败
- **THEN** 无调试刷屏、无循环 401 请求且客户端仍可使用

### Requirement: 可读与可访问阅读交互

系统 SHALL 提供 h1–h3 唯一锚点目录、滚动高亮、回顶部、语义主题色、图片键盘预览关闭与焦点恢复、非首屏图片 lazy/async、字数和按每分钟 400 字向上取整至少 1 分钟的阅读估时。

来源：FE-05 FE-06 FE-07。

#### Scenario: 可读与可访问阅读交互验收
- **WHEN** 在浅色主题阅读含重复标题和多图长文并使用键盘
- **THEN** 文字清晰、目录准确、预览可 Escape 关闭且恢复焦点，阅读时长可见

