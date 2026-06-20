import React, { useState, useEffect, useCallback, memo } from 'react'
import { Calendar, Eye, Heart, ArrowRight } from 'lucide-react'
import { logger } from '../../utils/logger'

function highlightText(text, query) {
  if (!query || !query.trim()) return text
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={`${part}-${i}`} className="bg-gold/30 text-gold rounded px-0.5">{part}</mark> : part
  )
}

function getSnippet(text, query, contextLen = 12) {
  if (!query || !query.trim() || !text) return null
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) return null
  const start = Math.max(0, idx - contextLen)
  const end = Math.min(text.length, idx + query.length + contextLen)
  let snippet = text.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'
  return snippet
}

const ArticleCard = memo(function ArticleCard({ article, onClick, searchQuery }) {
  const [views, setViews] = useState(article.views || 0)
  const [likes, setLikes] = useState(article.likes || 0)
  const [isLiked, setIsLiked] = useState(false)

  useEffect(() => {
    fetch(`/api/stats/article/${article.id}/views`)
      .then(res => res.json())
      .then(data => setViews(data.views))
      .catch(() => {})

    fetch(`/api/stats/article/${article.id}/likes`)
      .then(res => res.json())
      .then(data => setLikes(data.likes))
      .catch(() => {})
  }, [article.id])

  const handleClick = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    logger.info('ArticleCard 点击', { title: article.title, hasCallback: !!onClick })
    if (onClick) {
      onClick(article)
    }
  }, [article, onClick])

  const handleLike = useCallback(async (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!isLiked) {
      try {
        const res = await fetch(`/api/stats/article/${article.id}/likes`, { method: 'POST' })
        const data = await res.json()
        setLikes(data.likes)
        setIsLiked(true)
      } catch (err) {
        logger.error('点赞失败', { error: err.message })
      }
    }
  }, [article.id, isLiked])

  const titleSnippet = searchQuery ? getSnippet(article.title, searchQuery) : null
  const excerptSnippet = searchQuery ? getSnippet(article.excerpt, searchQuery) : null
  const contentSnippet = searchQuery && article.content ? getSnippet(article.content, searchQuery) : null

  return (
    <div 
      className="glass-card glass-card-hover p-5 cursor-pointer group relative overflow-hidden"
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 text-xs text-dark-400 mb-3">
        <Calendar size={12} />
        <span>{article.publishDate}</span>
        <span className="px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">{article.category}</span>
      </div>
      
      <h2 className="text-lg font-bold mb-2 text-white group-hover:text-gold transition-colors line-clamp-1">
        {searchQuery ? highlightText(article.title, searchQuery) : article.title}
      </h2>
      
      <p className="text-dark-400 text-sm mb-3 line-clamp-2 leading-relaxed">
        {searchQuery ? highlightText(article.excerpt, searchQuery) : article.excerpt}
      </p>

      {contentSnippet && (
        <div className="mb-3 px-3 py-2 bg-dark-800/50 rounded-lg border-l-2 border-gold/50">
          <p className="text-dark-300 text-xs leading-relaxed">
            {highlightText(contentSnippet, searchQuery)}
          </p>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {article.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-dark-800/80 text-dark-400 border border-dark-700/50">
              {searchQuery ? highlightText(tag, searchQuery) : tag}
            </span>
          ))}
        </div>
        
        <div className="flex items-center gap-3 text-xs text-dark-400">
          <span>{views} 阅读</span>
          <button 
            onClick={handleLike}
            className={`transition-colors ${isLiked ? 'text-red-400' : 'hover:text-red-400'}`}
          >
            {likes} 喜欢
          </button>
          <span className="flex items-center gap-1 text-gold opacity-0 group-hover:opacity-100 transition-opacity">
            阅读
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </div>
  )
})

export default ArticleCard