import React, { useState, useEffect } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { User, Tag, Folder, Mail, ExternalLink } from 'lucide-react'

export default function Sidebar() {
  const [stats, setStats] = useState({ views: 0, likesCount: 0, articleCount: 0 })
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const { settings } = useSettings()

  useEffect(() => {
    fetch('/api/stats/views')
      .then(res => res.json())
      .then(data => setStats(prev => ({ ...prev, views: data.views })))
      .catch(() => {})

    fetch('/api/articles')
      .then(res => res.json())
      .then(data => {
        const articles = Array.isArray(data) ? data : (data.articles || [])
        setStats(prev => ({ ...prev, articleCount: articles.length }))
      })
      .catch(() => {})

    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        const cats = Array.isArray(data) ? data : (data.categories || [])
        const catCountMap = {}
        cats.forEach(c => catCountMap[c.name] = 0)
        
        fetch('/api/articles')
          .then(res => res.json())
          .then(articlesData => {
            const articles = Array.isArray(articlesData) ? articlesData : (articlesData.articles || [])
            articles.forEach(article => {
              const cat = article.category || '未分类'
              if (catCountMap[cat] !== undefined) {
                catCountMap[cat]++
              } else {
                catCountMap[cat] = 1
              }
            })
            setCategories(Object.entries(catCountMap).map(([name, count]) => ({ name, count })))
          })
          .catch(() => setCategories(cats))
      })
      .catch(() => {})

    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        const tagList = Array.isArray(data) ? data : (data.tags || [])
        setTags(tagList.map(t => t.name))
      })
      .catch(() => {})
  }, [])

  return (
    <aside className="w-full space-y-5">
      <div className="glass-card p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gold via-gold-light to-gold-dark flex items-center justify-center mb-4 mx-auto shadow-lg shadow-gold/20">
          <span className="text-dark-950 font-bold text-2xl">
            {(settings?.author || 'T').charAt(0).toUpperCase()}
          </span>
        </div>
        <h3 className="text-lg font-bold text-white mb-1">{settings?.author || 'Tech Blogger'}</h3>
        <p className="text-dark-400 text-sm mb-4">{settings?.bio || '探索技术世界，分享编程经验'}</p>
        <div className="flex justify-center gap-3">
          {settings?.github && (
            <a 
              href={settings.github} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-dark-800/80 text-dark-400 hover:text-gold hover:bg-gold/10 transition-all border border-dark-700/50"
            >
              <ExternalLink size={16} />
            </a>
          )}
          {settings?.email && (
            <a 
              href={`mailto:${settings.email}`}
              className="p-2.5 rounded-xl bg-dark-800/80 text-dark-400 hover:text-gold hover:bg-gold/10 transition-all border border-dark-700/50"
            >
              <Mail size={16} />
            </a>
          )}
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">{stats.views}</div>
            <div className="text-xs text-dark-400 mt-1">访问</div>
          </div>
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">{stats.articleCount}</div>
            <div className="text-xs text-dark-400 mt-1">文章</div>
          </div>
          <div className="p-3 rounded-xl bg-dark-800/30">
            <div className="text-2xl font-bold text-gold">{stats.likesCount}</div>
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
            {categories.map((cat, index) => (
              <button 
                key={index}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-dark-300 hover:text-gold hover:bg-dark-800/50 transition-all text-sm"
              >
                <span>{cat.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-dark-800 text-dark-400">{cat.count}</span>
              </button>
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
            {tags.map((tag, index) => (
              <button 
                key={index}
                className="px-3 py-1.5 rounded-full text-xs bg-dark-800/80 text-dark-300 hover:text-gold hover:bg-gold/10 border border-dark-700/50 hover:border-gold/30 transition-all"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
