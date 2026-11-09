import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { studioApi as studioFetch } from '../../utils/studioApi'
import { apiUrl } from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { themes } from '../../themes'
import AvatarCropper from './AvatarCropper'

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
      <h1>{title}管理</h1>
      <Notice value={message} />
      <form
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
        <button disabled={busy}>{editing ? '保存修改' : `新增${title}`}</button>
        {editing && (
          <button
            type="button"
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
      </form>
      <ul>
        {(data || []).map(/* 将当前条目映射为展示内容。 */ (item) => (
          <li key={item.id}>
            <strong>{item.name}</strong> · <code>{item.slug}</code>
            {item.description && <span> · {item.description}</span>} ·{' '}
            {item.count || 0} 篇{' '}
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
          </li>
        ))}
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
    <nav aria-label="分页">
      <button
        disabled={!offset}
        onClick={/* 切换到上一页且不低于首页。 */ () => onChange(Math.max(0, offset - 20))}
      >
        上一页
      </button>
      <span>
        {' '}
        {total || 0} 条，第 {offset / 20 + 1} 页{' '}
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
/** 筛选、审核及删除评论回复树。 */
export function CommentsPage() {
  const [status, setStatus] = useState('pending'),
    [offset, setOffset] = useState(0)
  const { data, message, busy, run } = useCollection(
    `/api/studio/comments?status=${status}&offset=${offset}&limit=20`
  )
  return (
    <section>
      <h1>评论审核</h1>
      <label>
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
      <Notice value={message} />
      {data?.items?.map(/* 将当前条目映射为展示内容。 */ (item) => (
        <article key={item.id}>
          <h2>{item.author}</h2>
          <p>{item.content}</p>
          <small>
            {item.email} · {item.status} · 文章 {item.article_id}
            {item.parent_id && ' · 回复评论'}
          </small>
          <div>
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
              disabled={busy}
              onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
                if (
                  window.confirm('删除此评论及全部后代回复？此操作无法撤销。')
                )
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
      <h1>媒体库</h1>
      <p>图片最大 5MB。复制链接或 Markdown 后可粘贴到文章编辑器。</p>
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
      <Notice value={message} />
      <div>
        {data?.items?.map(/* 将当前条目映射为展示内容。 */ (item) => (
          <article key={item.url}>
            <img
              src={mediaUrl(item.url)}
              alt={item.name}
              style={{ maxWidth: 220, maxHeight: 160 }}
            />
            <p>
              {item.name} · {Math.ceil(item.size / 1024)} KB
            </p>
            <input
              aria-label="图片地址"
              readOnly
              value={mediaUrl(item.url)}
              onFocus={/* 选中只读内容以便手动复制。 */ (e) => e.target.select()}
            />
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
          </article>
        ))}
      </div>
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
/** 按配置类型递归渲染可编辑字段。 */
function Fields({ value, onChange }) {
  return Object.entries(value).map(/* 将当前条目映射为展示内容。 */ ([key, current]) =>
    typeof current === 'object' && current !== null ? (
      <fieldset key={key}>
        <legend>{labels[key] || key}</legend>
        <Fields
          value={current}
          onChange={/* 将子配置修改合并回父级配置。 */ (next) => onChange({ ...value, [key]: next })}
        />
      </fieldset>
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

/** 编辑站点或主题配置并刷新统一设置。 */
function SettingsEditor({ appearance = false }) {
  const { refreshSettings } = useSettings()
  const { data, message, setMessage, busy, run } = useCollection(
    '/api/studio/settings'
  )
  const [draft, setDraft] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  useEffect(/* 从服务端设置初始化待编辑配置。 */ () => {
    if (data?.settings) setDraft({ showSidebar: true, ...data.settings })
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
  return (
    <section>
      <h1>{appearance ? '外观主题' : '站点设置'}</h1>
      <Notice value={message} />
      {avatarFile && <AvatarCropper file={avatarFile}
        onCancel={/* 取消只丢弃本机选区，保留待保存与已保存的头像。 */ () => setAvatarFile(null)}
        onConfirm={/* 上传裁剪后的 JPEG，仅更新待保存头像地址。 */ async file => {
          // 已完成 512 方形裁剪，使用原尺寸分支避免 avatar 分支再次缩到 400。
          const result = await upload(file, 'normal')
          setDraft(/* 保留其他尚未保存的设置字段。 */ current => ({ ...current, avatar: mediaUrl(result.url) }))
          setAvatarFile(null)
          setMessage('图片已上传，请保存设置')
        }}
      />}
      <form
        onSubmit={/* 保存当前配置并刷新统一设置上下文。 */ (e) => {
          e.preventDefault()
          run(/* 提交当前管理请求并更新操作结果。 */ async () => {
            await request('/api/studio/settings', write('PUT', draft))
            await refreshSettings()
          })
        }}
      >
        {appearance && (
          <div>
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
          </div>
        )}
        <Fields value={shown} onChange={change} />
        <label>
          {appearance ? '上传背景' : '上传头像（选择区域裁剪）'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            onChange={/* 头像先进入本机裁剪，背景沿用直接上传流程。 */ async (e) => {
              const file = e.target.files[0]
              e.target.value = ''
              if (!file) return
              if (!appearance) {
                setAvatarFile(file)
                return
              }
              try {
                const result = await upload(
                  file,
                  appearance ? 'background' : 'avatar'
                )
                setDraft(/* 保留并发配置修改，仅合并上传图片地址。 */ (current) =>
                  appearance
                    ? {
                        ...current,
                        theme: {
                          ...current.theme,
                          background: {
                            ...current.theme.background,
                            image: mediaUrl(result.url)
                          }
                        }
                      }
                    : { ...current, avatar: mediaUrl(result.url) }
                )
                setMessage('图片已上传，请保存设置')
              } catch (e) {
                setMessage(e.message)
              }
            }}
          />
        </label>
        <button disabled={busy}>保存设置</button>
      </form>
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
      <button
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
      <details>
        <summary>高级 JSON 编辑</summary>
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
      </details>
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
      <h1>账号安全</h1>
      <p>当前账号：{auth.user?.username}</p>
      <Notice value={message} />
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
        <button disabled={busy}>修改密码并撤销所有会话</button>
      </form>
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
        <Link to="/studio/logs">查看系统日志</Link> ·{' '}
        <Link to="/login">重新登录</Link>
      </p>
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
      <h1>系统日志</h1>
      <p>仅显示安全事件元信息，原始消息与载荷已隐藏。</p>
      <Notice value={message} />
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
      <button
        disabled={busy}
        onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
          if (window.confirm('清空系统日志及轮转文件？'))
            run(/* 提交当前管理请求并更新操作结果。 */ () => request('/api/studio/logs/clear', { method: 'POST' }))
        }}
      >
        清空日志
      </button>
      <ul>
        {data?.items?.map(/* 将当前条目映射为展示内容。 */ (item, index) => (
          <li key={index}>
            {item.timestamp} [{item.level}] {item.message}
          </li>
        ))}
      </ul>
      <Pager offset={offset} total={data?.total} onChange={setOffset} />
    </section>
  )
}
