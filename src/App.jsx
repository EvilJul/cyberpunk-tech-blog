import { AuthProvider, useAuth } from './contexts/AuthContext'
import { apiFetch } from './utils/api'
import React, { useEffect, useState, lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
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

/** 渲染读者布局和随作者身份变化的导航入口。 */
function Layout() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { switchTheme, theme } = useTheme()
  const location = useLocation()
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
      <header className="site-header">
        <Link to="/">{settings.title}</Link>
        <nav aria-label="主导航">
          {[
            ['/', '首页'],
            ['/categories', '分类'],
            ['/tags', '标签'],
            ['/about', '关于']
          ].map(/* 渲染公共页面导航链接。 */ ([path, title]) => (
            <NavLink end key={path} to={path}>
              {title}
            </NavLink>
          ))}
        </nav>
        <Link to="/?focus=search">搜索</Link>
        {user?.role === 'admin' ? (
          <>
            <Link to="/studio/editor/new">写文章</Link>
            <Link to="/studio">工作台</Link>
          </>
        ) : (
          !user && (
            <Link
              to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
            >
              登录
            </Link>
          )
        )}
        <button onClick={/* 切换为浅色主题。 */ () => switchTheme('minimal')}>浅色</button>
        <button onClick={/* 切换为深色主题。 */ () => switchTheme('cyberpunk')}>深色</button>
      </header>
      <main id="main" className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Listing />} />
          <Route path="/category/:name" element={<Listing />} />
          <Route path="/tag/:name" element={<Listing />} />
          <Route
            path="/article/:slug"
            element={
              <Suspense fallback={<p role="status">正在加载文章…</p>}>
                <ArticleDetail />
              </Suspense>
            }
          />
          <Route path="/categories" element={<Directory kind="categories" />} />
          <Route path="/tags" element={<Directory kind="tags" />} />
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
      {settings.footer && <Footer settings={settings} />}
    </>
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
/** 加载分类或标签目录并展示可访问的文章入口。 */
function Directory({ kind }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState(false)
  useEffect(/* 加载当前目录并在离开时取消请求。 */ () => {
    const controller = new AbortController()
    setError(false)
    apiFetch(`/api/${kind}`, { signal: controller.signal })
      .then(/* 校验目录响应并读取 JSON。 */ (r) => {
        if (!r.ok) throw Error()
        return r.json()
      })
      .then(/* 接收兼容数组或分页形式的目录数据。 */ (data) => setItems(Array.isArray(data) ? data : data[kind] || []))
      .catch(/* 展示非主动取消的目录加载错误。 */ (e) => {
        if (e.name !== 'AbortError') setError(true)
      })
    return /* 卸载时取消目录请求。 */ () => controller.abort()
  }, [kind])
  return (
    <section>
      <h1>{kind === 'tags' ? '标签' : '分类'}</h1>
      {error ? (
        <p role="alert">加载失败，请刷新重试</p>
      ) : (
        <ul>
          {items.map(/* 渲染分类或标签及其文章数。 */ (item) => (
            <li key={item.id || item.name}>
              <Link
                to={`/${kind === 'tags' ? 'tag' : 'category'}/${encodeURIComponent(item.name)}`}
              >
                {item.name} ({item.count || 0})
              </Link>
            </li>
          ))}
        </ul>
      )}
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
