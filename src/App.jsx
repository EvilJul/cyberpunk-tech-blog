import { Home, FolderOpen, UserRound, Search, LogIn, PenLine, LayoutDashboard, MoreHorizontal } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { apiFetch } from './utils/api'
import React, { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  useSearchParams,
  useParams,
  Route,
  Routes,
  useLocation,
  useNavigate
} from 'react-router-dom'
import Footer from './components/layout/Footer'
import Sidebar from './components/layout/Sidebar'
import ArticleList from './components/blog/ArticleList'
import { useSettings } from './contexts/SettingsContext'
import { useTheme } from './themes/ThemeProvider'
import GridOverlay from './components/background/GridOverlay'
import PixelSnow from './components/background/PixelSnow'
import SplashCursor from './components/background/SplashCursor'
import { useSeo } from './utils/seo'
import ContactLinks, { WechatDialog } from './components/layout/ContactLinks'
import { ReaderDialog, ReaderIdentity, ReaderMore, useReaderKeyboard } from './components/layout/ReaderMobile'
import { useMobileReader } from './utils/readerViewport'
import { ReaderScrollMemory, searchSources } from './utils/readerNavigation'
import { readerPalette } from './utils/readerPalette'

const ArticleDetail = lazy(/* 按需加载ArticleDetail页面模块。 */ () => import('./components/blog/ArticleDetail'))

const StudioLayout = lazy(/* 按需加载StudioLayout页面模块。 */ () => import('./components/studio/StudioLayout'))
const Login = lazy(/* 按需加载Login页面模块。 */ () => import('./components/studio/Login'))
const Setup = lazy(/* 按需加载Setup页面模块。 */ () => import('./components/studio/Setup'))
const StudioOverview = lazy(/* 按需加载StudioOverview页面模块。 */ () => import('./components/studio/StudioOverview'))
const ArticleManager = lazy(/* 按需加载ArticleManager页面模块。 */ () => import('./components/studio/ArticleManager'))
const ArticleEditor = lazy(/* 按需加载ArticleEditor页面模块。 */ () => import('./components/studio/ArticleEditor'))
const managementPages = Object.fromEntries(
  Object.entries({
    categories: 'CategoriesPage',
    tags: 'TagsPage',
    comments: 'CommentsPage',
    media: 'MediaPage',
    settings: 'SettingsPage',
    appearance: 'AppearancePage',
    account: 'AccountPage',
    logs: 'LogsPage'
  }).map(/* 为各管理路由构造独立懒加载页面。 */ ([kind, name]) => [
    kind,
    lazy(/* 按需读取管理页面模块。 */ () =>
      import('./components/studio/ManagementPages').then(/* 从模块中选取指定管理页面。 */ (m) => ({
        default: m[name]
      }))
    )
  ])
)
const IntegrationsPage = lazy(
  /* 按需加载集成管理页面。 */ () => import('./components/studio/IntegrationsPage')
)

