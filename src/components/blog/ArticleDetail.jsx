import { useAuth } from '../../contexts/AuthContext'
import { apiFetch } from '../../utils/api'
import React, { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReaderReturnLink from './ReaderReturnLink'
import CommentSection from './CommentSection'
import MarkdownContent from './MarkdownContent'
import { useSettings } from '../../contexts/SettingsContext'
import { useSeo } from '../../utils/seo'
import './article-reading.css'
/** 在独立阅读底板中展示文章、目录与评论，隔离自定义背景干扰。 */
export default function ArticleDetail() {
  const { user } = useAuth()
  const { slug } = useParams(),
    { settings } = useSettings()
  const [article, setArticle] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [liked, setLiked] = useState(false)
  useSeo({
    title: article ? `${article.title} - ${settings.title}` : settings.title,
    description: article?.excerpt || settings.description,
    image: article?.cover || article?.cover_image || settings.avatar,
    article: !!article
  })
  useEffect(() => {
    const controller = new AbortController()
    setArticle(null)
    setError('')
    setLiked(false)
    apiFetch(`/api/articles/${encodeURIComponent(slug)}`, {
      signal: controller.signal
    })
      .then((r) => {
        if (!r.ok) throw Error(r.status === 404 ? '文章未找到' : '文章加载失败')
        return r.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setArticle(data)
        apiFetch(`/api/stats/article/${data.id}/likes`, {
          signal: controller.signal
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((stats) => {
            if (stats)
              setArticle((current) =>
                current?.id === data.id
                  ? { ...current, likes: stats.likes }
                  : current
              )
          })
          .catch(() => {})
        apiFetch(`/api/stats/article/${data.id}/views`, {
          method: 'POST',
          signal: controller.signal
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((stats) => {
            if (stats)
              setArticle((current) =>
                current?.id === data.id
                  ? { ...current, views: stats.views }
                  : current
              )
          })
          .catch(() => {})
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return () => controller.abort()
  }, [slug, retry])
  const like = async () => {
    try {
      const r = await apiFetch(`/api/stats/article/${article.id}/likes`, {
        method: 'POST'
      })
      if (!r.ok) throw Error('点赞失败，请稍后重试')
      const data = await r.json()
      setArticle((a) => ({ ...a, likes: data.likes }))
      setLiked(true)
    } catch (e) {
      setError(e.message)
    }
  }
  if (!article)
    return (
      <section className="article-reading article-reading-state">
        {error ? (
          <>
            <h1>{error}</h1>
            <button onClick={() => setRetry((n) => n + 1)}>重试</button>
            <ReaderReturnLink />
          </>
        ) : (
          <p role="status">正在加载文章…</p>
        )}
      </section>
    )
  const words = Array.from((article.content || '').replace(/\s/g, '')).length
  return (
    <article className="article-reading">
      <nav className="article-reading-nav" aria-label="文章操作">
      <ReaderReturnLink />
      {user?.role === 'admin' && (
        <Link to={`/studio/editor/${article.id}`}>编辑文章</Link>
      )}
      </nav>
      <header className="article-reading-header">
        <h1>{article.title}</h1>
        <time dateTime={article.publish_date || article.publishDate}>
          {article.publish_date || article.publishDate}
        </time>
        <p>
          {words} 字 · 约 {Math.max(1, Math.ceil(words / 400))} 分钟 ·{' '}
          {article.views || 0} 阅读
        </p>
        <button onClick={like} disabled={liked}>
          {article.likes || 0} 喜欢{liked ? ' · 已点赞' : ''}
        </button>
        <p>
          {(article.tags || []).map((tag) => (
            <Link
              className="mr-3"
              key={tag}
              to={`/tag/${encodeURIComponent(tag)}`}
            >
              #{tag}
            </Link>
          ))}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <MarkdownContent content={article.content} />
      <CommentSection key={article.id} articleId={article.id} />
    </article>
  )
}
