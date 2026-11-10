import { Home, FolderOpen, UserRound, Search, LogIn, PenLine, LayoutDashboard } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { apiFetch } from './utils/api'
import React, { useEffect, useState, useRef, lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  useSearchParams,
  useParams,
  Route,
  Routes,
  useLocation
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

/** 渲染读者布局与导航，列表原地搜索，详情页使用搜索弹层。 */
function Layout() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { theme } = useTheme()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(/* 离开当前文章时关闭搜索弹层。 */ () => setSearchOpen(false), [location.pathname])
  useSeo({
    title: settings.title,
    description: settings.description,
    image: settings.avatar,
    enabled: !location.pathname.startsWith('/article/')
  })
  useEffect(/* 页面导航后将阅读位置返回顶部。 */ () => {
    window.scrollTo(0, 0)
  }, [location.pathname])
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
  const effects = theme?.effects || {}
  return (
    <>
      {!reducedMotion && (
        <div aria-hidden="true">
          {effects.gridOverlay && <GridOverlay />}
          {effects.pixelSnow && <PixelSnow />}
          {effects.splashCursor && <SplashCursor />}
        </div>
      )}
      <a href="#main" className="skip-link">
        跳到正文
      </a>
      <aside className="reader-dock" aria-label="站点导航">
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
            <Link className="dock-link" to={searchTarget}>
              <Search size={20} aria-hidden="true" /><span>搜索</span>
            </Link>
          ) : (
            <button type="button" className="dock-link" aria-haspopup="dialog" onClick={/* 无搜索框的阅读页面打开弹层，保留原地址。 */ () => setSearchOpen(true)}>
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
      </aside>
      <main id="main" className="reader-main max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Listing />} />
          <Route path="/category/:name" element={<Directory />} />
          <Route path="/tag/:name" element={<Directory />} />
          <Route
            path="/article/:slug"
            element={
              <Suspense fallback={<p role="status">正在加载文章…</p>}>
                <ArticleDetail />
              </Suspense>
            }
          />
          <Route path="/explore" element={<Directory />} />
          <Route path="/categories" element={<Navigate replace to="/explore" />} />
          <Route path="/tags" element={<Navigate replace to="/explore" />} />
          <Route
            path="/about"
            element={
              <section className="glass-card p-8">
                <h1>关于 {settings.author}</h1>
                <p>{settings.bio || settings.description}</p>
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
      {searchOpen && <ReaderSearch onClose={/* 关闭弹层并由原生对话框恢复触发焦点。 */ () => setSearchOpen(false)} />}
      {settings.footer && <Footer settings={settings} />}
    </>
  )
}
/** 用原生模态对话框搜索全站文章，锁住背景滚动并保留阅读位置。 */
function ReaderSearch({ onClose }) {
  const dialogRef = useRef(null)
  useEffect(/* 打开原生模态框，卸载时恢复滚动样式及触发控件焦点。 */ () => {
    const dialog = dialogRef.current
    const trigger = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return /* 释放模态层及背景滚动锁，不移动文章阅读位置。 */ () => {
      dialog.close()
      document.body.style.overflow = overflow
      trigger?.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog ref={dialogRef} className="reader-search" aria-labelledby="reader-search-title" onCancel={/* Esc 交由原生对话框触发关闭状态。 */ onClose} onClick={/* 点击文章结果后关闭弹层，包括打开当前文章。 */ (event) => {
      if (event.target.closest('a')) onClose()
    }}>
      <div className="reader-search-heading"><h2 id="reader-search-title">搜索文章</h2><button type="button" onClick={onClose} aria-label="关闭搜索">关闭 · Esc</button></div>
      <ArticleList showCategories={false} filterCategory="" filterTag="" autoFocusSearch />
    </dialog>
  )
}
/** 组合文章列表与站点侧栏。 */
function Listing() {
  const { settings } = useSettings()
  const [total, setTotal] = useState(0)
  return (
    <div
      className={`flex flex-col lg:flex-row gap-8 ${settings.sidebar === 'left' ? 'lg:flex-row-reverse' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <ArticleList perPage={settings.perpage} onTotal={setTotal} />
      </div>
      {settings.sidebar !== 'hidden' && (
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
    if (value) next.set(key, value)
    else next.delete(key)
    return { pathname: '/explore', search: next.toString() }
  }
  return (
    <section className="explore-page">
      <header className="explore-heading">
        <div><h1>探索文章</h1><p>按分类寻找方向，用标签细化兴趣。</p></div>
        {(category || tag) && <Link className="explore-reset" to="/explore">清除筛选</Link>}
      </header>
      <section className="explore-filters" aria-label="文章筛选" aria-busy={status === 'loading'}>
        {status === 'loading' ? <p role="status">正在加载筛选项…</p> : status === 'error' ? (
          <div role="alert">筛选项加载失败。<button onClick={/* 重新加载目录，不改变已选条件。 */ () => setRetry(retry + 1)}>重试</button></div>
        ) : (
          [['categories', '分类', 'category', category], ['tags', '标签', 'tag', tag]].map(/* 两类筛选各占一行，选中状态直接来源于地址。 */ ([kind, label, key, selected]) => (
            <div className="explore-filter-row" key={kind} role="group" aria-label={label}>
              <span className="explore-filter-label">{label}</span>
              <div className="explore-options">
                <Link className={!selected ? 'selected' : ''} aria-current={!selected ? 'true' : undefined} to={filterUrl(key, '')}>全部</Link>
                {catalog[kind].map(/* 呈现可换行的轻量选项，避免每个主题占一张大卡片。 */ (item) => (
                  <Link key={item.id || item.name} className={selected === item.name ? 'selected' : ''} aria-current={selected === item.name ? 'true' : undefined} to={filterUrl(key, item.name)}>
                    {key === 'tag' ? '# ' : ''}{item.name}<small>{item.count || 0}</small>
                  </Link>
                ))}
                {selected && !catalog[kind].some(/* 保留旧链接或已删除目录的筛选状态，允许随时清除。 */ (item) => item.name === selected) && <span className="explore-unknown">当前选择：{selected}</span>}
                {!catalog[kind].length && <span className="explore-unknown">暂无{label}</span>}
              </div>
            </div>
          ))
        )}
      </section>
      <div className="explore-results" aria-label="文章结果">
        <ArticleList key={`${category}:${tag}`} perPage={settings.perpage} filterCategory={category} filterTag={tag} showCategories={false} />
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