/** 渲染读者布局，文章页停用装饰特效并保留原地搜索体验。 */
function Layout() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { theme } = useTheme()
  const location = useLocation()
  const paletteKey = JSON.stringify(theme?.colors || {})
  const palette = useMemo(/* 仅配色变化时计算局部可读色，搜索与弹层状态不重建颜色解析画布。 */ () => readerPalette(theme), [paletteKey])
  const navigate = useNavigate()
  const mobile = useMobileReader()
  const [overlay, setOverlay] = useState(null)
  useReaderKeyboard(mobile)
  useEffect(/* 路由历史恢复搜索面板；其他导航关闭旧模态。 */ () => {
    setOverlay(location.state?.readerSearch ? { type: 'search', ...location.state.readerSearch } : null)
  }, [location.key])
  /** 关闭弹层时清理临时历史状态，不新增空历史项。 */
  function closeOverlay() {
    const restoreY = overlay?.articleScrollY
    setOverlay(null)
    if (Number.isFinite(restoreY)) requestAnimationFrame(/* 弹层释放滚动锁后恢复原文章坐标。 */ () => window.scrollTo(0, restoreY))
    if (location.state?.readerSearch) {
      const state = { ...location.state, readerRestoreY: restoreY, readerRestoreRequest: crypto.randomUUID() }
      delete state.readerSearch
      navigate(location.pathname + location.search, { replace: true, state })
    }
  }
  /** 更多到公众号通过同一个状态切换，关闭后返回更多面板。 */
  function openWechat(data) {
    setOverlay({ type: 'wechat', ...data, returnToMore: overlay?.type === 'more' })
  }
  /** 有列表时原地聚焦，否则在当前文章或关于页打开搜索。 */
  function openSearch() {
    if (hasSearch) {
      document.querySelector('.reader-article-list input[aria-label="搜索文章"]')?.focus({ preventScroll: false })
    } else setOverlay({ type: 'search' })
  }
  useSeo({
    title: settings.title,
    description: settings.description,
    image: settings.avatar,
    enabled: !location.pathname.startsWith('/article/')
  })
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(/* 监听系统减少动效偏好。 */ () => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = /* 将系统动效偏好同步到组件状态。 */ () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return /* 卸载时移除系统偏好监听。 */ () => media.removeEventListener('change', update)
  }, [])
  // 已有文章搜索框的页面原地聚焦，保留当前筛选及其他查询条件。
  const hasSearch = location.pathname === '/' || location.pathname === '/explore' || /^\/(category|tag)\//.test(location.pathname)
  const searchParams = new URLSearchParams(hasSearch ? location.search : '')
  searchParams.set('focus', 'search')
  const searchTarget = { pathname: hasSearch ? location.pathname : '/', search: searchParams.toString() }
  const isReading = location.pathname.startsWith('/article/')
  const effects = theme?.effects || {}
  return (
    <div className={`reader-shell${isReading ? ' reader-shell--reading' : ''}`} style={palette}>
      <ReaderScrollMemory />
      {!mobile && !reducedMotion && !isReading && (
        <div aria-hidden="true" data-reader-effects>
          {effects.gridOverlay && <GridOverlay />}
          {effects.pixelSnow && <PixelSnow />}
          {effects.splashCursor && <SplashCursor />}
        </div>
      )}
      <a href="#main" className="skip-link">
        跳到正文
      </a>
      {!mobile && <aside className="reader-dock" aria-label="站点导航">
        <Link className="dock-brand" to="/" aria-label={settings.title + ' · 首页'} title={settings.title}>
          {settings.title?.slice(0, 1) || 'B'}
        </Link>
        <nav aria-label="主导航">
          {[
            ['/', '首页', Home],
            ['/explore', '探索', FolderOpen],
            ['/about', '关于', UserRound]
          ].map(/* 用图标和短标签呈现公共导航，并保留当前页面状态。 */ ([path, title, Icon]) => (
            <NavLink end key={path} to={path} className="dock-link">
              <Icon size={20} aria-hidden="true" />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="dock-tools">
          {hasSearch ? (
            <Link className="dock-link" to={searchTarget} onClick={/* 普通搜索只聚焦当前输入，不为重复意图新增历史。 */ (event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault(); openSearch()
            }}>
              <Search size={20} aria-hidden="true" /><span>搜索</span>
            </Link>
          ) : (
            <button type="button" className="dock-link" aria-haspopup="dialog" onClick={/* 无搜索框的阅读页面打开弹层，保留原地址。 */ openSearch}>
              <Search size={20} aria-hidden="true" /><span>搜索</span>
            </button>
          )}
          {user?.role === 'admin' ? (
            <>
              <Link className="dock-link" to="/studio/editor/new">
                <PenLine size={20} aria-hidden="true" /><span>写文章</span>
              </Link>
              <Link className="dock-link" to="/studio">
                <LayoutDashboard size={20} aria-hidden="true" /><span>工作台</span>
              </Link>
            </>
          ) : (
            !user && (
              <Link className="dock-link" to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>
                <LogIn size={20} aria-hidden="true" /><span>登录</span>
              </Link>
            )
          )}
        </div>
      </aside>}
      {mobile && <nav className="reader-mobile-nav" aria-label="手机导航">
        <NavLink end to="/"><Home aria-hidden="true" size={21} /><span>首页</span></NavLink>
        <NavLink to="/explore" className={/^\/(category|tag)\//.test(location.pathname) ? 'active' : undefined}><FolderOpen aria-hidden="true" size={21} /><span>探索</span></NavLink>
        <button type="button" onClick={openSearch} aria-haspopup={!hasSearch ? 'dialog' : undefined}><Search aria-hidden="true" size={21} /><span>搜索</span></button>
        <button type="button" data-reader-more aria-haspopup="dialog" aria-expanded={overlay?.type === 'more'} onClick={/* 显式记录手机触发焦点，兼容 Safari 点击按钮不自动聚焦的行为。 */ (event) => { event.currentTarget.focus({ preventScroll: true }); setOverlay({ type: 'more' }) }}><MoreHorizontal aria-hidden="true" size={21} /><span>更多</span></button>
      </nav>}
      <main id="main" className={`reader-main max-w-6xl mx-auto px-4 py-8 ${isReading ? 'reader-main--article' : ''}`}>
        <Routes>
          <Route path="/" element={<Listing mobile={mobile} />} />
          <Route path="/category/:name" element={<Directory />} />
          <Route path="/tag/:name" element={<Directory />} />
          <Route
            path="/article/:slug"
            element={
              <Suspense fallback={<p role="status">正在加载文章…</p>}>
                <ArticleDetail key={location.pathname} />
              </Suspense>
            }
          />
          <Route path="/explore" element={<Directory />} />
          <Route path="/categories" element={<Navigate replace to="/explore" />} />
          <Route path="/tags" element={<Navigate replace to="/explore" />} />
          <Route
            path="/about"
            element={
              <section className="reader-about glass-card p-8">
                <h1>关于 {settings.author}</h1>
                <p>{settings.bio || settings.description}</p>
                <ContactLinks settings={settings} onWechatOpen={openWechat} />
              </section>
            }
          />
          <Route
            path="*"
            element={
              <section>
                <h1>页面未找到</h1>
                <Link to="/">返回首页</Link>
              </section>
            }
          />
        </Routes>
      </main>
      {overlay?.type === 'search' && <ReaderSearch key={location.key} initial={overlay} onClose={closeOverlay} />}
      {overlay?.type === 'more' && <ReaderMore settings={settings} user={user} location={location} onClose={closeOverlay} onWechatOpen={openWechat} />}
      {overlay?.type === 'wechat' && <WechatDialog {...overlay} onClose={/* 从更多打开的公众号返回更多，其余直接关闭。 */ () => setOverlay(overlay.returnToMore ? { type: 'more' } : null)} />}
      {settings.footer && <Footer settings={settings} />}
    </div>
  )
}
/** 搜索保留在当前地址；打开结果前保存面板与原文章阅读位置。 */
function ReaderSearch({ onClose, initial = {} }) {
  const dialogRef = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()
  const stateRef = useRef({ query: initial.query || '', page: initial.page || 1 })
  const readingY = useRef(initial.articleScrollY ?? window.scrollY)
  useEffect(/* 异步列表恢复后还原搜索面板内部滚动。 */ () => {
    const observer = new MutationObserver(/* 列表已就绪才恢复内部结果位置。 */ () => {
      if (dialogRef.current?.querySelector('[data-list-ready="true"]')) {
        dialogRef.current.scrollTop = initial.scrollTop || 0
        observer.disconnect()
      }
    })
    observer.observe(dialogRef.current, { childList: true, subtree: true })
    return /* 搜索关闭后不再观察旧结果。 */ () => observer.disconnect()
  }, [])
  return <ReaderDialog title="搜索文章" className="reader-search" dialogRef={dialogRef} onClose={onClose} onClickCapture={/* 接管普通文章导航以保存唯一、可信的同会话返回上下文。 */ (event) => {
    const link = event.target.closest('a')
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return
    const url = new URL(link.href)
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    const path = url.pathname.slice(base.length)
    if (url.origin !== window.location.origin || !path.startsWith('/article/')) { onClose(); return }
    event.preventDefault(); event.stopPropagation()
    const sourceId = crypto.randomUUID()
    searchSources.add(sourceId)
    if (searchSources.size > 20) searchSources.delete(searchSources.values().next().value)
    const snapshot = { ...stateRef.current, scrollTop: dialogRef.current.scrollTop, articleScrollY: readingY.current, sourceId }
    const sourceState = { ...location.state, readerSearch: snapshot }
    delete sourceState.readerRestoreY
    delete sourceState.readerRestoreRequest
    navigate(location.pathname + location.search, { replace: true, state: sourceState })
    const fallback = new URLSearchParams()
    if (snapshot.query) fallback.set('q', snapshot.query)
    if (snapshot.page > 1) fallback.set('page', snapshot.page)
    navigate(path + url.search, { state: { readerReturn: { sourceId, url: `/explore${fallback.size ? `?${fallback}` : ''}` } } })
  }}>
    <ArticleList showCategories={false} filterCategory="" filterTag="" autoFocusSearch syncUrl={false} initialQuery={initial.query || ''} initialPage={initial.page || 1} onStateChange={/* 结果状态仅保存在面板，不污染原文章地址。 */ (state) => { stateRef.current = state }} />
  </ReaderDialog>
}
/** 组合文章列表与站点侧栏。 */
function Listing({ mobile }) {
  const { settings } = useSettings()
  const [total, setTotal] = useState(0)
  return (
    <div
      className={`flex flex-col lg:flex-row gap-8 ${settings.sidebar === 'left' ? 'lg:flex-row-reverse' : ''}`}
    >
      <div className="flex-1 min-w-0">
        {mobile && <ReaderIdentity settings={settings} home />}
        <ArticleList perPage={settings.perpage} onTotal={setTotal} />
      </div>
      {!mobile && settings.sidebar !== 'hidden' && (
        <div className="w-full lg:w-80">
          <Sidebar total={total} />
        </div>
      )}
    </div>
  )
}
/** 在一个页面组合分类、标签筛选与文章结果，地址保存筛选条件。 */
function Directory() {
  const { settings } = useSettings()
  const mobile = useMobileReader()
  const [filterOpen, setFilterOpen] = useState(false)
  const [candidate, setCandidate] = useState('')
  const [params] = useSearchParams()
  const { name } = useParams()
  const location = useLocation()
  const category = params.get('category') || (location.pathname.startsWith('/category/') ? name : '') || ''
  const tag = params.get('tag') || (location.pathname.startsWith('/tag/') ? name : '') || ''
  const [catalog, setCatalog] = useState({ categories: [], tags: [] })
  const [status, setStatus] = useState('loading')
  const [retry, setRetry] = useState(0)
  useEffect(/* 并行读取两类目录，取消过期请求并保留显式失败反馈。 */ () => {
    const controller = new AbortController()
    setStatus('loading')
    Promise.all(['categories', 'tags'].map(/* 请求各目录并校验接口响应。 */ async (kind) => {
      const response = await apiFetch(`/api/${kind}`, { signal: controller.signal })
      if (!response.ok) throw Error('目录加载失败')
      const data = await response.json()
      return [kind, Array.isArray(data) ? data : data[kind] || []]
    })).then(/* 合并目录，忽略已取消请求。 */ (entries) => {
      if (controller.signal.aborted) return
      setCatalog(Object.fromEntries(entries))
      setStatus('ready')
    }).catch(/* 主动取消以外的异常提供重试入口。 */ () => {
      if (!controller.signal.aborted) setStatus('error')
    })
    return /* 离开页面时停止目录请求。 */ () => controller.abort()
  }, [retry])
  /** 只替换指定筛选项，并保留另一项以支持组合筛选。 */
  function filterUrl(key, value) {
    const next = new URLSearchParams(params)
    if (category) next.set('category', category)
    if (tag) next.set('tag', tag)
    next.delete('page')
    next.delete('focus')
    if (value) next.set(key, value)
    else next.delete(key)
    return { pathname: '/explore', search: next.toString() }
  }
  /** 清除分类和标签时仍保留读者的搜索词。 */
  function clearFilters() {
    const next = new URLSearchParams(params)
    for (const key of ['category', 'tag', 'page', 'focus']) next.delete(key)
    return { pathname: '/explore', search: next.toString() }
  }
  /** 使用同一目录渲染紧凑候选与完整面板，已选条件始终另行呈现。 */
  function filterRows(expanded = false) {
    return [['categories', '分类', 'category', category], ['tags', '标签', 'tag', tag]].map(/* 两类目录共享筛选地址，避免丢失另一个条件与搜索词。 */ ([kind, label, key, selected]) => {
      const all = catalog[kind]
      const options = expanded ? all.filter(/* 面板只在本地查找候选，不请求文章。 */ (item) => item.name.toLocaleLowerCase().includes(candidate.toLocaleLowerCase())) : mobile ? all.slice(0, key === 'tag' ? 8 : 6) : all
      return <div className={`explore-filter-row ${key === 'category' && !expanded ? 'explore-categories-compact' : ''}`} key={kind} role="group" aria-label={label}>
        <span className="explore-filter-label">{label}</span>
        <div className="explore-options">
          <Link className={!selected ? 'selected' : ''} aria-current={!selected ? 'true' : undefined} to={filterUrl(key, '')}>全部</Link>
          {options.map(/* 用轻量选项呈现真实目录及文章数量。 */ (item) => <Link key={item.id || item.name} className={selected === item.name ? 'selected' : ''} aria-current={selected === item.name ? 'true' : undefined} to={filterUrl(key, item.name)}>{key === 'tag' ? '# ' : ''}{item.name}<small>{item.count || 0}</small></Link>)}
          {!all.length && <span>暂无{label}</span>}
          {expanded && all.length > 0 && !options.length && <span>没有匹配的{label}</span>}
        </div>
      </div>
    })
  }
  return (
    <section className="explore-page">
      <header className="explore-heading">
        <div><h1>探索文章</h1><p>按分类寻找方向，用标签细化兴趣。</p></div>
        {(category || tag) && <Link className="explore-reset" to={clearFilters()}>清除筛选</Link>}
      </header>
      <div className="explore-selected" aria-label="已选条件">
        {category && <Link to={filterUrl('category', '')}>分类：{category} ×</Link>}
        {tag && <Link to={filterUrl('tag', '')}>标签：{tag} ×</Link>}
      </div>
      <section className="explore-filters" aria-label="文章筛选" aria-busy={status === 'loading'}>
        {status === 'loading' ? <p role="status">正在加载筛选项…</p> : status === 'error' ? <div role="alert">筛选项加载失败。<button type="button" onClick={/* 重新加载目录并保留条件。 */ () => setRetry(retry + 1)}>重试</button></div> : <>
          {filterRows()}
          {mobile && <button className="explore-open-filters" type="button" aria-haspopup="dialog" onClick={/* 打开完整目录，本地检索不改变当前结果。 */ () => { setCandidate(''); setFilterOpen(true) }}>筛选 · 全部标签（{catalog.tags.length}）</button>}
        </>}
      </section>
      {filterOpen && <ReaderDialog title="筛选文章" className="reader-filter-dialog" onClose={/* 关闭后返回筛选触发位置。 */ () => setFilterOpen(false)}>
        <label>查找分类或标签<input type="search" value={candidate} onChange={/* 本地候选过滤不发起网络请求。 */ (event) => setCandidate(event.target.value)} /></label>
        <div className="explore-selected">{category && <span>分类：{category}</span>}{tag && <span>标签：{tag}</span>}</div>
        {filterRows(true)}
        <button type="button" className="explore-show-results" onClick={/* 条件已同步地址，完成后回到结果区。 */ () => { setFilterOpen(false); document.querySelector('.explore-results')?.scrollIntoView({ block: 'start' }) }}>查看文章结果</button>
      </ReaderDialog>}
      <div className="explore-results" aria-label="文章结果">
        <ArticleList perPage={settings.perpage} filterCategory={category} filterTag={tag} showCategories={false} />
      </div>
    </section>
  )
}
/** 按部署前缀装配读者、登录与受保护工作台路由。 */
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Suspense fallback={<p role="status">正在加载页面…</p>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/studio" element={<StudioLayout />}>
              <Route index element={<StudioOverview />} />
              <Route path="articles" element={<ArticleManager />} />
              <Route path="editor/new" element={<ArticleEditor />} />
              <Route path="editor/:id" element={<ArticleEditor />} />
              {Object.entries(managementPages).map(/* 挂载各功能管理路由。 */ ([kind, Page]) => (
                <Route key={kind} path={kind} element={<Page />} />
              ))}
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="*" element={<p>工作区页面未找到</p>} />
            </Route>
            <Route path="*" element={<Layout />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
