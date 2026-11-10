import React, { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  PenLine,
  FolderOpen,
  Tags,
  MessageSquare,
  Image as ImageIcon,
  Settings,
  Palette,
  ScrollText,
  Plug,
  UserRound,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { studioApi } from '../../utils/studioApi'
import './studio.css'

/** 工作台导航分组配置：capability 项仅在服务器能力允许时渲染；active 覆盖默认前缀匹配。 */
const NAV_GROUPS = [
  {
    label: '总览',
    items: [{ to: '/studio', label: '概览', icon: LayoutDashboard, end: true }],
  },
  {
    label: '内容',
    items: [
      { to: '/studio/articles', label: '文章', icon: FileText, active: /* 已有文章编辑归入文章，排除新建页。 */ (p) => p.startsWith('/studio/articles') || (p.startsWith('/studio/editor/') && p !== '/studio/editor/new') },
      { to: '/studio/editor/new', label: '新建文章', icon: PenLine, end: true },
      { to: '/studio/categories', label: '分类', icon: FolderOpen },
      { to: '/studio/tags', label: '标签', icon: Tags },
      { to: '/studio/comments', label: '评论', icon: MessageSquare },
      { to: '/studio/media', label: '媒体', icon: ImageIcon },
    ],
  },
  {
    label: '站点',
    items: [
      { to: '/studio/settings', label: '站点设置', icon: Settings },
      { to: '/studio/appearance', label: '外观', icon: Palette },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/studio/logs', label: '日志', icon: ScrollText },
      { to: '/studio/integrations', label: '发布集成', icon: Plug, capability: 'publishing' },
    ],
  },
]

/** 判断导航项在当前路径下是否为活动态：end 项仅精确匹配，默认精确或路径前缀匹配，可由 item.active 覆盖。 */
function isItemActive(pathname, item) {
  if (item.active) return item.active(pathname)
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(item.to + '/')
}

/** 在分组配置中查找当前活动项，用于顶栏位置展示。 */
function findActiveItem(pathname, publishingEnabled) {
  for (const group of NAV_GROUPS)
    for (const item of group.items) {
      if (item.capability === 'publishing' && !publishingEnabled) continue
      if (isItemActive(pathname, item)) return item
    }
  return null
}

/** 渲染分组导航链接，供桌面侧栏与移动抽屉共用；onNavigate 在抽屉内点击后关闭抽屉。 */
function NavLinks({ pathname, publishingEnabled, onNavigate }) {
  return (
    <nav className="studio-nav" aria-label="作者工作区">
      {NAV_GROUPS.map(/* 逐组渲染导航分组与条目。 */ (group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <p className="studio-nav-group-label">{group.label}</p>
          {group.items
            .filter(/* 能力未开启时隐藏发布集成入口。 */ (item) => item.capability !== 'publishing' || publishingEnabled)
            .map(/* 渲染单个导航链接并标注活动态。 */ (item) => {
              const active = isItemActive(pathname, item)
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="studio-nav-item"
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
        </div>
      ))}
    </nav>
  )
}

/** 保护作者路由，桌面使用简洁侧栏，手机提供紧凑导航栏与抽屉。 */
export default function StudioLayout() {
  const { user, loading, error, refresh, logout } = useAuth()
  const location = useLocation()
  const [failure, setFailure] = useState('')
  const [publishingEnabled, setPublishingEnabled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef(null)

  useEffect(/* 为管理员查询发布集成是否已启用。 */ () => {
    if (user?.role === 'admin')
      studioApi('/api/studio/capabilities')
        .then(/* 更新发布集成可用状态。 */ (d) => setPublishingEnabled(d.publishingEnabled === true))
        .catch(/* 更新发布集成可用状态。 */ () => setPublishingEnabled(false))
  }, [user?.id])

  useEffect(/* 挂载工作台禁止索引标记并在离开时清理。 */ () => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
    return /* 移除工作台临时禁止索引标记。 */ () => meta.remove()
  }, [])

  /* 抽屉状态与原生 dialog 同步：打开获得焦点约束与 Esc 关闭，关闭后焦点自动回到触发按钮。 */
  useEffect(/* 同步抽屉开关状态到原生对话框。 */ () => {
    const dialog = drawerRef.current
    if (!dialog) return
    if (drawerOpen && !dialog.open) dialog.showModal()
    else if (!drawerOpen && dialog.open) dialog.close()
  }, [drawerOpen])

  /* 路由变化时收起移动抽屉，避免返回导航时抽屉滞留。 */
  useEffect(/* 路由切换后关闭移动抽屉。 */ () => setDrawerOpen(false), [location.pathname])

  if (loading) return <p role="status">正在验证会话…</p>
  if (error)
    return (
      <main className="studio studio--bare">
        <p role="alert">{error}</p>
        <button onClick={refresh}>重试会话验证</button>
      </main>
    )
  if (!user)
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  if (user.role !== 'admin')
    return (
      <main className="studio studio--bare">
        <h1>需要管理员权限</h1>
        <Link to="/">返回博客</Link>
      </main>
    )

  const activeItem = findActiveItem(location.pathname, publishingEnabled)

  /** 退出作者会话并在失败时保留提示。 */
  async function handleLogout() {
    try {
      await logout()
    } catch (e) {
      setFailure(e.message)
    }
  }

  return (
    <div className="studio">
      <aside className="studio-sidebar">
        <p className="studio-brand">内容工作台</p>
        <NavLinks pathname={location.pathname} publishingEnabled={publishingEnabled} />
        <div className="studio-sidebar-footer">
          <Link to="/" className="studio-button studio-button--ghost">查看博客</Link>
          <p className="studio-account">
            <UserRound aria-hidden="true" />
            <span>{user.username}</span>
          </p>
          <Link to="/studio/account" className="studio-button studio-button--ghost">
            账号设置
          </Link>
          <button className="studio-button studio-button--ghost" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </aside>

      <dialog
        ref={drawerRef}
        id="studio-drawer"
        className="studio-drawer"
        aria-labelledby="studio-drawer-title"
        onCancel={/* Esc 关闭抽屉并与状态保持同步。 */ () => setDrawerOpen(false)}
        onClose={/* 对话框以任意方式关闭后同步状态。 */ () => setDrawerOpen(false)}
      >
        <div className="studio-drawer-header">
          <h2 className="studio-drawer-title" id="studio-drawer-title">
            工作台导航
          </h2>
          <button
            className="studio-button studio-button--ghost"
            onClick={/* 关闭移动导航抽屉。 */ () => setDrawerOpen(false)}
          >
            <X aria-hidden="true" />
            关闭
          </button>
        </div>
        <NavLinks
          pathname={location.pathname}
          publishingEnabled={publishingEnabled}
          onNavigate={/* 点击抽屉内导航后关闭抽屉。 */ () => setDrawerOpen(false)}
        />
        <div className="studio-sidebar-footer">
          <button className="studio-button studio-button--ghost" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </dialog>

      <div className="studio-main">
        <header className="studio-topbar">
          <button
            className="studio-button studio-button--ghost studio-menu-button"
            aria-expanded={drawerOpen}
            aria-controls="studio-drawer"
            onClick={/* 打开移动导航抽屉。 */ () => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" />
            <span className="sr-only">打开导航</span>
          </button>
          <p className="studio-topbar-location">{activeItem ? activeItem.label : '工作台'}</p>
          <div className="studio-topbar-actions">
            <Link to="/" className="studio-button studio-button--ghost">
              查看博客
            </Link>
          </div>
        </header>
        {failure && (
          <p className="studio-failure" role="alert">
            {failure}
          </p>
        )}
        <main className="studio-content" id="studio-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
