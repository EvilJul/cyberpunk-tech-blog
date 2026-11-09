import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { studioApi, exportRecovery } from '../../utils/studioApi'
import MarkdownContent from '../blog/MarkdownContent'
const payloadFor = /* 整理文章提交字段并去重标签。 */ (form) => ({
  ...form,
  tags: [...new Set(form.tags.map(/* 去除标签首尾空白。 */ (tag) => tag.trim()).filter(Boolean))]
})
const blank = {
  title: '',
  content: '',
  slug: '',
  excerpt: '',
  author: '',
  category: '',
  tags: [],
  cover_media_id: null,
  canonical_source: null
}
const editable = /* 提取可编辑字段并补全默认值。 */ (a) =>
  Object.fromEntries(Object.keys(blank).map(/* 提取当前可编辑字段并补齐默认值。 */ (k) => [k, a[k] ?? blank[k]]))
/** 提供文章编辑、恢复、上传和显式发布流程。 */
export default function ArticleEditor() {
  const { id } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate()
  const [form, setForm] = useState(blank),
    [article, setArticle] = useState(null),
    [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [recovery, setRecovery] = useState(null),
    [comparison, setComparison] = useState(null),
    [preview, setPreview] = useState(false)
  const [categories, setCategories] = useState([]),
    [uploading, setUploading] = useState(false)
  useEffect(/* 按作者身份加载可选分类。 */ () => {
    studioApi('/api/studio/categories')
      .then(/* 更新分类列表。 */ (data) =>
        setCategories(Array.isArray(data) ? data : data.data || [])
      )
      .catch(/* 更新错误提示。 */ (e) => setError(`分类加载失败：${e.message}`))
  }, [user.id])
  const pendingNavigation = useRef(null)
  const sequence = useRef(0),
    current = useRef(form),
    dirtyRef = useRef(false),
    lock = useRef(false),
    textarea = useRef(null),
    newKey = useRef(null),
    loadedSlug = useRef('')
  if (!newKey.current) {
    try {
      newKey.current =
        sessionStorage.getItem(`blog-new:${user.id}`) || crypto.randomUUID()
      sessionStorage.setItem(`blog-new:${user.id}`, newKey.current)
    } catch {
      newKey.current = crypto.randomUUID()
    }
  }
  const key = `blog-recovery:${user.id}:${id || newKey.current}`
  current.current = form
  dirtyRef.current = dirty
  const change = /* 更新编辑内容并标记待保存。 */ (name, value) => {
    sequence.current++
    dirtyRef.current = true
    setDirty(true)
    setForm(/* 保留其他字段并更新当前编辑字段。 */ (f) => ({ ...f, [name]: value }))
    setMessage('未保存')
  }
  useEffect(/* 加载文章工作副本与本机恢复记录并忽略迟到响应。 */ () => {
    let active = true
    setReady(false)
    setComparison(null)
    setError('')
    setDirty(false)
    sequence.current = 0
    const load = /* 加载页面数据并更新展示状态。 */ async () => {
      try {
        const a = id
          ? await studioApi(`/api/studio/articles/${encodeURIComponent(id)}`)
          : null
        if (!active) return
        setArticle(a)
        loadedSlug.current = a?.slug || ''
        setForm(a ? editable(a) : { ...blank, author: user.username || '' })
        setReady(true)
        try {
          const cached = JSON.parse(localStorage.getItem(key) || 'null')
          setRecovery(cached)
        } catch {
          setMessage('本机恢复存储不可用，请及时导出正文')
        }
      } catch (e) {
        if (active) setError(e.message)
      }
    }
    load()
    return /* 忽略卸载后返回的异步结果。 */ () => {
      active = false
    }
  }, [id, user.id])
  useEffect(/* 将未保存正文按账号和文章隔离写入本机恢复存储。 */ () => {
    if (!ready || !dirty) return
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          form,
          revision: article?.revision ?? null,
          time: new Date().toISOString()
        })
      )
      setMessage('本机恢复已保存 · 服务端尚未保存')
    } catch {
      setMessage('本机存储不可用，请导出恢复文件')
    }
  }, [form, ready, dirty, key])
  useEffect(/* 注册页面离开、链接跳转和历史导航保护。 */ () => {
    const unload = /* 离开页面前提示未保存的修改。 */ (e) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const click = /* 拦截链接跳转并确认是否放弃未保存修改。 */ (e) => {
      const link = e.target.closest('a')
      if (
        dirtyRef.current &&
        link?.href &&
        !link.hasAttribute('download') &&
        !link.getAttribute('href')?.startsWith('#') &&
        !confirm('正文尚未保存到服务器，确认离开？本机恢复仍保留。')
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    // BrowserRouter does not provide useBlocker; handle browser history explicitly.
    let previous = window.location.href
    let restoring = false
    const pop = /* 处理历史导航并在取消离开时恢复地址。 */ () => {
      if (restoring) {
        restoring = false
        return
      }
      if (dirtyRef.current && !confirm('正文尚未保存到服务器，确认离开？')) {
        restoring = true
        window.history.pushState(null, '', previous)
        window.dispatchEvent(new PopStateEvent('popstate'))
        return
      }
      previous = window.location.href
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    // Native history navigation also keeps a synchronous recovery copy.
    window.addEventListener('popstate', pop, true)
    return /* 卸载编辑器时移除导航保护监听。 */ () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', click, true)
      window.removeEventListener('popstate', pop, true)
    }
  }, [])
  const save = /* 按当前版本保存草稿，保留请求期间的新输入。 */ async () => {
    const sentSequence = sequence.current,
      snapshot = payloadFor(current.current)
    if (!snapshot.slug) delete snapshot.slug
    const saved = await studioApi(
      id ? `/api/studio/articles/${id}/draft` : '/api/studio/articles',
      {
        method: id ? 'PUT' : 'POST',
        body: snapshot,
        ...(id ? { revision: article.revision } : {})
      }
    )
    setArticle(saved)
    if (sentSequence === sequence.current) {
      setForm(editable(saved))
      dirtyRef.current = false
      setDirty(false)
      setMessage('服务端草稿已保存')
      try {
        localStorage.removeItem(key)
      } catch {}
    } else setMessage('草稿已保存，之后输入仍未保存')
    if (!id) {
      const nextKey = `blog-recovery:${user.id}:${saved.id}`
      try {
        if (sentSequence !== sequence.current)
          localStorage.setItem(
            nextKey,
            JSON.stringify({
              form: current.current,
              revision: saved.revision,
              time: new Date().toISOString()
            })
          )
        localStorage.removeItem(key)
        sessionStorage.removeItem(`blog-new:${user.id}`)
      } catch {
        setMessage('服务端已保存，本机恢复不可用，请导出新增输入')
      }
      pendingNavigation.current = saved.id
    }
    return { saved, sentSequence }
  }
  const run = /* 执行操作并统一处理忙碌状态与错误反馈。 */ async (action) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'save') await save()
      else {
        if (
          !confirm(
            action === 'publish'
              ? '确认将服务端工作副本发布到公开站点？'
              : '确认撤回文章？公开地址将暂时不可访问。'
          )
        )
          return
        if (
          action === 'publish' &&
          article?.published_revision &&
          form.slug !== (article.public_slug || loadedSlug.current) &&
          !confirm('文章地址发生变化，旧地址会失效。确认发布？')
        )
          return
        let resource = article
        if (dirty || !resource) {
          const result = await save()
          resource = result.saved
          if (result.sentSequence !== sequence.current) {
            setMessage('保存期间产生了新输入，请再次保存后发布')
            return
          }
        }
        const sentSequence = sequence.current
        const updated = await studioApi(
          `/api/studio/articles/${resource.id}/${action}`,
          { method: 'POST', revision: resource.revision }
        )
        setArticle(updated)
        loadedSlug.current = updated.slug
        if (sentSequence === sequence.current) {
          setForm(editable(updated))
          setMessage(action === 'publish' ? '发布成功' : '文章已撤回')
          setDirty(false)
          dirtyRef.current = false
        } else setMessage('操作成功，之后输入仍未保存')
      }
    } catch (e) {
      setError(
        `${e.status === 412 || e.status === 409 ? '冲突：输入已保留。请比较最新版本、重载或另存。' : ''}${e.message}${e.requestId ? `（${e.requestId}）` : ''}`
      )
    } finally {
      lock.current = false
      setBusy(false)
      if (pendingNavigation.current) {
        const target = pendingNavigation.current
        pendingNavigation.current = null
        navigate(`/studio/editor/${target}`, { replace: true })
      }
    }
  }
  const compare = /* 读取服务端最新版本供冲突比较。 */ async () => {
    try {
      setComparison(await studioApi(`/api/studio/articles/${id}`))
    } catch (e) {
      setError(e.message)
    }
  }
  const reload = /* 确认后以比较版本替换编辑区并清除冲突状态。 */ () => {
    if (
      !comparison ||
      !confirm('确认用最新服务端版本替换编辑区？请先导出需要保留的内容。')
    )
      return
    setForm(editable(comparison))
    setArticle(comparison)
    loadedSlug.current = comparison.slug
    sequence.current++
    setDirty(false)
    dirtyRef.current = false
    localStorage.removeItem(key)
    setComparison(null)
    setError('')
    setMessage('已重载服务端版本')
  }
  const copy = /* 将当前缓冲另存为新草稿。 */ async () => {
    if (lock.current || !confirm('将当前输入另存为一篇新草稿？')) return
    lock.current = true
    setBusy(true)
    try {
      const payload = payloadFor(current.current)
      delete payload.slug
      const a = await studioApi('/api/studio/articles', {
        method: 'POST',
        body: payload
      })
      setMessage(`已另存新草稿：${a.title}`)
      setComparison({ ...a, isCopy: true })
    } catch (e) {
      setError(e.message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  /** 在光标所在行开头插入标题前缀，避免行中插入井号而无法渲染标题。 */
  function insertHeading(prefix) {
    const text = current.current.content
    const start = textarea.current?.selectionStart ?? text.length
    const end = textarea.current?.selectionEnd ?? start
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    change('content', text.slice(0, lineStart) + prefix + text.slice(lineStart))
    requestAnimationFrame(/* 保留原选区相对正文的位置并恢复输入焦点。 */ () => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(start + prefix.length, end + prefix.length)
    })
  }
  const insert = /* 在正文选区插入 Markdown 并恢复焦点。 */ (before, after = '', placeholder = '文字') => {
    const text = current.current.content,
      start = textarea.current?.selectionStart ?? text.length,
      end = textarea.current?.selectionEnd ?? start
    const selected = text.slice(start, end) || placeholder
    change(
      'content',
      text.slice(0, start) + before + selected + after + text.slice(end)
    )
    requestAnimationFrame(/* 更新正文选区并恢复输入焦点。 */ () => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(
        start + before.length,
        start + before.length + selected.length
      )
    })
  }
  const uploadFiles = /* 逐张上传图片并插入最新正文，保留失败前的输入。 */ async (files) => {
    if (uploading) {
      setError('图片正在上传，请稍后再试')
      return
    }
    setUploading(true)
    setError('')
    let position =
      textarea.current?.selectionStart ?? current.current.content.length
    const failures = []
    try {
      for (const file of files) {
        if (
          file.size > 5 * 1024 * 1024 ||
          !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
            file.type
          )
        ) {
          failures.push(
            `${file.name}：请选择不超过 5MB 的 JPEG、PNG、WebP 或 GIF 图片`
          )
          continue
        }
        const body = new FormData()
        body.append('image', file)
        try {
          const result = await studioApi('/api/studio/media', {
            method: 'POST',
            body
          })
          const media = result.data || result
          if (typeof media.url !== 'string' || !media.url)
            throw Error('上传未返回图片地址')
          const mediaPath = media.url.startsWith('/uploads/')
            ? `${import.meta.env.BASE_URL}${media.url.slice(1)}`
            : media.url
          const url = new URL(mediaPath, window.location.origin)
          if (
            url.origin !== window.location.origin ||
            !['http:', 'https:'].includes(url.protocol)
          )
            throw Error('上传地址无效')
          const text = `\n![图片](${url.pathname.replace(/\)/g, '%29')})\n`
          const content = current.current.content,
            pos = Math.min(position, content.length)
          // Read the latest buffer after each request; never replace text typed during upload.
          const next = content.slice(0, pos) + text + content.slice(pos)
          current.current = { ...current.current, content: next }
          change('content', next)
          position = pos + text.length
        } catch (e) {
          failures.push(`${file.name}：${e.message}`)
        }
      }
    } finally {
      setUploading(false)
      if (failures.length)
        setError(`上传失败，正文已保留：${failures.join('；')}`)
    }
  }
  if (!ready)
    return (
      <section>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">正在加载工作副本…</p>
        )}
      </section>
    )
  return (
    <section>
      <h1>{id ? '编辑文章' : '写文章'}</h1>
      <p>
        版本 {article?.revision || '尚未创建'} ·{' '}
        {article?.status === 'published' ? '已发布' : '草稿'} ·{' '}
        {dirty ? '未保存' : '无未保存修改'}
      </p>
      <p role="status">{message}</p>
      {recovery && (
        <aside>
          <p>
            发现本机恢复（{recovery.time}，版本 {recovery.revision || '新文章'}
            ），不会自动覆盖服务端。
          </p>
          <button
            onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
              if (
                confirm('确认恢复本机内容到编辑区？保存时仍检查服务端版本。')
              ) {
                sequence.current++
                setForm(recovery.form)
                setDirty(true)
                dirtyRef.current = true
                setRecovery(null)
              }
            }}
          >
            恢复到编辑区
          </button>
          <button onClick={/* 导出当前文章恢复副本。 */ () => exportRecovery(recovery)}>导出恢复</button>
          <button
            onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
              if (confirm('确认丢弃这份本机恢复？')) {
                localStorage.removeItem(key)
                setRecovery(null)
              }
            }}
          >
            丢弃恢复
          </button>
        </aside>
      )}
      {error && (
        <p role="alert">
          {error}
          {error.includes('登录') && (
            <Link
              to={`/login?returnTo=${encodeURIComponent(`/studio/editor/${id || 'new'}`)}`}
            >
              重新登录
            </Link>
          )}
        </p>
      )}
      <div className="studio-fields">
        {[
          ['title', '标题'],
          ['slug', '文章地址'],
          ['author', '作者'],
          ['excerpt', '摘要']
        ].map(/* 将当前条目映射为展示内容。 */ ([name, label]) => (
          <label key={name}>
            {label}
            <input
              value={form[name] || ''}
              onChange={/* 更新当前文章基础字段。 */ (e) => change(name, e.target.value)}
            />
          </label>
        ))}
        <label>
          分类
          <input
            list="studio-categories"
            value={form.category || ''}
            onChange={/* 更新文章分类。 */ (e) => change('category', e.target.value)}
            placeholder="选择已有分类或输入新分类"
          />
          <datalist id="studio-categories">
            {categories.map(/* 将当前条目映射为展示内容。 */ (category) => (
              <option key={category.id} value={category.name} />
            ))}
          </datalist>
        </label>
        <label>
          标签（逗号分隔）
          <input
            value={form.tags.join(',')}
            onChange={/* 拆分逗号分隔的标签输入。 */ (e) => change('tags', e.target.value.split(/[,，]/))}
          />
        </label>
      </div>
      <div role="toolbar" aria-label="Markdown 工具栏">
        {[
          ['H1', '# ', '', '标题'],
          ['H2', '## ', '', '标题'],
          ['H3', '### ', '', '标题'],
          ['加粗', '**', '**', '粗体'],
          ['斜体', '*', '*', '斜体'],
          ['删除线', '~~', '~~', '文字'],
          ['行内代码', '`', '`', '代码'],
          ['链接', '[', '](https://example.com)', '链接文字'],
          ['引用', '> ', '', '引用内容'],
          ['无序列表', '- ', '', '列表项'],
          ['有序列表', '1. ', '', '列表项'],
          ['代码块', '\n```\n', '\n```\n', '代码'],
          [
            '表格',
            '\n| 列一 | 列二 |\n| --- | --- |\n| ',
            ' | 内容 |\n',
            '内容'
          ],
          ['分隔线', '\n---\n', '', '']
        ].map(/* 将当前条目映射为展示内容。 */ ([label, before, after, placeholder]) => (
          <button
            type="button"
            key={label}
            onClick={/* 标题作用于整行，其余格式作用于当前选区。 */ () => /^#{1,3} $/.test(before) ? insertHeading(before) : insert(before, after, placeholder)}
          >
            {label}
          </button>
        ))}
      </div>
      <p>
        支持 Ctrl/⌘ + B 加粗、I 斜体、K 链接、S 保存；可粘贴或拖放多张图片。
      </p>
      <label htmlFor="studio-markdown-content">Markdown 正文</label>
        <textarea
          id="studio-markdown-content"
          ref={textarea}
          rows={24}
          onKeyDown={/* 响应格式快捷键和保存快捷键。 */ (e) => {
            if (!(e.ctrlKey || e.metaKey)) return
            const key = e.key.toLowerCase()
            if (['b', 'i', 'k', 's'].includes(key)) {
              e.preventDefault()
              if (key === 's') run('save')
              else if (key === 'b') insert('**', '**')
              else if (key === 'i') insert('*', '*')
              else insert('[', '](https://example.com)')
            }
          }}
          onPaste={/* 上传剪贴板图片并阻止默认粘贴。 */ (e) => {
            const files = [...(e.clipboardData?.files || [])]
            if (files.length) {
              e.preventDefault()
              uploadFiles(files)
            }
          }}
          onDragOver={/* 允许将文件拖入正文区域。 */ (e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault()
          }}
          onDrop={/* 上传拖放图片并阻止默认打开文件。 */ (e) => {
            const files = [...e.dataTransfer.files]
            if (files.length) {
              e.preventDefault()
              uploadFiles(files)
            }
          }}
          value={form.content}
          onChange={/* 更新正文并保留未保存标记。 */ (e) => change('content', e.target.value)}
        />
      <label>
        插入图片（上传后可公开访问）
        <input
          type="file"
          multiple
          disabled={uploading}
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={/* 上传所选图片并重置文件输入。 */ (e) => {
            const files = [...(e.target.files || [])]
            e.target.value = ''
            uploadFiles(files)
          }}
        />
      </label>
      {uploading && <p role="status">正在上传图片，正文可继续编辑…</p>}
      <div className="studio-actions">
        <button disabled={busy} onClick={/* 执行当前按钮对应的管理操作。 */ () => run('save')}>
          保存草稿
        </button>
        <button disabled={busy} onClick={/* 执行当前按钮对应的管理操作。 */ () => run('publish')}>
          发布
        </button>
        <button
          disabled={busy || article?.status !== 'published'}
          onClick={/* 执行当前按钮对应的管理操作。 */ () => run('unpublish')}
        >
          撤回
        </button>
        <button onClick={/* 切换正文预览开关。 */ () => setPreview(/* 反转当前预览开关。 */ (p) => !p)}>
          {preview ? '关闭预览' : '预览'}
        </button>
        <button
          onClick={/* 导出当前文章恢复副本。 */ () => exportRecovery({ form, revision: article?.revision })}
        >
          导出恢复文件
        </button>
        {id && (
          <button disabled={busy} onClick={compare}>
            比较最新版本
          </button>
        )}
        <button disabled={busy} onClick={copy}>
          另存新草稿
        </button>
      </div>
      {comparison &&
        (comparison.isCopy ? (
          <Link to={`/studio/editor/${comparison.id}`}>打开另存的草稿</Link>
        ) : (
          <aside>
            <h2>服务端最新版本 {comparison.revision}</h2>
            <pre>{JSON.stringify(editable(comparison), null, 2)}</pre>
            <button onClick={reload}>重载服务端版本</button>
            <p>
              如需合并，请复制需要的文本；先导出本机内容，再重载最新版本后粘贴保存。
            </p>
          </aside>
        ))}
      {preview && (
        <div className="studio-preview">
          <h2>{form.title}</h2>
          <MarkdownContent content={form.content} />
        </div>
      )}
    </section>
  )
}
