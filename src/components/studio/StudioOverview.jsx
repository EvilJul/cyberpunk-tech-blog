import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { studioApi } from '../../utils/studioApi'

/** 加载工作区概览并提供失败重试。 */
export default function StudioOverview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(/* 加载概览统计并在卸载时中止请求。 */ () => {
    const controller = new AbortController()
    setError('')
    studioApi('/api/studio/overview', { signal: controller.signal })
      .then(setData)
      .catch(/* 处理请求失败并保留当前页面内容。 */ (error) => {
        if (error.name !== 'AbortError') setError(error.message)
      })
    return /* 中止卸载页面尚未完成的请求。 */ () => controller.abort()
  }, [retry])
  return (
    <section>
      <h1>作者工作台</h1>
      <p>继续创作、管理内容，或调整你的站点。</p>
      <p>
        <Link to="/studio/editor/new">写文章</Link> ·{' '}
        <Link to="/studio/articles?status=draft">查看草稿</Link> ·{' '}
        <Link to="/studio/comments">审核评论</Link>
      </p>
      {error && (
        <p role="alert">
          {error}{' '}
          <button onClick={/* 递增重试计数以重新加载概览。 */ () => setRetry(/* 递增刷新计数。 */ (value) => value + 1)}>重试</button>
        </p>
      )}
      {!data && !error && <p role="status">正在加载概览…</p>}
      {data && (
        <dl>
          {[
            ['articles', '文章总数'],
            ['published', '已发布'],
            ['drafts', '草稿'],
            ['categories', '分类'],
            ['tags', '标签'],
            ['views', '站点访问量']
          ].map(/* 将当前条目映射为展示内容。 */ ([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{data[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
