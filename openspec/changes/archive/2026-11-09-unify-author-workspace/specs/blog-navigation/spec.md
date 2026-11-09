## MODIFIED Requirements

### Requirement: 可维护管理与可靠代理

系统 SHALL 默认提供同源React工作台并复用公共文章服务，保留现有管理能力且补齐评论审核；默认无需静态管理代理。兼容期显式启用旧静态管理端时保持独立CSS/JS、JWT校验、pagination、上游状态及内容类型、10秒超时与统一上传业务；公开导航和阅读能力保持。

#### Scenario: 统一管理入口
- **WHEN** 作者从首页登录并编辑文章
- **THEN** 同一origin完成工作台保存发布，无需访问3033

#### Scenario: 旧端过渡
- **WHEN** 运维显式开启legacy-admin并遇上游超时或非JSON
- **THEN** 分页不丢失，超时504，非JSON不造成解析崩溃
