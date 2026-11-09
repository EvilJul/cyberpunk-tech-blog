# search-discovery Specification

## Purpose
TBD - created by archiving change harden-blog-platform. Update Purpose after archive.
## Requirements
### Requirement: 订阅和索引

系统 SHALL 提供 /rss.xml、/sitemap.xml、/robots.txt，使用配置的站点绝对基址，XML 转义；RSS 输出最新 20 篇发布文章，站点地图完整覆盖可访问已发布文章及有效分类标签页。

来源：SEO-01 SEO-02。

#### Scenario: 订阅和索引验收
- **WHEN** 发布文章、保留草稿并请求订阅和站点地图
- **THEN** 输出有效 XML、正确 Content-Type、无草稿和管理链接，robots 声明 Sitemap 并排除管理与 API

### Requirement: 分享元信息与语义

系统 SHALL 为文章提供 title、description、OpenGraph、Twitter Card 和无追踪参数 canonical，在原始 HTTP HTML 中输出已发布文章元信息并在客户端导航后同步；正文使用合理标题层级及 article/main/time 语义。

来源：SEO-03 SEO-04。

#### Scenario: 分享元信息与语义验收
- **WHEN** 不执行 JavaScript 的客户端抓取文章或浏览器切换文章
- **THEN** 直接获得对应文章转义后的标题摘要封面和 canonical，不复用上一文章信息

