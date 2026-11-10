import { apiFetch } from '../../utils/api'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import React, { useState, useCallback, memo } from 'react'
import { Calendar, ArrowRight } from 'lucide-react'
import { logger } from '../../utils/logger'
import { useMobileReader } from '../../utils/readerViewport'
import './article-card.css'

/** 高亮纯文本中的搜索词，不插入 HTML。 */
function highlightText(text, query) {
  if (!query || !query.trim() || !text) return text
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi'
  )
  const parts = text.split(regex)
  return parts.map(/* 保留非命中片段，仅标记搜索词。 */ (part, i) =>
    regex.test(part) ? (
      <mark
        key={`${part}-${i}`}
        className="bg-gold/30 text-gold rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}

/** 从已有列表内容提取搜索上下文，不请求文章详情。 */
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

/** 仅清理列表展示的 Markdown 图片、链接及格式，不修改保存内容。 */
function plainExcerpt(value) {
  return String(value || '')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/!?\[([^\]]*)\]\((?:[^()\n]|\([^()]*\))*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(?:^|\n)\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+)/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 展示文章摘要与独立操作，并在普通打开时记录列表返回位置。 */
const ArticleCard = memo(function ArticleCard({ article, searchQuery }) {
  const mobile = useMobileReader()
  const location = useLocation()
  const navigate = useNavigate()
  const articleUrl = `/article/${encodeURIComponent(article.slug || article.id)}`
  /** 仅接管普通左键；修饰键、新窗口和弹层捕获处理保持原行为。 */
  const openArticle = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.currentTarget.target && event.currentTarget.target !== '_self')) return
    event.preventDefault()
    navigate(articleUrl, { state: { readerReturn: { url: location.pathname + location.search, scrollY: window.scrollY } } })
  }
  const excerpt = plainExcerpt(article.excerpt)
  const [likes, setLikes] = useState(article.likes || 0)
  const [isLiked, setIsLiked] = useState(false)

  const handleLike = useCallback(
    /* 点赞仅更新本卡状态，不触发整卡导航。 */
    async (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (!isLiked) {
        try {
          const res = await apiFetch(`/api/stats/article/${article.id}/likes`, {
            method: 'POST'
          })
          if (!res.ok) throw Error('点赞失败，请重试')
          const data = await res.json()
          setLikes(data.likes)
          setIsLiked(true)
        } catch (err) {
          logger.error('点赞失败', { error: err.message })
        }
      }
    },
    [article.id, isLiked]
  )

  const contentSnippet =
    searchQuery && article.content
      ? getSnippet(plainExcerpt(article.content), searchQuery)
      : null

  const wordCount =
    article.word_count ??
    (typeof article.content === 'string'
      ? Array.from(article.content.replace(/\s/g, '')).length
      : null)
  const readingMinutes =
    article.reading_minutes ??
    (wordCount === null ? null : Math.max(1, Math.ceil(wordCount / 400)))
  const publishDate = article.publish_date || article.publishDate

  return (
    <article className="article-card glass-card glass-card-hover p-5 cursor-pointer group relative overflow-hidden">
      <div className="article-card-meta flex items-center gap-2 text-xs text-dark-400 mb-3">
        <Calendar size={12} />
        <time dateTime={publishDate}>{publishDate}</time>
        <Link
          to={`/category/${encodeURIComponent(article.category || '未分类')}`}
        >
          {article.category}
        </Link>
      </div>

      <h2 className="text-lg font-bold mb-2 text-white group-hover:text-gold transition-colors">
        <Link
          className="article-card-link"
          to={articleUrl}
          onClick={openArticle}
        >
          <span className="article-card-title line-clamp-1">
            {searchQuery
              ? highlightText(article.title, searchQuery)
              : article.title}
          </span>
        </Link>
      </h2>

      {excerpt && <p className="article-card-excerpt text-dark-400 text-sm mb-3 line-clamp-2 leading-relaxed">
        {searchQuery
          ? highlightText(excerpt, searchQuery)
          : excerpt}
      </p>}

      {contentSnippet && (
        <div className="article-card-snippet mb-3 px-3 py-2 bg-dark-800/50 rounded-lg border-l-2 border-gold/50">
          <p className="text-dark-300 text-xs leading-relaxed">
            {highlightText(contentSnippet, searchQuery)}
          </p>
        </div>
      )}

      {readingMinutes !== null && (
        <p className="article-card-reading-time text-sm">
          {wordCount !== null && `${wordCount} 字 · `}约 {readingMinutes} 分钟
        </p>
      )}
      <div className="article-card-footer flex items-center justify-between">
        <div className="article-card-tags flex flex-wrap gap-1.5">
          {(article.tags || []).slice(0, mobile ? 2 : 3).map(/* 标签保留独立分类导航。 */ (tag) => (
            <Link
              to={`/tag/${encodeURIComponent(tag)}`}
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-dark-800/80 text-dark-400 border border-dark-700/50"
            >
              {searchQuery ? highlightText(tag, searchQuery) : tag}
            </Link>
          ))}
        </div>

        <div className="article-card-stats flex items-center gap-3 text-xs text-dark-400">
          <span>{article.views || 0} 阅读</span>
          <button
            type="button"
            aria-pressed={isLiked}
            onClick={handleLike}
            className={`transition-colors ${isLiked ? 'text-red-400' : 'hover:text-red-400'}`}
          >
            {likes} 喜欢
          </button>
          <span className="article-card-read-cue flex items-center gap-1 text-gold opacity-0 group-hover:opacity-100 transition-opacity">
            阅读
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </article>
  )
})

export default ArticleCard
