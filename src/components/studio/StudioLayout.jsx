import React, { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { studioApi } from '../../utils/studioApi'
import './studio.css'
/** 保护作者路由并展示工作区导航。 */
export default function StudioLayout() {
  const { user, loading, error, refresh, logout } = useAuth(),
    location = useLocation(),
    [failure, setFailure] = useState('')
  const [publishingEnabled, setPublishingEnabled] = useState(false)
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
  if (loading) return <p role="status">正在验证会话…</p>
  if (error)
    return (
      <main className="studio">
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
      <main className="studio">
        <h1>需要管理员权限</h1>
        <Link to="/">返回博客</Link>
      </main>
    )
  return (
    <div className="studio">
      <header>
        <Link to="/">返回博客</Link>
        <strong>作者工作台</strong>
        <span>{user.username}</span>
        <button
          onClick={/* 退出作者会话并反馈失败。 */ async () => {
            try {
              await logout()
            } catch (e) {
              setFailure(e.message)
            }
          }}
        >
          退出登录
        </button>
      </header>
      <nav aria-label="作者工作区">
        {[
          ['', '概览'],
          ['articles', '文章'],
          ['editor/new', '写文章'],
          ['categories', '分类'],
          ['tags', '标签'],
          ['comments', '评论'],
          ['media', '媒体'],
          ['settings', '站点设置'],
          ['appearance', '外观'],
          ['account', '账号'],
          ['logs', '日志'],
          ['integrations', '发布集成']
        ]
          .filter(/* 筛选符合当前条件的条目。 */ ([path]) => path !== 'integrations' || publishingEnabled)
          .map(/* 将当前条目映射为展示内容。 */ ([path, label]) => (
            <NavLink end={path === ''} key={path} to={`/studio/${path}`}>
              {label}
            </NavLink>
          ))}
      </nav>
      {failure && <p role="alert">{failure}</p>}
      <main>
        <Outlet />
      </main>
    </div>
  )
}
