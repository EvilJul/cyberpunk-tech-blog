import { apiFetch } from '../../utils/api'
import { Link } from 'react-router-dom'
import React, { useState, useEffect } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import ContactLinks from './ContactLinks'
import { Tag, Folder } from 'lucide-react'

/** 展示作者资料、按配置点亮的联系账号及内容目录。 */
export default function Sidebar({ total = 0 }) {
  const [stats, setStats] = useState({
    views: 0,
    likesCount: 0,
    articleCount: 0
  })
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const { settings } = useSettings()

  useEffect(() => {
    apiFetch('/api/stats/views')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setStats((prev) => ({ ...prev, views: data.views })))
      .catch(() => {})

    apiFetch('/api/categories')
      .then((res) => res.json())
      .then((data) =>
        setCategories(Array.isArray(data) ? data : data.categories || [])
      )
      .catch(() => {})

    apiFetch('/api/tags')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const tagList = Array.isArray(data) ? data : data.tags || []
        setTags(tagList.map((t) => t.name))
      })
      .catch(() => {})
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
            <div className="text-2xl font-bold text-gold">{stats.views}</div>
            <div className="text-xs text-dark-400 mt-1">访问</div>
          </div>
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">{total}</div>
            <div className="text-xs text-dark-400 mt-1">文章</div>
          </div>
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">
              {stats.likesCount}
            </div>
            <div className="text-xs text-dark-400 mt-1">点赞</div>
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="flex items-center gap-2 text-white font-bold mb-3">
            <Folder size={16} className="text-gold" />
            <span>分类</span>
          </h3>
          <div className="space-y-1">
            {categories.map((cat) => (
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
        </div>
      )}

      {tags.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="flex items-center gap-2 text-white font-bold mb-3">
            <Tag size={16} className="text-gold" />
            <span>标签</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                to={`/tag/${encodeURIComponent(tag)}`}
                key={tag.id || tag.slug || tag}
                className="px-3 py-1.5 rounded-full text-xs bg-dark-800/80 text-dark-300 hover:text-gold hover:bg-gold/10 border border-dark-700/50 hover:border-gold/30 transition-all"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
