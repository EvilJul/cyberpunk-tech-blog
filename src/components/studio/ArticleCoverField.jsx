import React, { useEffect, useRef, useState } from 'react'
import { studioApi } from '../../utils/studioApi'
import { apiUrl } from '../../utils/api'
import './article-cover.css'

/** 为上传目录地址补齐部署前缀，保留服务端已带前缀的地址。 */
function mediaUrl(url) {
  return url?.startsWith('/uploads/') ? apiUrl(url) : url
}

/** 显示可失败降级的封面图片，不影响已选择的媒体编号。 */
function CoverImage({ url, alt }) {
  const [broken, setBroken] = useState(false)
  return broken ? <span>图片预览失败</span> : <img src={mediaUrl(url)} alt={alt}
    onError={/* 隐藏损坏图片并提供文字反馈。 */ () => setBroken(true)} />
}

/** 从已有媒体或上传图片选择封面；只回填草稿字段，不主动保存或发布。 */
export default function ArticleCoverField({ value, currentId, currentUrl, disabled, onChange, onBusy }) {
  const [items, setItems] = useState([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(/* 标记组件生命周期，避免离开文章后回填迟到的上传或登记结果。 */ () => {
    mounted.current = true
    return /* 卸载后忽略上传及登记结果。 */ () => { mounted.current = false }
  }, [])
  useEffect(/* 分页读取媒体并在条件变化时取消旧请求。 */ () => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    studioApi(`/api/studio/media?offset=${offset}&limit=20`, { signal: controller.signal })
      .then(/* 仅接受当前页响应，保留已选择的封面。 */ data => {
        if (controller.signal.aborted) return
        if (!Array.isArray(data.items)) throw Error('媒体列表格式无效')
        setItems(data.items)
        setTotal(data.total || 0)
      })
      .catch(/* 加载失败保留封面与旧列表，并允许显式重试。 */ e => {
        if (!controller.signal.aborted) setError(`媒体加载失败：${e.message}`)
      })
      .finally(/* 结束当前页加载状态。 */ () => { if (!controller.signal.aborted) setLoading(false) })
    return /* 条件变化或卸载时中止媒体列表请求。 */ () => controller.abort()
  }, [offset, retry])

  /** 校验媒体编号与地址后更新草稿选择，拒绝将 URL 冒充媒体编号。 */
  function select(item) {
    if (!item.id || !item.url) throw Error('媒体接口缺少 id 或 url，请刷新媒体列表后重试')
    if (!mounted.current) return
    setSelected(item)
    onChange(item.id)
  }

  /** 复用已有编号；历史媒体先显式登记，与上传共用锁并忽略卸载后的回填。 */
  async function choose(item) {
    if (lock.current || disabled) return
    setError('')
    lock.current = true
    setUploading(true)
    onBusy?.(true)
    try {
      if (item.id) {
        select(item)
        return
      }
      if (!item.name) throw Error('历史媒体缺少文件名，请刷新后重试')
      const response = await studioApi('/api/studio/media/register', {
        method: 'POST', body: { filename: item.name }
      })
      if (!mounted.current) return
      const registered = response.data || response
      select({ ...item, ...registered })
      setItems(/* 记住登记编号，后续选择无需重复请求。 */ rows => rows.map(
        /* 仅替换此次登记的历史媒体，保留其他条目。 */ row => row.name === item.name ? { ...row, ...registered } : row
      ))
    } catch (e) {
      if (mounted.current) setError(`封面选择失败：${e.message}`)
    } finally {
      lock.current = false
      if (mounted.current) { setUploading(false); onBusy?.(false) }
    }
  }

  /** 验证并上传单张封面，失败时保留原选择，完成后才回填媒体编号。 */
  async function upload(file) {
    if (!file || lock.current || disabled) return
    setError('')
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('请选择不超过 5MB 的 JPEG、PNG、WebP 或 GIF 图片')
      return
    }
    lock.current = true
    setUploading(true)
    onBusy?.(true)
    try {
      const body = new FormData()
      body.append('image', file)
      const response = await studioApi('/api/studio/media', { method: 'POST', body })
      if (!mounted.current) return
      select(response.data || response)
      setRetry(/* 上传后刷新当前媒体页。 */ n => n + 1)
    } catch (e) {
      if (mounted.current) setError(`封面上传失败：${e.message}`)
    } finally {
      lock.current = false
      if (mounted.current) { setUploading(false); onBusy?.(false) }
    }
  }

  const selectedMedia = selected?.id === value ? selected : items.find(/* 在当前媒体页查找恢复的草稿封面。 */ item => item.id === value)
  const url = value ? selectedMedia?.url || (value === currentId ? currentUrl : '') : ''
  return <section className="studio-cover-field" aria-label="文章封面" aria-busy={uploading}>
    <h3>文章封面</h3>
    <p>保存草稿仅更新工作副本，发布后公开封面才会改变。上传文件后可通过地址访问。</p>
    {url ? <div className="studio-cover-preview"><CoverImage key={url} url={url} alt="文章封面预览" /></div>
      : <p>{value ? '当前封面预览暂不可用，可重新选择或清除。' : '尚未选择封面'}</p>}
    <button type="button" aria-label="清除封面" disabled={disabled || uploading || !value}
      onClick={/* 清空草稿封面，保存前保留服务端公开封面。 */ () => { setSelected(null); onChange(null) }}>清除封面</button>
    <label>上传封面
      <input type="file" aria-label="上传封面" accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled || uploading}
        onChange={/* 读取并重置文件输入，允许失败后重选同一文件。 */ e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          upload(file)
        }} />
    </label>
    {uploading && <p role="status">正在上传或登记封面…</p>}
    {error && <p role="alert">{error}<button type="button" aria-label="重试加载封面媒体" disabled={loading || uploading}
      onClick={/* 重新请求当前媒体页，不改变草稿选择。 */ () => setRetry(/* 递增重试计数。 */ n => n + 1)}>重试加载</button></p>}
    <div aria-label="已有封面媒体" className="studio-cover-grid" aria-busy={loading}>
      {loading ? <p role="status">正在加载封面媒体…</p> : items.map(/* 渲染带选中状态的现有媒体按钮。 */ item => <button type="button" key={item.id || item.url}
        aria-label={`选取封面：${item.name || item.id}`} aria-pressed={Boolean(value && item.id === value)} disabled={disabled || uploading}
        onClick={/* 选择已有媒体，历史图片先登记取得正式编号。 */ () => choose(item)}>
        <CoverImage key={item.url} url={item.url} alt={item.name || '封面媒体'} />
        <span>{item.name || item.id}</span>
      </button>)}
      {!loading && !error && !items.length && <p>暂无媒体，请上传封面。</p>}
    </div>
    <nav aria-label="封面媒体分页">
      <button type="button" aria-label="上一页封面媒体" disabled={loading || uploading || offset === 0}
        onClick={/* 返回上一页媒体。 */ () => setOffset(offset - 20)}>上一页</button>
      <span>第 {offset / 20 + 1} 页 · 共 {total} 张</span>
      <button type="button" aria-label="下一页封面媒体" disabled={loading || uploading || offset + 20 >= total}
        onClick={/* 读取下一页媒体。 */ () => setOffset(offset + 20)}>下一页</button>
    </nav>
  </section>
}
