import { apiFetch } from '../../utils/api'
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom'
import React, { useState, useEffect, useRef } from 'react'
import ArticleCard from './ArticleCard'
import SearchBar from './SearchBar'
import FeaturedArticles from './FeaturedArticles'
import { useMobileReader } from '../../utils/readerViewport'
import './article-list.css'
import './home-editorial.css'

/** 严格解析十进制页码并限制可请求范围。 */
function parsePage(value) {
  return /^[0-9]+$/.test(String(value)) && Number(value) > 0 ? Math.min(1000000, Number(value)) : 1
}

/** 展示首页杂志推荐与可取消、防乱序的分页结果；弹层使用独立搜索状态。 */
export default function ArticleList({ onArticleClick, perPage = 10, onTotal, filterCategory, filterTag, showCategories = true, autoFocusSearch = false, syncUrl = true, initialQuery = '', initialPage = 1, onStateChange, initialScrollTop = 0 }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { name } = useParams()
  const isMobile = useMobileReader()
  const params = new URLSearchParams(syncUrl ? location.search : '')
  const [local, setLocal] = useState({ query: initialQuery, page: parsePage(initialPage) })
  const query = syncUrl ? params.get('q') || '' : local.query
  const page = syncUrl ? parsePage(params.get('page')) : local.page
  const [draft, setDraft] = useState(query)
  const [composing, setComposing] = useState(false)
  const isTag = location.pathname.includes('/tag/')
  const category = filterCategory ?? (isTag ? null : name) ?? (syncUrl ? params.get('category') : null)
  const tag = filterTag ?? (isTag ? name : null) ?? (syncUrl ? params.get('tag') : null)
  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const callbacks = useRef({ onTotal, onStateChange })
  callbacks.current = { onTotal, onStateChange }
  const latest = useRef(null)
  latest.current = { location, navigate, syncUrl }
  const correction = useRef(null)
  const completedEmpty = useRef(null)
  const resultsRef = useRef(null)
  const scrollPending = useRef(false)
  const previousFilters = useRef({ filterCategory, filterTag, perPage, locationKey: location.key })

  /** 原子更新搜索与页码，保留分类、标签及其他查询参数。 */
  function updateState(nextQuery, nextPage, replace = true) {
    const current = latest.current
    if (!current.syncUrl) { setLocal({ query: nextQuery, page: nextPage }); return }
    const next = new URLSearchParams(current.location.search)
    if (nextQuery) next.set('q', nextQuery)
    else next.delete('q')
    if (nextPage > 1) next.set('page', String(nextPage))
    else next.delete('page')
    const search = next.toString()
    if (search !== current.location.search.replace(/^\?/, '')) current.navigate({ pathname: current.location.pathname, search }, { replace, state: current.location.state })
  }

  useEffect(/* 浏览器前进后退同步输入草稿。 */ () => { setDraft(query) }, [query])
  useEffect(/* 规范化已知重复参数并消费临时聚焦，不改变无关参数。 */ () => {
    if (!syncUrl) return
    const next = new URLSearchParams(location.search)
    for (const key of ['q', 'page', 'category', 'tag']) {
      if (next.has(key)) next.set(key, next.get(key))
    }
    if (page === 1) next.delete('page')
    else if (next.has('page')) next.set('page', String(page))
    if (!query) next.delete('q')
    if (next.get('focus') === 'search') next.delete('focus')
    if (next.toString() !== location.search.replace(/^\?/, '')) navigate({ pathname: location.pathname, search: next.toString() }, { replace: true, state: location.state })
  }, [syncUrl, location.search, location.pathname, navigate, page, query])
  useEffect(/* 组合输入期间不提交，清空立即生效，其余等待五百毫秒。 */ () => {
    if (composing || draft === query) return
    if (!draft) { updateState('', 1); return }
    const timer = setTimeout(/* 提交稳定关键词并回第一页。 */ () => updateState(draft, 1), 500)
    return /* 后续输入或卸载取消未提交关键词。 */ () => clearTimeout(timer)
  }, [draft, composing, query])

  useEffect(/* 仅在桌面确实展示分类时加载目录。 */ () => {
    if (!showCategories || isMobile) return
    const controller = new AbortController()
    /** 获取分类目录，主动取消不显示错误。 */
    async function loadCategories() {
      try {
        const response = await apiFetch('/api/categories', { signal: controller.signal })
        if (!response.ok) throw new Error('分类加载失败')
        const data = await response.json()
        if (!controller.signal.aborted) setCategories(data)
      } catch (failure) {
        if (!controller.signal.aborted) console.error('分类加载失败', failure)
      }
    }
    loadCategories()
    return /* 停止过期目录请求。 */ () => controller.abort()
  }, [showCategories, isMobile])

  useEffect(/* 每组条件拥有独立取消信号与代次，旧响应不能写入任何结果状态。 */ () => {
    const controller = new AbortController()
    const id = ++generation.current
    const signature = JSON.stringify([query, page, category, tag, perPage])
    if (completedEmpty.current === signature) { completedEmpty.current = null; return }
    const isCorrection = correction.current === signature
    correction.current = null
    setLoading(true)
    setError(false)
    /** 请求公开列表，只接受当前代次，越界至多触发一次补请求。 */
    async function load() {
      try {
        const request = new URLSearchParams({ page, per_page: perPage, sort: 'publish_date', order: 'desc', status: 'published' })
        if (query.trim()) request.set('search', query.trim())
        if (category) request.set('category', category)
        if (tag) request.set('tag', tag)
        const response = await apiFetch(`/api/articles?${request}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (controller.signal.aborted || generation.current !== id) return
        const rows = Array.isArray(data) ? data : data.data
        if (!Array.isArray(rows)) throw new Error('列表响应格式无效')
        const total = Number(data.pagination?.total ?? rows.length)
        const pages = Math.max(1, Number(data.pagination?.total_pages ?? Math.ceil(total / perPage)))
        const validPage = total === 0 ? 1 : Math.min(page, pages)
        if (validPage !== page && (total === 0 || !isCorrection)) {
          correction.current = JSON.stringify([query, validPage, category, tag, perPage])
          if (total === 0) completedEmpty.current = correction.current
          updateState(query, validPage)
          if (total !== 0) return
        }
        setArticles(rows)
        setResult({ query, page: validPage, total, pages })
        setLoading(false)
        callbacks.current.onTotal?.(total)
        callbacks.current.onStateChange?.({ query, page: validPage })
        if (scrollPending.current) {
          scrollPending.current = false
          resultsRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
        }
      } catch (failure) {
        if (controller.signal.aborted || generation.current !== id) return
        setError(true)
        setLoading(false)
      }
    }
    load()
    return /* 条件变化或卸载立即取消请求并使迟到响应失效。 */ () => { controller.abort(); generation.current++ }
  }, [query, page, category, tag, perPage, retry, filterCategory, filterTag])

  /** 显式分页增加历史，并在成功加载后定位结果区。 */
  function changePage(nextPage) {
    scrollPending.current = true
    updateState(query, nextPage, false)
  }
  /** 分类切换保留关键词及标签，清除旧页码。 */
  function categoryLink(value) {
    const next = new URLSearchParams(syncUrl ? location.search : '')
    next.delete('category')
    next.delete('page')
    next.delete('focus')
    if (tag) next.set('tag', tag)
    if (!syncUrl && query) next.set('q', query)
    return `${value ? `/category/${encodeURIComponent(value)}` : '/'}${next.size ? `?${next}` : ''}`
  }
  const home = syncUrl && location.pathname === '/' && !query && !draft && !category && !tag && page === 1
  const stale = loading || error || result?.query !== query || result?.page !== page
  return (
    <div className={`reader-article-list${home ? ' reader-article-list--home' : ''}`} data-initial-scroll-top={initialScrollTop} data-list-ready={!loading && !error}>
      <SearchBar query={draft} onSearch={setDraft} onComposingChange={setComposing} autoFocus={autoFocusSearch} focusRequest={syncUrl && params.get('focus') === 'search'} />
      {home && <FeaturedArticles />}
      {home && !isMobile && <div className="home-section-heading"><h2>最近的记录<span> / 技术手记</span></h2><Link to="/explore">探索全部文章 ↗</Link></div>}
      {showCategories && isMobile && <div className="reader-list-heading"><h2>最新文章</h2><Link to="/explore">浏览分类</Link></div>}
      {showCategories && !isMobile && <nav aria-label="文章分类" className="mb-6 flex flex-wrap gap-2 text-dark-400">
        <Link to={categoryLink(null)}>全部</Link>
        {categories.map(/* 渲染真实目录入口。 */ item => <Link key={item.name} to={categoryLink(item.name)} className={`px-3 py-1.5 text-sm rounded-full border ${category === item.name ? 'text-gold border-gold/30 bg-gold/20' : 'border-dark-700/50 hover:text-gold'}`}>{item.name} ({item.count || 0})</Link>)}
      </nav>}
      <div ref={resultsRef} className="reader-list-results" aria-busy={loading}>
        <div role="status" aria-live="polite">
          {loading ? (articles.length ? '正在更新，以下为上次结果…' : '正在加载文章…') : error ? '' : query ? `搜索“${query}”找到 ${result?.total ?? 0} 篇文章` : ''}
        </div>
        {error && <div role="alert" className="reader-list-error">文章加载失败，请重试。{articles.length > 0 && '以下为上次结果。'}<button type="button" onClick={/* 保留当前条件重新请求。 */ () => setRetry(retry + 1)}>重试</button></div>}
        {!loading && !error && articles.length === 0 && <p className="glass-card p-8 text-center">{query || category || tag ? '没有找到匹配的文章，请调整搜索或筛选条件' : '暂无文章'}</p>}
        <div className="space-y-4" aria-label={stale ? '上次文章结果' : '文章结果'}>
          {articles.map(/* 保持卡片入口稳定，不增加逐篇请求。 */ article => <ArticleCard key={article.id} article={article} onClick={onArticleClick} searchQuery={result?.query || ''} />)}
        </div>
      </div>
      {result && <nav aria-label="文章分页" className="reader-list-pagination">
        <button type="button" disabled={loading || error || page <= 1} onClick={/* 请求前一页。 */ () => changePage(page - 1)}>上一页</button>
        <span aria-current="page">{page} / {result.pages}</span>
        <button type="button" disabled={loading || error || page >= result.pages} onClick={/* 请求后一页。 */ () => changePage(page + 1)}>下一页</button>
      </nav>}
    </div>
  )
}
