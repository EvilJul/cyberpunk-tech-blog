## MODIFIED Requirements

### Requirement: 持久化容器交付

系统 SHALL 提供兼容Node与原生模块的多阶段构建、非root与持久卷及真实健康检查；默认仅一个Web服务和公开端口，继续默认每日在线备份及七天轮转；旧管理端仅显式legacy-admin profile启用且宿主回环绑定；重建保留账号、文章、媒体、主题、统计和工作副本。

#### Scenario: 默认启动
- **WHEN** docker compose up -d启动默认配置
- **THEN** 公共页/登录/studio同源可用，无默认3033暴露，备份按日运行

#### Scenario: 重建恢复
- **WHEN** 创建草稿并更换背景后重建容器
- **THEN** 数据与会话状态按设计保留，背景和原文章地址可用，备份可恢复
