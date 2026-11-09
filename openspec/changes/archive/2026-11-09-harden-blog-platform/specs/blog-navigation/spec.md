## ADDED Requirements

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

系统 SHALL 将管理 CSS 与功能 JS 拆成独立资源，保持现有功能；代理保留 pagination、上游状态和内容类型，设置 10 秒超时，上传复用公共业务实现。

来源：ARCH-05 ARCH-06。

#### Scenario: 可维护管理与可靠代理验收
- **WHEN** 浏览管理分页、上传图片或上游超时及返回非 JSON
- **THEN** 分页总数保留、上传无双份逻辑，超时返回 504，非 JSON 不导致 JSON 解析崩溃
