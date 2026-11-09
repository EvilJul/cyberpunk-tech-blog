# 作者工作区能力迁移基线与验收核对

审计日期：2026-11-09。对象为共享工作区当时的源码快照；并行实现会继续变化，合并验收前需复核。只读实现与测试，未启动服务、未运行测试、未访问真实业务数据、未执行 Docker 或端到端验收。本文件不宣称功能已通过；测试文件存在、按钮存在、接口实现存在分别只说明对应源码证据。

> 下列基线、缺口与“未运行”措辞保留首次静态审计时的事实；最新实施和运行结论以文末“最终集成验收”及 implementation-verification.md 为准。

## 范围与证据口径

旧版基线来自当前 `admin/index.html`、`admin/js/{state,settings,theme,crop,uploads,articles,taxonomy,core,auth,events}.js`，不是从 Git 历史恢复的不可变发布版本。新目标来自 `openspec/changes/archive/2026-11-09-unify-author-workspace/{design,tasks}.md` 与其 author-workspace/shared-article-writing/comment-moderation/browser-author-sessions 等规格。新实现主要来自 `src/components/studio/{ManagementPages,ArticleEditor,ArticleManager,StudioLayout}.jsx`、`src/contexts/SettingsContext.jsx`、`src/themes/index.js`；设置/上传事实另核对 `server/routes/{settings,studio,upload}.js`。

按仓库约定先查询知识图谱，工具返回本仓库未索引（仅列出其他项目），故回退到明确文件读取。没有重新建立索引或修改他人文件。

下文“已见实现”仅表示静态阅读可定位路径；“已有测试”仅表示读到了断言，**本次均未执行，不等同通过**。“缺口”区分明确缺少交互与尚缺验收证据；不能将计划要求当作现有能力。最终 Docker、真实后端与浏览器端到端验收由父任务负责；Cookie override 由认证工作者负责。

## 表格证据标识（caption）

**本表“旧行为”均为静态基线描述，不是已经证实可用的发布能力。** 各行按以下证据等级理解：

- **L：旧 UI 标签/说明**：仅看见文案或控件。例：旧“评论管理功能开发中”和邮箱“用于联系或评论通知”不证明审核/邮件通知可用。
- **S：静态实现支持**：已看见事件绑定、处理函数及请求/状态路径；旧裁剪、主题JSON、设置字段属于S。它证明存在实现，不能证明真实后端接受或读者渲染正确；新UI对应描述同样只算S。
- **T：测试定义支持**：读到明确断言，但未执行或无本次通过证据。此前表格中的“有对应断言”均为T。
- **V：本次运行确认支持**：只对本次实际运行并通过的具体断言标记，列明命令与边界；未标V的能力不得称“已确认支持”。本基线审计轮次没有旧/新作者UI的V证据；后续B API测试的通过不转移为作者UI的V证据。

旧/new列不是运行状态列；例如“13设置字段”指源码清单，“上传成功提示”指成功分支存在，“裁剪512×512”指canvas输出配置。缺少实际运行证据时统一读作S，而不是“confirmed supported”。

## 功能迁移对照

