import { apiFetch } from '../../utils/api'
import React, { useState, useEffect } from 'react'
export default function CommentSection({ articleId }) {
  const [comments, setComments] = useState([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [reply, setReply] = useState(null),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0)
  const [form, setForm] = useState({ author: '', email: '', content: '' })
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    apiFetch(`/api/comments/${articleId}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error('评论加载失败')
        return r.json()
      })
      .then((data) => setComments(data.filter((c) => c.status === 'approved')))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return () => controller.abort()
  }, [articleId, retry])
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await apiFetch(`/api/comments/${articleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, parentId: reply?.id || null })
      })
      if (!r.ok)
        throw Error(
          r.status === 429 ? '提交过于频繁，请稍后再试' : '评论提交失败，请重试'
        )
      setNotice('评论已提交，审核通过后公开显示。')
      setForm((f) => ({ ...f, content: '' }))
      setReply(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const ids = new Set(comments.map((c) => c.id))
  const render = (comment, ancestors = []) => (
    <li key={comment.id}>
      <div className="comment">
        <strong>{comment.author}</strong>{' '}
        <time dateTime={comment.created_at}>
          {comment.created_at &&
            new Date(comment.created_at).toLocaleDateString()}
        </time>
        <p style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</p>
        <button
          onClick={() => {
            setReply(comment)
            document.getElementById('comment-content')?.focus()
          }}
        >
          回复 {comment.author}
        </button>
      </div>
      {ancestors.length < 20 && (
        <ul>
          {comments
            .filter(
              (c) =>
                (c.parent_id || c.parentId) === comment.id &&
                !ancestors.includes(c.id)
            )
            .map((c) => render(c, [...ancestors, comment.id]))}
        </ul>
      )}
    </li>
  )
  return (
    <section className="comments">
      <h2>评论区</h2>
      {error && (
        <p role="alert">
          {error}{' '}
          <button onClick={() => setRetry((n) => n + 1)}>重新加载</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!comments.length && <p>暂无公开评论，来说两句吧</p>}
      <ul>
        {comments
          .filter((c) => !ids.has(c.parent_id || c.parentId))
          .map((c) => render(c))}
      </ul>
      <form onSubmit={submit}>
        {reply && (
          <p>
            回复 {reply.author}{' '}
            <button type="button" onClick={() => setReply(null)}>
              取消回复
            </button>
          </p>
        )}
        <label>
          昵称
          <input
            required
            maxLength={80}
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
          />
        </label>
        <label>
          邮箱（不公开）
          <input
            type="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          评论内容
          <textarea
            id="comment-content"
            required
            maxLength={5000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        <button disabled={busy}>{busy ? '提交中…' : '发表评论'}</button>
      </form>
    </section>
  )
}
