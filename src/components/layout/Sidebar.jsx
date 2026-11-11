import { STATS_CHANGED } from '../../utils/readerStats'
import { apiFetch } from '../../utils/api'
import { Link } from 'react-router-dom'
import React, { useState, useEffect, useId } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import ContactLinks from './ContactLinks'
import './sidebar.css'
import { Tag, Folder, ChevronDown } from 'lucide-react'

/** 为侧栏目录提供独立折叠与键盘开关，收起时禁止焦点进入隐藏链接。 */
function SidebarSection({ title, icon: Icon, children }) {
  const [open, setOpen] = useState(true)
  const id = useId()
  return (
    <section className="reader-sidebar-section glass-card p-5" data-expanded={open}>
      <h3>
        <button type="button" className="reader-sidebar-toggle" aria-expanded={open} aria-controls={id}
          onClick={/* 仅切换当前目录，不影响另一目录的状态。 */ () => setOpen(/* 反转当前目录的展开状态。 */ current => !current)}>
          <Icon size={16} className="text-gold" aria-hidden="true" />
          <span>{title}</span>
          <ChevronDown size={16} className="reader-sidebar-chevron" aria-hidden="true" />
        </button>
      </h3>
      <div id={id} className="reader-sidebar-collapse" aria-hidden={!open} inert={!open}>
        <div className="reader-sidebar-collapse-inner">{children}</div>
      </div>
    </section>
  )
}

/** 展示作者资料、按配置点亮的联系账号及内容目录。 */
export default function Sidebar({ total = 0 }) {
  const [stats, setStats] = useState({
    views: null,
    likesCount: null
  })
  const [statsError, setStatsError] = useState(false)
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const { settings } = useSettings()

  useEffect(/* 挂载、访问记录或点赞成功后重新读取真实汇总，失败时不伪装成零。 */ () => {
    let active = true
    let sequence = 0
    /** 用递增请求序号阻止慢响应覆盖较新的计数。 */
    async function refreshStats() {
      const request = ++sequence
      try {
        const response = await apiFetch('/api/stats/summary', { cache: 'no-store' })
        if (!response.ok) throw new Error('统计暂不可用')
        const data = await response.json()
        if (active && request === sequence) {
          setStats({ views: data.views, likesCount: data.likes })
          setStatsError(false)
        }
      } catch {
        if (active && request === sequence) setStatsError(true)
      }
    }
    refreshStats()
    window.addEventListener(STATS_CHANGED, refreshStats)
    window.addEventListener('focus', refreshStats)
    return /* 卸载后停止回填并移除刷新监听。 */ () => {
      active = false
      window.removeEventListener(STATS_CHANGED, refreshStats)
      window.removeEventListener('focus', refreshStats)
    }
  }, [])

  useEffect(/* 加载分类与标签目录。 */ () => {
    apiFetch('/api/categories')
      .then(/* 读取目录接口响应。 */ (res) => res.json())
      .then(/* 更新目录数据。 */ (data) =>
        setCategories(Array.isArray(data) ? data : data.categories || [])
      )
      .catch(/* 目录失败时保留当前条目。 */ () => {})

    apiFetch('/api/tags')
      .then(/* 读取目录接口响应。 */ (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(/* 更新目录数据。 */ (data) => {
        const tagList = Array.isArray(data) ? data : data.tags || []
        setTags(tagList.map(/* 提取标签名称。 */ (t) => t.name))
      })
      .catch(/* 目录失败时保留当前条目。 */ () => {})
  }, [])

  return (
    <aside className="reader-sidebar w-full space-y-5">
      <div className="reader-profile glass-card p-6 text-center">
        <span className="reader-profile-caption">关于作者</span>
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gold via-gold-light to-gold-dark flex items-center justify-center mb-4 mx-auto shadow-lg shadow-gold/20 overflow-hidden">
          {settings?.avatar ? (
            <img
              src={settings.avatar}
              alt={settings.author || 'Avatar'}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-dark-950 font-bold text-2xl">
              {(settings?.author || 'T').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold text-white mb-1">
          {settings?.author || 'Tech Blogger'}
        </h3>
        <p className="text-dark-400 text-sm mb-4">
          {settings?.bio || '探索技术世界，分享编程经验'}
        </p>
        <ContactLinks settings={settings} hideUnavailable />
        <div className="reader-profile-stats grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">{statsError ? '—' : stats.views ?? '—'}</div>
            <div className="text-xs text-dark-400 mt-1">访问</div>
          </div>
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">{total}</div>
            <div className="text-xs text-dark-400 mt-1">文章</div>
          </div>
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">
              {statsError ? '—' : stats.likesCount ?? '—'}
            </div>
            <div className="text-xs text-dark-400 mt-1">点赞</div>
          </div>
        </div>
        {statsError && <small role="status" className="text-dark-400">统计暂不可用，请稍后重试</small>}
      </div>

      {categories.length > 0 && (
        <SidebarSection title="分类" icon={Folder}>
          <div className="space-y-1">
            {categories.map(/* 渲染分类链接及公开文章数。 */ (cat) => (
              <Link
                to={`/category/${encodeURIComponent(cat.name)}`}
                key={cat.id || cat.slug || cat.name}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-dark-300 hover:text-gold hover:bg-dark-800/50 transition-all text-sm"
              >
                <span>{cat.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-dark-800 text-dark-400">
                  {cat.count}
                </span>
              </Link>
            ))}
          </div>
        </SidebarSection>
      )}

      {tags.length > 0 && (
        <SidebarSection title="标签" icon={Tag}>
          <div className="flex flex-wrap gap-2">
            {tags.map(/* 渲染标签筛选链接。 */ (tag) => (
              <Link
                to={`/tag/${encodeURIComponent(tag)}`}
                key={tag.id || tag.slug || tag}
                className="px-3 py-1.5 rounded-full text-xs bg-dark-800/80 text-dark-300 hover:text-gold hover:bg-gold/10 border border-dark-700/50 hover:border-gold/30 transition-all"
              >
                {tag}
              </Link>
            ))}
          </div>
        </SidebarSection>
      )}
    </aside>
  )
}
