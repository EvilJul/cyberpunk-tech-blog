import React, { useState, useEffect } from 'react'
import { User, Mail, MessageSquare } from 'lucide-react'

export default function CommentSection({ articleId }) {
  const [comments, setComments] = useState([])
  const [formData, setFormData] = useState({ author: '', email: '', content: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/comments/${articleId}`)
      .then(res => res.json())
      .then(data => setComments(data))
      .catch(err => console.error('获取评论失败:', err))
  }, [articleId])

  const handleSubmit = async (e) => {
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
  }

  return (
    <div className="mt-12">
      <h3 className="text-2xl font-bold mb-6 gradient-text">评论区</h3>
      
      <form onSubmit={handleSubmit} className="glass-card p-6 mb-8">
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
              placeholder="邮箱"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-gold focus:outline-none"
              required
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
        {comments.map(comment => (
          <div key={comment.id} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
                {comment.author.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold">{comment.author}</span>
              <span className="text-dark-400 text-sm">{new Date(comment.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-dark-300">{comment.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}