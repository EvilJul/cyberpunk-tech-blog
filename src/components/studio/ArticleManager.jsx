import React, { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { studioApi } from '../../utils/studioApi'
import StudioPageHeader from './StudioPageHeader'

/** 提供结构化文章列表，分区展示内容、发布时间与独立置顶操作。 */
export default function ArticleManager() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(/* 从地址参数初始化合法的文章状态筛选。 */ () =>
      ['draft', 'published'].includes(params.get('status')) ? params.get('status') : ''
    ),
    [result, setResult] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [pinBusy, setPinBusy] = useState(null),
    [message, setMessage] = useState('')
  const pinLock = useRef(false)

  /* 地址携带的状态参数变化时同步筛选（如概览“查看草稿”入口）。 */
  useEffect(/* 同步地址状态参数到筛选条件。 */ () => {
    const next = ['draft', 'published'].includes(params.get('status')) ? params.get('status') : ''
    setStatus(next)
    setPage(1)
  }, [params])

  useEffect(/* 按搜索条件和页码加载文章并中止过时请求。 */ () => {
    const controller = new AbortController()
    setError('')
    setResult(null)
    studioApi(
      `/api/studio/articles?page=${page}&per_page=20&status=${status}&search=${encodeURIComponent(search)}`,
      { signal: controller.signal }
    )
      .then(setResult)
      .catch(/* 处理请求失败并保留当前页面内容。 */ (e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return /* 中止卸载页面尚未完成的请求。 */ () => controller.abort()
  }, [page, status, search, retry])

  /** 确认后按版本删除文章；删除末页最后一条时回退页码，否则刷新列表。 */
  async function remove(article) {
    if (!confirm(`确认删除《${article.title || '未命名文章'}》及其全部评论？此操作不可撤销。`))
      return
    try {
      await studioApi(`/api/studio/articles/${article.id}`, {
        method: 'DELETE',
        revision: article.revision
      })
      if (result?.data?.length === 1 && page > 1) setPage((p) => p - 1)
      else setRetry(/* 递增刷新计数以重新加载文章。 */ (n) => n + 1)
    } catch (e) {
      setError(e.message)
    }
  }

  /** 独立更新推荐元数据；不保存或发布工作副本，失败时保留列表供刷新重试。 */
  async function togglePin(a) {
    if (pinLock.current || (!a.pinned && a.status !== 'published')) return
    pinLock.current = true
    setPinBusy(a.id)
    setError('')
    setMessage('')
    try {
      await studioApi(`/api/studio/articles/${encodeURIComponent(a.id)}/pin`, {
        method: 'PUT', revision: a.revision, body: { pinned: !a.pinned }
      })
      setMessage(a.pinned ? '已取消首页置顶' : '已首页置顶，未发布修改仍保留在草稿')
      setRetry(/* 重新读取共享版本，避免下一次操作携带过期版本。 */ n => n + 1)
    } catch (e) {
      setError(`${[409, 412].includes(e.status) ? '文章版本已变化，请刷新列表后重试。' : ''}${e.message}`)
    } finally {
      pinLock.current = false
      setPinBusy(null)
    }
  }

  const hasFilter = Boolean(search || status)
  const total = result?.pagination?.total ?? result?.data?.length ?? 0
  const totalPages = result?.pagination?.total_pages ?? Math.max(1, Math.ceil(total / 20))

  return (
    <section>
      <StudioPageHeader
        title="文章管理"
        description="搜索、筛选和管理全部文章与草稿。"
      />

      <div className="studio-toolbar">
        <form
          role="search"
          className="studio-toolbar-search"
          onSubmit={/* 提交标题搜索并回到第一页。 */ (e) => {
            e.preventDefault()
            setSearch(query.trim())
            setPage(1)
          }}
        >
          <label>
            搜索文章
            <input
              type="search"
              value={query}
              onChange={/* 更新搜索输入。 */ (e) => setQuery(e.target.value)}
              placeholder="按文章标题搜索"
            />
          </label>
          <button type="submit">搜索</button>
          {search && (
            <button
              type="button"
              onClick={/* 清除搜索条件并回到第一页。 */ () => {
                setQuery('')
                setSearch('')
                setPage(1)
              }}
            >
              清除搜索
            </button>
          )}
        </form>
        <label className="studio-toolbar-filter">
          状态
          <select
            value={status}
            onChange={/* 更新文章状态筛选并回到第一页。 */ (e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">全部</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
        </label>
      </div>

      <p role="status">{pinBusy !== null ? '正在更新首页置顶…' : message}</p>
      {error && (
        <p role="alert">
          {error}{' '}
          <button onClick={/* 递增刷新计数以重新加载文章。 */ () => setRetry(/* 递增刷新计数。 */ (n) => n + 1)}>
            刷新列表
          </button>
        </p>
      )}
      {!result && !error && <p role="status">正在加载…</p>}

      {result && (
        <>
          <ul className="studio-article-list">
            {result.data.map(/* 将当前条目渲染为结构化列表行。 */ (a) => (
              <li className="studio-article-row" key={a.id}>
                <div className="studio-article-identity">
                  <Link className="studio-article-title" to={`/studio/editor/${a.id}`}>
                    {a.title || '未命名文章'}
                  </Link>
                  <span className={`studio-badge ${a.status === 'published' ? 'studio-badge--ok' : 'studio-badge--muted'}`}>
                    {a.status === 'published' ? '已发布' : '草稿'}
                  </span>
                  {a.pinned && <span className="studio-badge studio-badge--warn">首页已置顶</span>}
                  {a.has_draft && (
                    <span className="studio-badge studio-badge--warn" title="修改仅保存在工作副本，尚未发布">
                      有未发布修改
                    </span>
                  )}
                </div>
                <div className="studio-article-meta">
                  <p>
                    {a.author || '未署名'} · 分类：{a.category || '未分类'} · 标签：
                    {(a.tags || []).join('、') || '无'} · 版本 {a.revision}
                  </p>
                </div>
                <div className="studio-article-date">
                  <span>发布时间：</span>
                  <time>{a.publish_date ? new Date(a.publish_date).toLocaleString('zh-CN') : '尚未发布'}</time>
                </div>
                <div className="studio-article-actions">
                  <Link className="studio-button" to={`/studio/editor/${a.id}`}>
                    编辑
                  </Link>
                  <button type="button" className="studio-button" disabled={pinBusy !== null || (!a.pinned && a.status !== 'published')}
                    aria-pressed={Boolean(a.pinned)} title={!a.pinned && a.status !== 'published' ? '仅已发布文章可置顶' : '仅更改推荐状态，不发布草稿'}
                    onClick={/* 独立切换当前文章的首页推荐状态。 */ () => togglePin(a)}>
                    {pinBusy === a.id ? '更新中…' : a.pinned ? '取消置顶' : '首页置顶'}
                  </button>
                  <button disabled={pinBusy !== null} className="studio-button studio-button--danger" onClick={/* 删除当前列表文章。 */ () => remove(a)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {!result.data.length && (
            <div className="studio-empty">
              <p className="studio-empty-title">{hasFilter ? '没有匹配的文章' : '还没有文章'}</p>
              <p className="studio-muted-text">
                {hasFilter
                  ? '试试更换关键词或清除筛选条件。'
                  : '点击侧栏“新建文章”，第一篇草稿只保存在工作副本。'}
              </p>
            </div>
          )}

          <nav className="studio-pager" aria-label="文章分页">
            <button disabled={page <= 1} onClick={/* 切换到上一页。 */ () => setPage(/* 计算翻页后的页码。 */ (p) => p - 1)}>
              上一页
            </button>
            <span className="studio-pager-info">
              第 {page} 页 · 共 {total} 篇
            </span>
            <button
              disabled={!(result.pagination?.has_next ?? page < totalPages)}
              onClick={/* 切换到下一页。 */ () => setPage(/* 计算翻页后的页码。 */ (p) => p + 1)}
            >
              下一页
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
