import React, { useState, useEffect } from 'react'
import { ArrowLeft, Calendar, Eye, Heart, Tag, MessageSquare } from 'lucide-react'
import CommentSection from './CommentSection'
import { useSettings } from '../../contexts/SettingsContext'

export default function ArticleDetail({ article, onBack }) {
  const [views, setViews] = useState(0)
  const [likes, setLikes] = useState(0)
  const [isLiked, setIsLiked] = useState(false)
  const { settings } = useSettings()

  useEffect(() => {
    fetch(`/api/stats/article/${article.id}/views`, { method: 'POST' })
      .then(res => res.json())
      .then(data => setViews(data.views))
      .catch(() => {})

    fetch(`/api/stats/article/${article.id}/likes`)
      .then(res => res.json())
      .then(data => setLikes(data.likes))
      .catch(() => {})
  }, [article.id])

  const handleLike = async () => {
    if (!isLiked) {
      try {
        const res = await fetch(`/api/stats/article/${article.id}/likes`, { method: 'POST' })
        const data = await res.json()
        setLikes(data.likes)
        setIsLiked(true)
      } catch (err) {
        console.error('点赞失败:', err)
      }
    }
  }

  const renderContent = (content) => {
    if (!content) return null
    return content.split('\n').map((line, index) => {
      if (line.startsWith('# ')) {
        return <h1 key={index} className="text-3xl font-bold text-white mb-4 mt-6">{line.slice(2)}</h1>
      }
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-2xl font-bold text-white mb-3 mt-5">{line.slice(3)}</h2>
      }
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-xl font-bold text-white mb-2 mt-4">{line.slice(4)}</h3>
      }
      if (line.startsWith('- ')) {
        return <li key={index} className="text-dark-200 ml-4 mb-1 list-disc">{line.slice(2)}</li>
      }
      if (line.trim() === '') {
        return <br key={index} />
      }
      return <p key={index} className="text-dark-200 mb-3 leading-relaxed">{line}</p>
    })
  }

  return (
    <article className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-dark-400 hover:text-gold mb-8 transition-colors group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span>返回文章列表</span>
        </button>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-white">
            {article.title}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-dark-400">
            {article.publishDate && (
              <div className="flex items-center gap-1.5">
                <Calendar size={14} />
                <span>{article.publishDate}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Eye size={14} />
              <span>{views} 阅读</span>
            </div>
            <button 
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition-colors ${isLiked ? 'text-red-400' : 'hover:text-red-400'}`}
            >
              <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
              <span>{likes} 喜欢</span>
            </button>
            <div className="flex items-center gap-1.5">
              <MessageSquare size={14} />
              <span>评论</span>
            </div>
            {article.author && (
              <div className="flex items-center gap-1.5">
                <span>作者: {article.author}</span>
              </div>
            )}
          </div>

          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {article.tags.map((tag, index) => (
                <span 
                  key={index}
                  className="flex items-center gap-1 px-3 py-1 bg-gold/10 text-gold rounded-full text-sm border border-gold/20"
                >
                  <Tag size={12} />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="glass-card p-6 md:p-8 mb-8">
          <div className="prose prose-invert max-w-none">
            {renderContent(article.content)}
          </div>
        </div>

        <CommentSection articleId={article.id} />
      </div>
    </article>
  )
}