| 能力 | 旧实现基线 | 新目标及已见实现 | 差异/所需证据 |
| --- | --- | --- | --- |
| 入口与身份 | admin/auth、bootstrap 登录与 JWT，独立3033；退出登录 | StudioLayout 管理员会话门禁、返回博客、退出；Login/Setup 页面；同源9098与开发9099 | 新会话不继承旧端口授权；需真实服务验证首装、登录、returnTo、退出和403；不能用模拟API证明后端安全 |
| 概览统计 | core.loadStats 显示文章总数、分类数、标签数、站点访问量 | 设计要求 `/studio` 作者概览；当前 StudioLayout 导航、ArticleManager列表可见文章总数 | 所读工作区文件未见旧四项统计卡片的等价概览；需父任务确认补齐或明确产品取舍 |
| 文章列表 | articles.loadArticles，10条分页；表格显示标题、状态、分类、标签、发布日期；编辑/删除 | ArticleManager 20条分页、状态筛选、版本/工作副本提示、编辑/带条件删除确认 | 未见旧分类/标签/日期列；设计的 search 筛选未见输入控件；需分页与删除后页边界验收 |
| 写作字段 | 标题、slug、分类下拉、逗号标签、作者、正文、状态；保存时按 settings.excerpt 自动取摘要并写日期 | ArticleEditor 标题、slug、作者、分类文本输入、摘要、标签、正文；独立保存/发布/撤回 | 摘要改为显式输入，日期/状态由服务动作决定；分类下拉改为自由文本需确认引用验证与反馈；cover/canonical 在内部form中保留，未见可视编辑控件 |
| Markdown 辅助 | uploads.insertMd/insertLine：粗体、斜体、删除线、行内代码、H1/H2/H3、无序/有序列表、引用、分隔线、链接、图片 | 编辑器纯Markdown文本、共用 MarkdownContent 预览、选文件插图 | 未见上述快捷工具栏；不得称编辑辅助全迁移 |
| 正文图片 | 文件选择、编辑区粘贴图片、上传区拖放/多文件、光标处插入Markdown | ArticleEditor 文件选择、大小/类型前检、光标位置插入、失败保留正文；MediaPage复制地址/Markdown | 未见新编辑器 onPaste/onDrop 多图上传；编辑器上传字段 file，ManagementPages 使用 image，需后端真实multipart兼容验收 |
| 本机恢复与并发 | articles.bindDraftAutosave 一秒防抖，文章ID/新文键，无账号隔离；关闭编辑器清理 | ArticleEditor 按账号+文章/新文UUID隔离，本机时间/revision，确认恢复、导出/丢弃；迟到响应序号、冲突比较/重载/另存 | 已见实现不证明离线、401、413、后退/切账号和存储禁用全部正确；需逐项验收，尤其新建后导航及退出清理 |
| 保存与发布 | saveArticle(status) 直接上传状态，已发表内容可直接更新 | 共享工作副本、数值revision，保存与发布分开、撤回、旧slug失效二次确认 | article-workspace 与 studio-management 有对应断言；仍需真实公开查询/FTS/RSS/SEO/关联隔离验收 |
| 分类 | taxonomy 表格含名称、slug、说明、文章数；创建/修改三字段、删除确认 | TaxonomyPage 名称、说明、数量、编辑/删除 | 当前表单未见slug输入，也未显示slug；不能以名称CRUD覆盖旧slug能力 |
| 标签 | taxonomy 表格含名称、slug、说明、文章数；创建/修改三字段 | TaxonomyPage 标签只显示名称/数量；提交带description状态但标签无说明输入 | 未见slug及description编辑控件；需保留既有slug/说明并验证改名与文章引用事务 |
| 评论 | admin/index.html 明确为“评论管理功能开发中”，不能算旧版可用能力 | CommentsPage pending/approved/rejected/全部筛选、20条分页、审核、级联删除确认 | 属新增补全；studio-management有祖先链隐藏/恢复与级联断言，仍非真实UI通过 |
| 媒体库 | 旧版以正文/头像/背景上传为主，无所读独立媒体库 | MediaPage列表分页、名称/大小/预览、上传、复制URL/Markdown及复制失败提示；无删除 | 首版不删除符合规格；需既有背景/头像引用不受影响与子路径复制地址验收 |
| 设置与主题 | 见下方逐字段清单、500ms自动保存、预设与预览、JSON导入导出 | SettingsPage/AppearancePage递归字段、显式保存、JSON、默认恢复、上传并刷新SettingsProvider | 自动保存改为显式保存；必须显示待保存及失败，逐字段持久化/重载后比较 |
| 账号安全 | 所读旧页只有登录/退出，未见等价改密码界面 | AccountPage旧/新密码、撤销全部会话提示、退出、重新登录 | auth测试有密码/撤销断言；本次不判定通过，Cookie覆盖由认证工作者处理 |
| 日志 | 所读旧页与模块未见完整日志管理UI，不把后端接口当旧UI能力 | LogsPage等级筛选、分页、安全元信息、清空确认 | studio-management有脱敏和清空CSRF断言；需真实页与轮转文件清理验收 |
| 发布集成 | 无 | StudioLayout按capabilities隐藏未启用入口，IntegrationsPage属于B新增 | 不在本次API cross-contract审查范围；后端稳定后另审，不把新增能力算旧版迁移完成 |

## 设置全部基线字段

