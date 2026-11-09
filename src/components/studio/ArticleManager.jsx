import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { studioApi } from '../../utils/studioApi'
/** 提供文章搜索、分页和删除管理。 */
export default function ArticleManager() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(/* 从地址参数初始化合法的文章状态筛选。 */ () =>
      ['draft', 'published'].includes(params.get('status'))
        ? params.get('status')
        : ''
    ),
    [result, setResult] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(/* 按搜索条件和页码加载文章并中止过时请求。 */ () => {
    const controller = new AbortController()
    setError('')
    setResult(null)
    studioApi(
      `/api/studio/articles?page=${page}&per_page=20&status=${status}&search=${encodeURIComponent(search)}`,
      { signal: controller.signal }
    )
      .then(setResult)
      .catch(/* 处理请求失败并保留当前页面内容。 */ (e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return /* 中止卸载页面尚未完成的请求。 */ () => controller.abort()
  }, [page, status, search, retry])
  const remove = /* 确认后按版本删除文章并刷新列表。 */ async (article) => {
    if (!confirm(`确认删除《${article.title}》及其评论？此操作不可撤销。`))
      return
    try {
      await studioApi(`/api/studio/articles/${article.id}`, {
        method: 'DELETE',
        revision: article.revision
      })
      setRetry(/* 递增刷新计数以重新加载文章。 */ (n) => n + 1)
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <section>
      <h1>文章管理</h1>
      <Link to="/studio/editor/new">写文章</Link>
      <form
        role="search"
        onSubmit={/* 提交标题搜索并回到第一页。 */ (e) => {
          e.preventDefault()
          setSearch(query.trim())
          setPage(1)
        }}
      >
        <label>
          搜索文章
          <input
            type="search"
            value={query}
            onChange={/* 更新搜索输入。 */ (e) => setQuery(e.target.value)}
            placeholder="按文章标题搜索"
          />
        </label>
        <button>搜索</button>
        {search && (
          <button
            type="button"
            onClick={/* 清除搜索条件并回到第一页。 */ () => {
              setQuery('')
              setSearch('')
              setPage(1)
            }}
          >
            清除搜索
          </button>
        )}
      </form>
      <label>
        状态
        <select
          value={status}
          onChange={/* 更新文章状态筛选并回到第一页。 */ (e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">全部</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
        </select>
      </label>
      {error && (
        <p role="alert">
          {error}
          <button onClick={/* 递增刷新计数以重新加载文章。 */ () => setRetry(/* 递增刷新计数。 */ (n) => n + 1)}>刷新列表</button>
        </p>
      )}
      {!result && !error && <p role="status">正在加载…</p>}
      {result && (
        <>
          <ul>
            {result.data.map(/* 将当前条目映射为展示内容。 */ (a) => (
              <li key={a.id}>
                <Link to={`/studio/editor/${a.id}`}>
                  {a.title || '未命名文章'}
                </Link>{' '}
                · {a.status === 'published' ? '已发布' : '草稿'}
                {a.has_draft ? ' · 有工作副本' : ''} · 版本 {a.revision}
                <p>
                  {a.author || '未署名'} · 分类：{a.category || '未分类'} ·
                  标签：{(a.tags || []).join('、') || '无'} ·{' '}
                  {a.publish_date
                    ? '发布时间：' +
                      new Date(a.publish_date).toLocaleString('zh-CN')
                    : '尚未发布'}
                </p>
                <button onClick={/* 删除当前列表文章。 */ () => remove(a)}>删除</button>
              </li>
            ))}
          </ul>
          {!result.data.length && <p>暂无文章</p>}
          <button disabled={page <= 1} onClick={/* 切换到上一页。 */ () => setPage(/* 计算翻页后的页码。 */ (p) => p - 1)}>
            上一页
          </button>
          <span>
            第 {page} 页 · 共 {result.pagination?.total ?? result.data.length}{' '}
            篇
          </span>
          <button
            disabled={
              !(
                result.pagination?.has_next ??
                page <
                  (result.pagination?.total_pages ||
                    result.pagination?.totalPages ||
                    1)
              )
            }
            onClick={/* 切换到下一页。 */ () => setPage(/* 计算翻页后的页码。 */ (p) => p + 1)}
          >
            下一页
          </button>
        </>
      )}
    </section>
  )
}
