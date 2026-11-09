# production-operations Specification

## Purpose
TBD - created by archiving change harden-blog-platform. Update Purpose after archive.
## Requirements
### Requirement: 安全高效响应

系统 SHALL 对带内容哈希资源设置一年 immutable 缓存，对 HTML no-cache、上传图片七天可验证缓存；协商传输压缩并发送安全响应头，CSP 允许已核准的字体及 WebGL 资源。

来源：OPS-01 OPS-02 OPS-03。

#### Scenario: 安全高效响应验收
- **WHEN** 请求哈希 JS、首页及上传图片并携带 gzip 支持
- **THEN** 缓存策略分别正确、可压缩响应带 Content-Encoding/Vary，安全头存在且主题和管理功能不被阻断

### Requirement: 真实健康状态

系统 SHALL 在 /health 执行 SQLite SELECT 1 并返回有限的运行时间和内存概况，依赖不可用时返回 503 且不泄露路径或凭据。

来源：OPS-04。

#### Scenario: 真实健康状态验收
- **WHEN** 数据库探测失败
- **THEN** 健康检查返回 503 而非假成功

### Requirement: 可恢复在线备份

系统 SHALL 通过 SQLite 在线备份生成一致快照，按日调度，保留最近七天，仅删除指定备份目录内匹配命名的过期备份，报告失败并提供恢复步骤。

来源：OPS-05。

#### Scenario: 可恢复在线备份验收
- **WHEN** 数据库持续写入时执行备份并恢复到临时目录
- **THEN** 完整性校验成功且可读取已提交数据，轮转不删除源数据库或其他文件

### Requirement: 持久化容器交付

系统 SHALL 提供兼容Node与原生模块的多阶段构建、非root与持久卷及真实健康检查；默认仅一个Web服务和公开端口，继续默认每日在线备份及七天轮转；旧管理端仅显式legacy-admin profile启用且宿主回环绑定；重建保留账号、文章、媒体、主题、统计和工作副本。

#### Scenario: 默认启动
- **WHEN** docker compose up -d启动默认配置
- **THEN** 公共页/登录/studio同源可用，无默认3033暴露，备份按日运行

#### Scenario: 重建恢复
- **WHEN** 创建草稿并更换背景后重建容器
- **THEN** 数据与会话状态按设计保留，背景和原文章地址可用，备份可恢复