旧 `admin/js/state.js` 有13个基本字段及保存时加入的 theme；`settings.applySettings/saveSettings` 对应控件与保存，头像独立上传。新 SettingsEditor 把响应中除theme外所有键递归交给Fields；这只保证“响应里存在时可见”，不是稳定字段schema或逐字段验收。

| 字段 | 旧行为 | 新静态对应与待验收 |
| --- | --- | --- |
| title | 站点标题文本、自动保存 | 递归文本，显式保存；读者页标题同步 |
| description | 站点描述文本 | 递归文本；页面与SEO实际消费需验收 |
| grid | 布局开关 | boolean checkbox；读者布局实际变化 |
| footer | 页脚开关 | boolean checkbox；读者页脚显隐 |
| excerpt | 摘要长度整数，并用于旧建文摘要截取 | number输入；新编辑器显式excerpt，不可声称仍自动截取 |
| perpage | 每页篇数整数 | number输入；公开分页与刷新验证，测试仅写入8再reset为10 |
| color | 强调色选项，active状态 | 通用文本，不再是旧色板交互；实际主题消费需验收 |
| sidebar | 侧栏位置select | 通用文本；允许值、位置与隐藏组合需验收 |
| author | 站点作者及旧文章默认作者 | 通用文本；新建文默认user.username，默认作者语义有差异 |
| avatar | 图片预览、交互裁剪上传并自动保存 | URL输入、自动居中上传，需再点击保存；交互裁剪缺口见下 |
| bio | 作者简介 | 通用文本；持久化与侧栏显示 |
| github | GitHub链接 | 通用文本；安全链接和显示 |
| email | 联系邮箱 | 通用文本；显示/链接，不据字段描述承诺邮件通知 |
| theme | 嵌套主题配置 | 独立AppearancePage及完整JSON；见下表 |

`showSidebar` 见 SettingsContext 默认与新字段标签，但不在旧state或服务默认13字段中；仅响应有该键时新表单显示，不据标签存在宣称完整可配置。旧服务允许保留额外顶层键；不得无检查丢弃升级前设置。测试需在一次性副本加入已知值与额外键，保存、重载、重启后比较。

## 主题逐字段与预设

| 分组 | 旧主题明确键 | 新实现与风险 |
| --- | --- | --- |
| 标识 | name、preset；cyberpunk/minimal/dark预设；颜色修改转换custom | Fields编辑name/preset，预设来自src/themes。未见颜色修改自动转custom的等价逻辑；导入custom后select无custom选项，需浏览器核对 |
| background | image、size、position、repeat、overlay | 递归字段/上传背景；旧repeat写死no-repeat，旧UI可选size/position、滑块overlay、预览遮罩/尺寸。新表单可编辑repeat，未见等价背景预览/尺寸和遮罩滑块；需覆盖overlay=0及非默认位置 |
| colors | background、surface、surfaceLight、border、primary、primaryLight、primaryDark、secondary、secondaryLight、accent、accentLight、textPrimary、textSecondary、textMuted、success、warning、error、info（18项） | 有值即递归文本输入；旧为颜色选择器+HEX联动与HEX校验，新不能声称等价色板/实时预览 |
| fonts | heading、body、code | 递归文本；需读者渲染及字体回退验收 |
| effects | pixelSnow、sideRays、splashCursor、gridOverlay、glassEffect、animations | 递归checkbox。新预设使用enableAnimations，旧数据使用animations；两个键语义需ThemeProvider与真实读者页对照，不能凭名称认定兼容 |
| borderRadius | sm、md、lg、xl | 递归文本；需保存与读者圆角验收 |

新预设还含 id、description、colors.accentGlow、spacing.unit、borderRadius.full；与旧存储schema不完全相同。服务 settings.mergeTheme 只构造 name/preset/background/colors/fonts/effects/borderRadius，嵌套颜色/特效/圆角额外键可随合并保留，但顶层 id/description/spacing 不在返回结构中。选预设后导出再保存重载存在字段丢失风险，需明确规范或保留策略；本次不改后端。

旧 updateThemePreview 会给预览卡片、文字、按钮、徽章应用颜色、字体和圆角。新 SettingsEditor 没有等价主题预览区；保存后refreshSettings路径存在，不等同实时预览已迁移。SettingsProvider已有请求时refreshSettings直接返回，需验收并发读取时保存后的刷新结果。

## JSON 导入、导出与重置精确对照

