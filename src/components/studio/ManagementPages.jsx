import StudioAppearanceControl from './StudioAppearanceControls'
import StudioAppearancePreview from './StudioAppearancePreview'
import StudioColorField, { StudioThemePreview } from './StudioColorField'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { studioApi as studioFetch } from '../../utils/studioApi'
import { apiUrl } from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { themes } from '../../themes'
import StudioImageField from './StudioImageField'
import StudioPageHeader from './StudioPageHeader'

// Accept the shared fetch contract: a Response, with structured errors on failure.
/** 统一读取工作台接口的响应数据。 */
async function request(path, options = {}) {
  const response = await studioFetch(path, options)
  if (typeof response?.json !== 'function') return response
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.error?.message || data.error || '请求失败')
  return data
}
const write = /* 组装 JSON 写请求参数。 */ (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})
/** 展示操作反馈信息。 */
function Notice({ value }) {
  return (
    <p role="status" aria-live="polite">
      {value}
    </p>
  )
}
/** 管理列表加载、写操作及反馈状态。 */
function useCollection(path) {
  const [data, setData] = useState(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const reload = /* 刷新当前数据并反馈加载失败。 */ async () => {
    try {
      setData(await request(path))
    } catch (e) {
      setMessage(e.message)
    }
  }
  useEffect(/* 按接口地址加载列表并忽略卸载后响应。 */ () => {
    let alive = true
    request(path)
      .then(/* 接收请求结果并更新页面状态。 */ (value) => {
        if (alive) setData(value)
      })
      .catch(/* 处理请求失败并保留当前页面内容。 */ (e) => {
        if (alive) setMessage(e.message)
      })
    return /* 卸载后停止更新列表状态。 */ () => {
      alive = false
    }
  }, [path])
  const run = /* 执行操作并统一处理忙碌状态与错误反馈。 */ async (fn) => {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      await reload()
      setMessage('操作成功')
    } catch (e) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }
  return { data, message, setMessage, busy, reload, run }
}
/** 管理分类或标签并保留文章引用。 */
function TaxonomyPage({ type, title }) {
  const { data, message, busy, run } = useCollection(`/api/studio/${type}`)
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [description, setDescription] = useState('')
  return (
    <section>
      <StudioPageHeader
        title={`${title}管理`}
        description={`维护${title}的名称、地址别名与关联文章数量；删除${title}不会删除文章。`}
      />
      <Notice value={message} />
      <form
        className="studio-manage-form"
        onSubmit={/* 提交分类或标签新增编辑并清空表单。 */ (e) => {
          e.preventDefault()
          run(/* 提交当前管理请求并更新操作结果。 */ async () => {
            await request(
              `/api/studio/${type}${editing ? `/${editing}` : ''}`,
              write(editing ? 'PUT' : 'POST', { name, slug, description })
            )
            setName('')
            setSlug('')
            setDescription('')
            setEditing(null)
          })
        }}
      >
        <h2 className="studio-manage-form-title">
          {editing ? `正在编辑：${name || '未命名'}` : `新增${title}`}
        </h2>
        <div className="studio-fields">
          <label>
            名称
            <input
              required
              maxLength={100}
              value={name}
              onChange={/* 更新分类或标签名称。 */ (e) => setName(e.target.value)}
            />
          </label>
          <label>
            URL 别名
            <input
              placeholder="留空按名称生成"
              value={slug}
              onChange={/* 更新地址字段。 */ (e) => setSlug(e.target.value)}
            />
          </label>
          {type === 'categories' && (
            <label>
              说明
              <input
                value={description}
                onChange={/* 更新说明字段。 */ (e) => setDescription(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="studio-actions">
          <button disabled={busy}>{editing ? '保存修改' : `新增${title}`}</button>
          {editing && (
            <button
              type="button"
              className="studio-button--ghost"
              onClick={/* 取消分类或标签编辑并清空表单。 */ () => {
                setEditing(null)
                setName('')
                setSlug('')
                setDescription('')
              }}
            >
              取消
            </button>
          )}
        </div>
      </form>
      <ul className="studio-row-list">
        {(data || []).map(/* 将当前条目映射为展示内容。 */ (item) => (
          <li key={item.id}>
            <div className="studio-row-main">
              <strong>{item.name}</strong> <code>{item.slug}</code>
              {item.description && <span className="studio-row-note">{item.description}</span>}
              <span className="studio-row-count">{item.count || 0} 篇</span>
            </div>
            <div className="studio-row-actions">
              <button
                onClick={/* 将当前分类或标签载入编辑表单。 */ () => {
                  setEditing(item.id)
                  setName(item.name)
                  setSlug(item.slug || '')
                  setDescription(item.description || '')
                }}
              >
                编辑
              </button>
              <button
                className="studio-button--danger"
                disabled={busy}
                onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
                  if (window.confirm(`删除${title}“${item.name}”？文章会保留。`))
                    run(/* 提交当前管理请求并更新操作结果。 */ () =>
                      request(`/api/studio/${type}/${item.id}`, {
                        method: 'DELETE'
                      })
                    )
                }}
              >
                删除
              </button>
            </div>
          </li>
        ))}
        {data && !data.length && (
          <li className="studio-row-empty">暂无{title}，先在上方新增一个。</li>
        )}
      </ul>
    </section>
  )
}
/** 展示分类管理入口。 */
export function CategoriesPage() {
  return <TaxonomyPage type="categories" title="分类" />
}
/** 展示标签管理入口。 */
export function TagsPage() {
  return <TaxonomyPage type="tags" title="标签" />
}
/** 按每页二十条提供分页导航。 */
function Pager({ offset, total, onChange }) {
  return (
    <nav className="studio-pager" aria-label="分页">
      <button
        disabled={!offset}
        onClick={/* 切换到上一页且不低于首页。 */ () => onChange(Math.max(0, offset - 20))}
      >
        上一页
      </button>
      <span className="studio-pager-info">
        共 {total || 0} 条，第 {offset / 20 + 1} 页
      </span>
      <button
        disabled={offset + 20 >= (total || 0)}
        onClick={/* 切换到下一页。 */ () => onChange(offset + 20)}
      >
        下一页
      </button>
    </nav>
  )
}
/** 评论状态的中文文案映射，供卡片徽章展示。 */
const COMMENT_STATUS_LABELS = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }

/** 筛选、审核及删除评论回复树。 */
export function CommentsPage() {
  const [status, setStatus] = useState('pending'),
    [offset, setOffset] = useState(0)
  const { data, message, busy, run } = useCollection(
    `/api/studio/comments?status=${status}&offset=${offset}&limit=20`
  )
  return (
    <section>
      <StudioPageHeader
        title="评论审核"
        description="待审核评论在通过后公开；祖先被拒绝或删除时，其后代不会公开显示。"
      />
      <div className="studio-toolbar">
        <label className="studio-toolbar-filter">
          审核状态
          <select
            value={status}
            onChange={/* 更新评论审核筛选并回到第一页。 */ (e) => {
              setStatus(e.target.value)
              setOffset(0)
            }}
          >
            <option value="">全部</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </select>
        </label>
      </div>
      <Notice value={message} />
      {data?.items?.map(/* 将当前条目映射为评论卡片。 */ (item) => (
        <article key={item.id} className="studio-comment-card">
          <header className="studio-comment-head">
            <h2>{item.author}</h2>
            <span className={`studio-badge ${item.status === 'approved' ? 'studio-badge--ok' : item.status === 'rejected' ? 'studio-badge--danger' : 'studio-badge--warn'}`}>
              {COMMENT_STATUS_LABELS[item.status] || item.status}
            </span>
          </header>
          <p className="studio-comment-content">{item.content}</p>
          <small className="studio-comment-meta">
            {item.email} · 文章 {item.article_id}
            {item.parent_id && ' · 回复评论'}
          </small>
          <div className="studio-actions">
            {[
              ['approved', '通过'],
              ['rejected', '拒绝'],
              ['pending', '恢复待审']
            ].map(/* 将当前条目映射为展示内容。 */ ([state, label]) => (
              <button
                key={state}
                disabled={busy || item.status === state}
                onClick={/* 提交当前管理请求并更新操作结果。 */ () =>
                  run(/* 提交当前管理请求并更新操作结果。 */ () =>
                    request(
                      `/api/studio/comments/${item.id}`,
                      write('PATCH', { status: state })
                    )
                  )
                }
              >
                {label}
              </button>
            ))}
            <button
              className="studio-button--danger"
              disabled={busy}
              onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
                if (window.confirm('删除此评论及全部后代回复？此操作无法撤销。'))
                  run(/* 提交当前管理请求并更新操作结果。 */ () =>
                    request(`/api/studio/comments/${item.id}`, {
                      method: 'DELETE'
                    })
                  )
              }}
            >
              删除整棵回复
            </button>
          </div>
        </article>
      ))}
      {data && !data.items?.length && (
        <div className="studio-empty">
          <p className="studio-empty-title">没有需要显示的评论</p>
          <p className="studio-muted-text">切换审核状态查看其他分组的评论。</p>
        </div>
      )}
      <Pager offset={offset} total={data?.total} onChange={setOffset} />
    </section>
  )
}
/** 以表单上传图片并传递裁剪类型。 */
async function upload(file, type = 'normal') {
  const body = new FormData()
  body.append('image', file)
  body.append('type', type)
  return request('/api/studio/media', { method: 'POST', body })
}
const mediaUrl = /* 为本地上传地址补齐部署前缀。 */ (url) => (url?.startsWith('/uploads/') ? apiUrl(url) : url)
/** 展示媒体并提供上传与链接复制。 */
export function MediaPage() {
  const [offset, setOffset] = useState(0)
  const { data, message, setMessage, busy, run } = useCollection(
    `/api/studio/media?offset=${offset}&limit=20`
  )
  return (
    <section>
      <StudioPageHeader
        title="媒体库"
        description="图片最大 5MB。复制链接或 Markdown 后可粘贴到文章编辑器。"
      />
      <form
        className="studio-manage-form"
        onSubmit={/* 阻止上传控件的默认表单提交。 */ (e) => e.preventDefault()}
      >
        <h2 className="studio-manage-form-title">上传图片</h2>
        <div className="studio-fields">
          <label>
            上传图片
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
              onChange={/* 上传所选图片并重置文件输入。 */ (e) => {
                const file = e.target.files[0]
                if (file) run(/* 上传当前选择的图片。 */ () => upload(file))
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {busy && <p role="status">正在上传…</p>}
      </form>
      <Notice value={message} />
      <div className="studio-media-grid">
        {data?.items?.map(/* 将当前条目映射为媒体卡片。 */ (item) => (
          <article key={item.url} className="studio-media-item">
            <a href={mediaUrl(item.url)} target="_blank" rel="noreferrer">
              <img
                src={mediaUrl(item.url)}
                alt={item.name}
                loading="lazy"
              />
            </a>
            <p className="studio-media-name" title={item.name}>
              {item.name} · {Math.ceil(item.size / 1024)} KB
            </p>
            <input
              aria-label="图片地址"
              readOnly
              value={mediaUrl(item.url)}
              onFocus={/* 选中只读内容以便手动复制。 */ (e) => e.target.select()}
            />
            <div className="studio-actions">
              {[
                ['复制地址', mediaUrl(item.url)],
                ['复制 Markdown', `![图片](${mediaUrl(item.url)})`]
              ].map(/* 将当前条目映射为展示内容。 */ ([label, text]) => (
                <button
                  key={label}
                  onClick={/* 复制当前内容并反馈剪贴板失败。 */ async () => {
                    try {
                      await navigator.clipboard.writeText(text)
                      setMessage('已复制')
                    } catch {
                      setMessage('复制失败，请选中上方地址复制')
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {data && !data.items?.length && (
        <div className="studio-empty">
          <p className="studio-empty-title">媒体库还是空的</p>
          <p className="studio-muted-text">上传第一张图片后，即可在文章中引用。</p>
        </div>
      )}
      <Pager offset={offset} total={data?.total} onChange={setOffset} />
    </section>
  )
}
const labels = {
  fonts: '字体',
  colors: '主题颜色',
  effects: '特效开关',
  borderRadius: '圆角',
  spacing: '间距',
  unit: '间距单位',
  full: '完整圆角',
  accentGlow: '强调光晕',
  title: '站点名称',
  description: '站点描述',
  grid: '网格布局',
  footer: '显示页脚',
  excerpt: '摘要字数',
  perpage: '每页文章数',
  color: '强调色',
  sidebar: '侧栏位置',
  showSidebar: '显示侧栏',
  author: '作者名称',
  avatar: '头像地址',
  bio: '作者简介',
  github: 'GitHub 地址',
  email: '联系邮箱',
  wechatName: '公众号名称',
  wechatId: '微信号',
  wechatQr: '公众号二维码',
  name: '主题名称',
  preset: '主题预设',
  image: '背景图片地址',
  size: '背景尺寸',
  position: '背景位置',
  repeat: '背景重复',
  overlay: '背景遮罩透明度',
  heading: '标题字体',
  body: '正文字体',
  code: '代码字体',
  pixelSnow: '粒子雪花',
  sideRays: '侧边光线',
  splashCursor: '光标特效',
  gridOverlay: '背景网格',
  glassEffect: '玻璃效果',
  animations: '动画',
  enableAnimations: '启用动画',
  background: '页面背景',
  surface: '卡片背景',
  surfaceLight: '浅色卡片',
  border: '边框',
  primary: '主色',
  primaryLight: '浅主色',
  primaryDark: '深主色',
  secondary: '辅助色',
  secondaryLight: '浅辅助色',
  accent: '强调色',
  accentLight: '浅强调色',
  textPrimary: '主要文字',
  textSecondary: '次要文字',
  textMuted: '弱化文字',
  success: '成功',
  warning: '警告',
  error: '错误',
  info: '信息',
  sm: '小圆角',
  md: '中圆角',
  lg: '大圆角',
  xl: '特大圆角'
}
/** 按类型递归渲染字段，颜色采用可视控件，图片及公众号二维码就地上传。 */
function Fields({ value, onChange, path = [], onImageChange, onImageBusy, disabled }) {
  return Object.entries(value).map(/* 将当前条目映射为展示内容。 */ ([key, current]) =>
    typeof current === 'object' && current !== null ? (
      <fieldset key={key} className={key === 'colors' ? 'studio-colors' : ['background', 'fonts', 'borderRadius', 'effects'].includes(key) ? 'studio-appearance-grid' : undefined}>
        <legend>{labels[key] || key}</legend>
        {key === 'colors' && <StudioThemePreview colors={current} />}
        <Fields
          value={current}
          path={[...path, key]}
          onImageChange={onImageChange}
          onImageBusy={onImageBusy}
          disabled={disabled}
          onChange={/* 将子配置修改合并回父级配置。 */ (next) => onChange({ ...value, [key]: next })}
        />
      </fieldset>
    ) : path[0] === 'theme' && (['fonts', 'borderRadius', 'effects'].includes(path.at(-1)) || (path.at(-1) === 'background' && ['size', 'position', 'repeat', 'overlay'].includes(key)) || (path.at(-1) === 'spacing' && key === 'unit')) ? (
      <StudioAppearanceControl key={key} path={path} fieldKey={key} label={labels[key] || key} value={current} disabled={disabled}
        onChange={/* 专用控件只更新当前字段，保留原值类型与其他扩展配置。 */ next => onChange({ ...value, [key]: next })} />
    ) : path.includes('colors') && typeof current === 'string' ? (
      <StudioColorField key={key} label={labels[key] || key} value={current} disabled={disabled}
        onChange={/* 仅更新当前颜色，保留其他主题字段和扩展键。 */ next => onChange({ ...value, [key]: next })} />
    ) : (typeof current === 'string' || current == null) && (key === 'wechatQr' || /^(avatar|image|logo|icon|favicon|cover|thumbnail|banner|backgroundImage|background_image)([_-]?(url|src))?$/i.test(key)) ? (
      <StudioImageField key={key} label={labels[key] || key} value={current}
        avatar={key === 'avatar'} background={path.includes('background')}
        upload={upload} resolveUrl={mediaUrl} disabled={disabled} onBusy={onImageBusy}
        onChange={/* 按完整路径回填图片，避免异步上传覆盖其他输入。 */ next => onImageChange([...path, key], next)} />
    ) : (
      <label key={key} style={{ display: 'block', margin: '12px 0' }}>
        {labels[key] || key}{' '}
        {typeof current === 'boolean' ? (
          <input
            type="checkbox"
            checked={current}
            onChange={/* 更新当前布尔配置。 */ (e) => onChange({ ...value, [key]: e.target.checked })}
          />
        ) : (
          <input
            type={typeof current === 'number' ? 'number' : 'text'}
            step="any"
            value={current ?? ''}
            onChange={/* 按原字段类型转换并更新配置输入。 */ (e) =>
              onChange({
                ...value,
                [key]:
                  typeof current === 'number'
                    ? Number(e.target.value)
                    : e.target.value
              })
            }
          />
        )}
      </label>
    )
  )
}
/** 将配置导出为 JSON 并释放临时地址。 */
function download(value, filename) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
/** 校验旧主题分组与叶子类型，补齐默认值且保留自定义扩展，不修改传入对象。 */
function normalizeThemeImport(value, defaults) {
  const groups = ['colors', 'fonts', 'effects', 'borderRadius']
  for (const group of [...groups, 'background', 'spacing']) {
    const supplied = Object.hasOwn(value, group)
    if (!supplied && !groups.includes(group)) continue
    const fields = value[group]
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
      throw new Error(`主题 ${group} 必须是对象，且不能为数组或空值`)
    for (const [key, item] of Object.entries(fields)) {
      const expected = group === 'effects' ? 'boolean'
        : group === 'background' && key === 'overlay' || group === 'spacing' && key === 'unit' ? 'number'
          : group === 'spacing' ? typeof item : 'string'
      if (!['string', 'number', 'boolean'].includes(expected) || typeof item !== expected || typeof item === 'number' && !Number.isFinite(item))
        throw new Error(`主题 ${group}.${key} 类型无效，应为 ${expected}`)
    }
  }
  for (const key of ['name', 'preset', 'id', 'description']) {
    if (Object.hasOwn(value, key) && typeof value[key] !== 'string')
      throw new Error(`主题 ${key} 必须是字符串`)
  }
  const merged = { ...value, name: value.name || '导入的主题', preset: 'custom' }
  for (const group of [...groups, 'background'])
    merged[group] = { ...defaults[group], ...value[group] }
  return merged
}

/** 站点设置按用途的分组定义；未列出的键（含扩展键）进入“其他设置”。 */
const SETTINGS_FIELD_GROUPS = [
  { label: '基本信息', keys: ['title', 'description'] },
  { label: '作者资料', keys: ['author', 'avatar', 'bio'] },
  { label: '阅读布局', keys: ['perpage', 'excerpt', 'sidebar', 'showSidebar', 'grid', 'footer', 'color'] },
  { label: '联系信息', keys: ['github', 'email', 'wechatName', 'wechatId', 'wechatQr'] }
]

/** 将站点设置拆分为预置分组与剩余键，未识别字段保留可编辑。 */
function partitionSettings(shown) {
  const groups = SETTINGS_FIELD_GROUPS.map(/* 初始化各分组容器。 */ (group) => ({ label: group.label, value: {} }))
  const rest = {}
  for (const [key, item] of Object.entries(shown)) {
    const index = SETTINGS_FIELD_GROUPS.findIndex(/* 查找当前键所属分组。 */ (group) => group.keys.includes(key))
    if (index >= 0) groups[index].value[key] = item
    else rest[key] = item
  }
  return { groups, rest }
}

/** 按用途展示站点和外观设置，直观控件仅改变待保存配置。 */
function SettingsEditor({ appearance = false }) {
  const { refreshSettings } = useSettings()
  const { data, message, setMessage, busy, run } = useCollection(
    '/api/studio/settings'
  )
  const [draft, setDraft] = useState(null)
  const [imageBusy, setImageBusy] = useState(0)
  /** 累计字段上传状态，上传结束前禁止保存半成品。 */
  const trackImageBusy = /* 合并多个独立字段的并发状态。 */ delta => setImageBusy(/* 累计正在上传的字段数量。 */ current => current + delta)
  /** 使用最新草稿逐层复制路径，保留未知扩展键与并发编辑。 */
  function changeImage(path, url) {
    setDraft(/* 在最新配置上只替换目标图片字段。 */ current => {
      const next = { ...current }
      let target = next
      for (const key of path.slice(0, -1)) {
        target[key] = { ...target[key] }
        target = target[key]
      }
      target[path.at(-1)] = url
      return next
    })
    setMessage('图片已上传，请保存设置')
  }
  useEffect(/* 从服务端设置初始化待编辑配置。 */ () => {
    if (data?.settings) setDraft({ showSidebar: true, wechatName: '', wechatId: '', wechatQr: '', ...data.settings })
  }, [data])
  if (!draft)
    return (
      <section>
        <h1>{appearance ? '外观主题' : '站点设置'}</h1>
        <Notice value={message || '加载中…'} />
      </section>
    )
  const shown = appearance
    ? draft.theme
    : Object.fromEntries(
        Object.entries(draft).filter(/* 筛选符合当前条件的条目。 */ ([key]) => key !== 'theme')
      )
  const change = /* 合并站点或主题的待保存配置。 */ (next) =>
    setDraft(
      appearance ? { ...draft, theme: next } : { ...next, theme: draft.theme }
    )
  const importFile = /* 校验并导入 JSON 为待保存配置。 */ async (file) => {
    try {
      const parsed = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('JSON 必须是对象')
      if (appearance) {
        const { theme: defaults } = await request('/api/studio/settings/default-theme')
        const imported = normalizeThemeImport(parsed, defaults)
        change(imported)
      } else setDraft({ ...draft, ...parsed })
      setMessage('已导入待保存配置，请检查后保存')
    } catch (e) {
      setMessage(e.message)
    }
  }
  /* 站点设置按用途分组渲染；外观沿用主题自身结构递归分组。 */
  const grouped = appearance ? null : partitionSettings(shown)
  return (
    <section>
      <StudioPageHeader
        title={appearance ? '外观主题' : '站点设置'}
        description={
          appearance
            ? '这些配置只影响读者站外观，不改变工作台界面；保存后生效。'
            : '修改后需点击“保存设置”才生效，导入的配置同样需要保存。'
        }
      />
      <Notice value={message} />
      <form
        onSubmit={/* 保存当前配置并刷新统一设置上下文。 */ (e) => {
          e.preventDefault()
          if (imageBusy > 0) return
          run(/* 提交当前管理请求并更新操作结果。 */ async () => {
            await request('/api/studio/settings', write('PUT', draft))
            await refreshSettings()
          })
        }}
      >
        {appearance && (
          <fieldset>
            <legend>主题预设</legend>
            <label htmlFor="studio-theme-preset">套用主题预设</label>
            <select
              id="studio-theme-preset"
              value={draft.theme.preset}
              onChange={/* 将所选主题预设载入待保存配置。 */ (e) =>
                change({ ...themes[e.target.value], preset: e.target.value })
              }
            >
              <option value="custom" disabled>自定义（导入）</option>
              {Object.entries(themes).map(/* 将当前条目映射为展示内容。 */ ([key, theme]) => (
                <option key={key} value={key}>
                  {theme.name}
                </option>
              ))}
            </select>
          </fieldset>
        )}
        {appearance ? (
          <>
            <p className="studio-muted-text">先选一个主题，再按需要调整；所有预览仅在本页生效。</p>
            <nav className="studio-appearance-sections" aria-label="外观设置分区">
              {['背景图片', '字体', '形状与间距', '主题颜色', '特效'].map(/* 快速定位设置分区，避免长页面盲目查找。 */ (label, index) => <a key={label} href={`#appearance-section-${index}`}>{label}</a>)}
            </nav>
            {[
              ['背景图片', ['background']],
              ['字体', ['fonts']],
              ['形状与间距', ['borderRadius', 'spacing']],
              ['主题颜色', ['colors']],
              ['特效', ['effects']]
            ].map(/* 按用户任务排列分区，不直接暴露主题对象字段顺序。 */ ([title, keys], index) => (
              <section key={title} id={`appearance-section-${index}`} className="studio-appearance-section" aria-label={title}>
                <h2>{title}</h2>
                {title === '背景图片' && <p className="studio-muted-text">上传图片后选择铺放方式，位置控制画面焦点；遮罩越深，文字越容易看清。</p>}
                <Fields value={Object.fromEntries(keys.filter(/* 仅展示已有分组，不制造新配置。 */ key => shown[key] !== undefined).map(/* 取出当前任务涉及的主题分组。 */ key => [key, shown[key]]))}
                  onChange={/* 分组编辑保留其他主题数据及自定义扩展。 */ next => change({ ...shown, ...next })} path={['theme']} onImageChange={changeImage} onImageBusy={trackImageBusy} disabled={busy} />
                {title === '背景图片' && <StudioAppearancePreview theme={shown} resolveUrl={mediaUrl} />}
              </section>
            ))}
            <details className="studio-advanced">
              <summary>主题信息与扩展参数</summary>
              <div className="studio-advanced-body">
                <p className="studio-muted-text">主题名称和自定义扩展保留在这里，一般无需修改。主题预设请使用上方选择器。</p>
                <Fields value={Object.fromEntries(Object.entries(shown).filter(/* 已有专用控件和内部预设标识不重复呈现。 */ ([key]) => !['background', 'fonts', 'borderRadius', 'spacing', 'colors', 'effects', 'preset', 'id'].includes(key)))}
                  onChange={/* 编辑额外元数据时保留未展示的主题字段。 */ next => change({ ...shown, ...next })} path={['theme']} onImageChange={changeImage} onImageBusy={trackImageBusy} disabled={busy} />
              </div>
            </details>
          </>
        ) : (
          grouped.groups.map(/* 渲染非空的站点设置分组。 */ (group) =>
            Object.keys(group.value).length ? (
              <fieldset key={group.label}>
                <legend>{group.label}</legend>
                <Fields
                  value={group.value}
                  onImageChange={changeImage} onImageBusy={trackImageBusy} disabled={busy}
                  onChange={/* 将分组修改合并回完整站点配置。 */ (next) => change({ ...shown, ...next })}
                />
              </fieldset>
            ) : null
          )
        )}
        {!appearance && Object.keys(grouped.rest).length > 0 && (
          <fieldset>
            <legend>其他设置</legend>
            <Fields
              value={grouped.rest}
              onImageChange={changeImage} onImageBusy={trackImageBusy} disabled={busy}
              onChange={/* 将剩余字段修改合并回完整站点配置。 */ (next) => change({ ...shown, ...next })}
            />
          </fieldset>
        )}
        <div className="studio-actions">
          <button className="studio-button--primary" disabled={busy || imageBusy > 0}>保存设置</button>
        </div>
      </form>

      <details className="studio-advanced" open={!appearance}>
        <summary>高级配置</summary>
        <div className="studio-advanced-body">
          <p className="studio-muted-text">
            导入的 JSON 只是待保存配置，保存前不会生效；未知扩展键会原样保留在往返导出中。
          </p>
          <div className="studio-actions">
            <button
              onClick={/* 导出当前站点或主题配置为 JSON。 */ () =>
                download(
                  appearance ? draft.theme : draft,
                  appearance ? 'theme.json' : 'settings.json'
                )
              }
            >
              导出 JSON
            </button>
          </div>
          <label>
            导入 JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={/* 导入所选配置文件并重置文件输入。 */ (e) => {
                if (e.target.files[0]) importFile(e.target.files[0])
                e.target.value = ''
              }}
            />
          </label>
          <label>
            高级配置 JSON（失焦应用）
            <textarea
              aria-label="高级配置 JSON"
              key={JSON.stringify(data)}
              defaultValue={JSON.stringify(shown, null, 2)}
              rows={15}
              onBlur={/* 失焦时校验高级 JSON，格式无效时保留原配置。 */ (e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  if (
                    !parsed ||
                    typeof parsed !== 'object' ||
                    Array.isArray(parsed)
                  )
                    throw new Error()
                  change(parsed)
                } catch {
                  setMessage('JSON 格式无效，未应用')
                }
              }}
            />
          </label>
        </div>
      </details>

      <fieldset className="studio-danger-zone">
        <legend>危险操作</legend>
        <p className="studio-muted-text">
          {appearance
            ? '恢复默认主题：当前主题配色、字体与背景将被替换，保存后生效。'
            : '将全部站点与主题设置恢复默认：包含站点信息与当前主题，不可撤销。'}
        </p>
        <button
          className="studio-button--danger"
          disabled={busy}
          onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
            if (
              window.confirm(
                appearance
                  ? '恢复默认主题？保存后生效。'
                  : '将全部站点与主题设置恢复默认？'
              )
            )
              run(/* 提交当前管理请求并更新操作结果。 */ async () => {
                if (appearance) {
                  const result = await request(
                    '/api/studio/settings/default-theme'
                  )
                  await request(
                    '/api/studio/settings',
                    write('PUT', { ...draft, theme: result.theme })
                  )
                  await refreshSettings()
                } else {
                  await request('/api/studio/settings/reset', { method: 'POST' })
                  await refreshSettings()
                }
              })
          }}
        >
          恢复默认
        </button>
      </fieldset>
    </section>
  )
}
/** 展示站点设置入口。 */
export function SettingsPage() {
  return <SettingsEditor />
}
/** 展示主题外观设置入口。 */
export function AppearancePage() {
  return <SettingsEditor appearance />
}
/** 修改密码并管理会话退出。 */
export function AccountPage() {
  const auth = useAuth(),
    [oldPassword, setOld] = useState(''),
    [newPassword, setNew] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  return (
    <section>
      <StudioPageHeader
        title="账号安全"
        description="修改密码会撤销全部已登录会话；退出登录只撤销当前会话。"
      />
      <Notice value={message} />
      <fieldset>
        <legend>当前账号</legend>
        <p className="studio-account-line">当前账号：{auth.user?.username}</p>
        <p className="studio-muted-text">
          修改密码后需要重新登录；如遇登录异常，可查看系统日志排查。
        </p>
        <p>
          <Link to="/studio/logs">查看系统日志</Link>
        </p>
      </fieldset>
      <form
        onSubmit={/* 校验旧密码后修改密码并刷新已撤销的会话。 */ async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await request(
              '/api/session/password',
              write('POST', { oldPassword, newPassword })
            )
            setOld('')
            setNew('')
            setMessage('密码已修改，全部会话已撤销，请重新登录')
            if (auth.refresh) await auth.refresh()
          } catch (e) {
            setMessage(e.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset>
          <legend>修改密码</legend>
          <label>
            旧密码
            <input
              type="password"
              required
              autoComplete="current-password"
              value={oldPassword}
              onChange={/* 更新旧密码输入。 */ (e) => setOld(e.target.value)}
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={/* 更新新密码输入。 */ (e) => setNew(e.target.value)}
            />
          </label>
          <div className="studio-actions">
            <button disabled={busy}>修改密码并撤销所有会话</button>
          </div>
        </fieldset>
      </form>
      <fieldset className="studio-danger-zone">
        <legend>会话管理</legend>
        <p className="studio-muted-text">退出当前浏览器会话；其他设备仍保持登录。</p>
        <button
          onClick={/* 退出当前作者会话并展示失败提示。 */ async () => {
            try {
              await auth.logout()
            } catch (e) {
              setMessage(e.message)
            }
          }}
        >
          退出登录
        </button>
        <p>
          <Link to="/login">重新登录</Link>
        </p>
      </fieldset>
    </section>
  )
}

/** 筛选脱敏日志并提供受保护的清空操作。 */
export function LogsPage() {
  const [offset, setOffset] = useState(0),
    [level, setLevel] = useState('')
  const { data, message, busy, run } = useCollection(
    `/api/studio/logs?limit=20&offset=${offset}&level=${level}`
  )
  return (
    <section>
      <StudioPageHeader
        title="系统日志"
        description="仅显示安全事件元信息，原始消息与载荷已隐藏。"
      />
      <div className="studio-toolbar">
        <label className="studio-toolbar-filter">
          日志等级
          <select
            aria-label="日志等级"
            value={level}
            onChange={/* 更新日志等级筛选并回到第一页。 */ (e) => {
              setLevel(e.target.value)
              setOffset(0)
            }}
          >
            {['', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map(/* 将当前条目映射为展示内容。 */ (item) => (
              <option key={item} value={item}>
                {item || '全部等级'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Notice value={message} />
      <ul className="studio-log-list">
        {data?.items?.map(/* 将当前条目映射为对齐的日志行。 */ (item, index) => (
          <li key={index}>
            <span className="studio-log-time">{item.timestamp}</span>
            <span className={`studio-badge ${item.level === 'ERROR' ? 'studio-badge--danger' : item.level === 'WARN' ? 'studio-badge--warn' : 'studio-badge--muted'}`}>
              {item.level}
            </span>
            <span className="studio-log-message">{item.message}</span>
          </li>
        ))}
        {data && !data.items?.length && (
          <div className="studio-empty">
            <p className="studio-empty-title">当前条件下没有日志。</p>
          </div>
        )}
      </ul>
      <fieldset className="studio-danger-zone">
        <legend>危险操作</legend>
        <p className="studio-muted-text">清空系统日志及轮转文件，无法恢复。</p>
        <button
          className="studio-button--danger"
          disabled={busy}
          onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
            if (window.confirm('清空系统日志及轮转文件？'))
              run(/* 提交当前管理请求并更新操作结果。 */ () => request('/api/studio/logs/clear', { method: 'POST' }))
          }}
        >
          清空日志
        </button>
      </fieldset>
      <Pager offset={offset} total={data?.total} onChange={setOffset} />
    </section>
  )
}
