## ADDED Requirements

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

系统 SHALL 提供多阶段 Dockerfile 和 Compose，声明兼容 Vite 与原生模块的 Node 版本、非 root 运行、持久化数据库上传和日志、健康检查；管理端口仅发布到宿主机回环。

来源：OPS-06。

#### Scenario: 持久化容器交付验收
- **WHEN** 执行 docker compose up -d、创建数据并重建容器
- **THEN** 服务健康、内容保留、匿名无法管理且管理端口不暴露公网