| 动作 | 旧实现 | 新静态实现 | 需要的实际验收 |
| --- | --- | --- | --- |
| 主题导出 | theme.exportTheme 从readThemeFromUI取值，缩进JSON，application/json，theme-名称-时间.json，Blob下载并释放URL | download(draft.theme,'theme.json')；当前未保存草稿也会导出，缩进JSON/Blob/释放URL | 捕获真实download、解析键和值；不能用“按钮存在”替代下载可用 |
| 主题导入 | FileReader+JSON.parse，必需colors/fonts/effects/borderRadius；缺失告警；合并cyberpunk默认background/颜色/字体/特效/圆角；preset强制custom，名称回退；待用户保存；清空file input | file.text+JSON.parse；要求对象非数组，appearance只检查colors/fonts存在；直接change(parsed)，不合并默认、不强制custom；提示检查后保存；清空file input | 旧合法导出文件往返；缺effects/radius、嵌套类型错误、空对象、损坏JSON、重复选同文件；确认错误不破坏当前草稿和服务端配置 |
| 全设置JSON | 所读旧UI没有独立全设置导入导出 | SettingsPage导出整个draft；导入浅合并 {...draft,...parsed}，可连theme覆盖；高级JSON失焦解析并要求对象 | 设置与主题文件类型区别，导入后确认再保存、失败可恢复；浅合并不能证明嵌套全保留 |
| 高级JSON | 旧以主题文件为主 | textarea显示shown，blur解析；非法提示未应用 | 输入错误后保留此前配置；appearance及settings两模式分别验证 |
| 默认恢复 | 旧settings后端已有reset/default-theme，不据接口存在认定旧UI有按钮 | appearance GET default-theme后PUT主题；settings POST reset，确认并刷新 | 验证只恢复主题与全部设置的范围；appearance确认文案称“保存后生效”，代码实际立即PUT，需对齐交互 |

最小JSON验收fixture应显式覆盖13基本字段、18颜色、3字体、6旧特效、4圆角、5背景字段，含Unicode名称、overlay=0、false布尔值及非默认分页。分别做导出→修改→导入→保存→GET→刷新/重启→再导出比较，另验证未知/新增键保留规则。此fixture和浏览器流程**尚未在本次创建或运行**。

## 头像裁剪与上传

旧 `crop.js` 是完整交互流程：FileReader解码，响应窗口尺寸的canvas（最大440，受窗口宽高约束），居中方形初选；圆形遮罩/边框/十字线，64×64圆形与方形预览；鼠标拖动选区且约束边界；crop-zoom滑块改变选区尺寸（最小40）；原图坐标裁剪到512×512，JPEG质量0.92，确认/取消，上传avatar后更新预览并saveSettings。不要把圆形预览误写成输出透明圆形图片，实际输出是方形JPEG。

新 ManagementPages 的头像上传直接传原文件、type=avatar，并提示“自动居中裁剪”；server/routes/upload.js存在avatar resize分支。未见新可拖动/缩放的裁剪框、双预览或裁剪取消流程。**自动居中与可选区域裁剪能力不等价，交互裁剪属于明确迁移缺口。** 后续若有意缩减，应记录产品决策，不能默认为已保留。

当前studio-management媒体断言仅上传4×3 PNG并检查成功/URL及列表，未校验像素位置、输出512×512、用户选区、质量或预览。需非居中主体测试图片、拖动/缩放/取消/确认、输出尺寸与像素区域检查；另测5MB边界、4000万像素、伪格式、上传失败保留原头像/正文、背景上传不进入正文、子路径URL与既有引用保留。B机器媒体是另一协议，不用其JPEG转码测试替代作者裁剪验收。

## 测试证据登记（仅阅读，本次未运行）

