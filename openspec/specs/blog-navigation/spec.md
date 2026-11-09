# blog-navigation Specification

## Purpose
TBD - created by archiving change harden-blog-platform. Update Purpose after archive.
## Requirements
### Requirement: 可直达导航

系统 SHALL 提供首页、/article/:slug、/category/:name、/tag/:name、标签入口、关于页与未找到视图，Header 与列表使用 URL 导航；仅 GET/HEAD HTML 导航执行 SPA 回退，排除 /api、/uploads 及缺失静态资源。

来源：ARCH-01 ARCH-03 ARCH-04。

#### Scenario: 可直达导航验收
- **WHEN** 直接打开文章、刷新、前进后退或访问不存在的 API
- **THEN** 文章视图保持一致；未知页面显示未找到，未知 API 与缺失资源返回 404 而非 HTML

### Requirement: 单一设置来源

系统 SHALL 由 SettingsProvider 唯一请求设置，ThemeProvider 消费该状态，卸载时清理轮询和监听器。

来源：ARCH-02。

#### Scenario: 单一设置来源验收
- **WHEN** 经过一次 30 秒刷新或页面恢复可见
- **THEN** 只触发一组设置刷新且主题与设置同步

### Requirement: 可维护管理与可靠代理

系统 SHALL 默认提供同源React工作台并复用公共文章服务，保留现有管理能力且补齐评论审核；默认无需静态管理代理。兼容期显式启用旧静态管理端时保持独立CSS/JS、JWT校验、pagination、上游状态及内容类型、10秒超时与统一上传业务；公开导航和阅读能力保持。

#### Scenario: 统一管理入口
- **WHEN** 作者从首页登录并编辑文章
- **THEN** 同一origin完成工作台保存发布，无需访问3033

#### Scenario: 旧端过渡
- **WHEN** 运维显式开启legacy-admin并遇上游超时或非JSON
- **THEN** 分页不丢失，超时504，非JSON不造成解析崩溃
