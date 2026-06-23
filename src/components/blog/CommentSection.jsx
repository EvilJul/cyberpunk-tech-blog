import React, { useState, useEffect, useCallback, memo } from 'react'
import { User, Mail, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'

const CommentSection = memo(function CommentSection({ articleId }) {
  const [comments, setComments] = useState([])
  const [formData, setFormData] = useState({ author: '', email: '', content: '' })
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const DEFAULT_SHOW = 3

  useEffect(() => {
    fetch(`/api/comments/${articleId}`)
      .then(res => res.json())
      .then(data => setComments(data))
      .catch(err => console.error('获取评论失败:', err))
  }, [articleId])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch(`/api/comments/${articleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        const newComment = await res.json()
        setComments([...comments, newComment])
        setFormData({ author: '', email: '', content: '' })
      }
    } catch (err) {
      console.error('提交评论失败:', err)
    } finally {
      setSubmitting(false)
    }
  }, [articleId, formData, comments])

  const visibleComments = expanded ? comments : comments.slice(0, DEFAULT_SHOW)
  const hasMore = comments.length > DEFAULT_SHOW

  return (
    <div className="mt-12">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-3 px-4 bg-dark-800/50 rounded-lg border border-dark-700 hover:border-dark-600 transition-colors cursor-pointer group"
      >
        <span className="text-xl font-bold gradient-text">
          评论区{comments.length > 0 ? `（${comments.length}）` : ''}
        </span>
        {expanded
          ? <ChevronUp size={20} className="text-dark-400 group-hover:text-gold transition-colors" />
          : <ChevronDown size={20} className="text-dark-400 group-hover:text-gold transition-colors" />
        }
      </button>

      {expanded && (
        <div className="mt-6">
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="relative">
                <User className="absolute left-3 top-3 text-dark-400" size={18} />
                <input
                  type="text"
                  placeholder="昵称"
                  value={formData.author}
                  onChange={e => setFormData({ ...formData, author: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none"
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-dark-400" size={18} />
                <input
                  type="email"
                  placeholder="邮箱（选填）"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none"
                />
              </div>
            </div>
            <div className="relative mb-4">
              <MessageSquare className="absolute left-3 top-3 text-dark-400" size={18} />
              <textarea
                placeholder="评论内容"
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none h-24 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-gold text-dark-950 rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50"
            >
              {submitting ? '提交中...' : '发表评论'}
            </button>
          </form>

          <div className="space-y-4">
            {visibleComments.map(comment => (
              <div key={comment.id} className="p-4 border border-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
                    {comment.author.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-white">{comment.author}</span>
                  <span className="text-dark-400 text-sm">{new Date(comment.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-dark-200">{comment.content}</p>
              </div>
            ))}
          </div>

          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full mt-4 py-2 text-gold hover:text-gold-light transition-colors text-sm"
            >
              查看全部 {comments.length} 条评论
            </button>
          )}

          {comments.length === 0 && (
            <p className="text-dark-500 text-sm text-center py-4">暂无评论，来说两句吧</p>
          )}
        </div>
      )}
    </div>
  )
})

export default CommentSection