| 文件 | 实际读到的覆盖 | 不能据此声称 |
| --- | --- | --- |
| tests/admin-ui.test.js | 旧UI模拟API登录、转义、分页、编辑发布、切暗色并保存theme、退出/CSP | 旧主题JSON、裁剪或真实API曾通过 |
| tests/studio-management.test.js | 管理员/CSRF/来源；分类标签名称CRUD与冲突；评论祖先链/删除；设置avatar/perpage/部分background/fonts合并/reset；日志脱敏/清空；媒体伪格式/上传/列表/无删除；文章条件写 | 全设置逐字段、主题JSON浏览器往返、预设全字段保留、交互裁剪、真实媒体插入、完整管理UI已通过 |
| tests/author-workspace-ui.test.js | safeReturnTo、模拟fetch的Cookie/CSRF/数值ETag/冲突、multipart边界；浏览器测试dist+模拟API的登录/迟到保存/冲突保留/显式发布 | 真实后端身份/事务、settings/appearance/media/taxonomy管理页、Docker端到端已通过；multipart测试用file也不证明所有调用方字段兼容 |
| tests/article-workspace.test.js | 共享工作副本/版本/目录隔离与原子发布、slug预留、故障与integration policy断言 | 读者UI/SEO及跨层所有路径均已验收 |
| tests/author-auth.test.js | 首装、cookie/session、origin、前缀/轮换、Secure本地覆盖、密码撤销的测试定义 | 本次认证测试通过；认证工作者负责实现与执行证据 |
| tests/homepage-regressions.test.js | 配置背景和整卡交互的浏览器回归定义 | 管理页保存/导入后实际改变读者背景的完整链路 |
| tests/subpath-browser.test.js | /blog/构建与读者资源/API/文章链接/canonical定义 | 工作台子路径登录、Cookie、CSRF、设置及媒体上传全链路 |
| tests/frontend-acceptance.test.js、tests/security.test.js | 读者浏览器与隔离安全验收入口 | 替代作者全能力迁移验收 |
| tests/publishing-api.test.js | B来源/凭据/权限/幂等/媒体/生命周期与失败回滚等测试定义 | 本次API cross-contract审查或实际通过；留待后端稳定后另审 |

## 交付前应补齐的证据

1. 作者UI所有者处理或明确记录裁剪、工具栏、粘贴/拖放、多字段分类标签及统计概览差异；设计要求的文章search需可操作入口。
2. 设置/主题所有者固定字段保留规则，重点检查animations/enableAnimations、spacing与预设额外键、custom标识、默认恢复实际生效时间及JSON导入完整性。
3. 在真实后端的临时数据目录运行逐字段与JSON往返、上传插入及失败恢复，不以模拟API浏览器测试替代；BLOG_DATA_DIR必须在导入任何数据库/设置模块前设置。
4. 父任务统一记录实际命令、退出码/通过数、对应源码版本、截图与容器/恢复证据，明确未运行项；不改任务复选框来代替测试。

本次写入仅此审计文件；没有执行功能测试，因此所有迁移能力的最终通过状态保持待父任务验收。


## 最终集成验收（2026-11-09）

初期缺口已通过实现与实际验收关闭：作者概览/搜索和列表元信息；Markdown 全部标题级别、删除线和行内代码；粘贴/拖放多图；分类标签 slug/说明；全部设置及主题 JSON 往返、custom 标识与扩展字段保留；可拖动/缩放、双预览、取消和512像素JPEG输出的头像裁剪。主题与站点保存仍采用明确提交，摘要采用显式输入，不承诺旧自动摘要行为。

- `npm run build`：通过，保留大包体积提示。
- `npm test`：96 项通过、0 失败，包含真实浏览器与隔离后端；测试日志 `test-results/two-changes-tests.log`。
- `author-e2e` 验证首页登录、草稿/公开快照隔离、发布、冲突、评论、背景与退出；`studio-management-ui` 的10个子场景覆盖实际管理操作、裁剪像素和上传失败重试、主题导入导出；`studio-integrations-ui` 的5个子场景验证一次性密钥、审计、轮换、撤销及禁用。
- `author-subpath` 使用独立 `/blog/` 构建验证登录、Cookie Path、写作发布、插图与设置CSRF，根路径读写均404；原读者子路径/移动端/背景/整卡回归同时通过。
- `author-migration` 验证旧账号哈希、ID/URL保留、重复迁移及注入失败后的整个事务回滚。安全与并发测试包含跨进程首装、密码变更竞态、机器归属和幂等重试。

证据位于 `test-results/author-workspace/`、`studio-management-ui/`、`studio-integrations-ui/`。子路径作者流程证据记录于完整测试日志，不单列截图目录。受测工作区代码摘要见 `test-results/two-changes-source.json`。容器与恢复的最终结果见 [实施验收](implementation-verification.md)；没有操作真实业务数据或接入真实中台。
