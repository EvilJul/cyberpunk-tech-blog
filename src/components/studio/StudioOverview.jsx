import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, MessageSquare, FolderOpen, Tags } from 'lucide-react'
import { studioApi } from '../../utils/studioApi'
import StudioPageHeader from './StudioPageHeader'

/** 概览四张主统计卡的取值字段、标签与口径说明；views 为全站累计浏览量。 */
const PRIMARY_STATS = [
  { key: 'articles', label: '文章总数', hint: '含草稿与已发布' },
  { key: 'published', label: '已发布', hint: '公开可见' },
  { key: 'drafts', label: '草稿', hint: '仅保存工作副本' },
  { key: 'views', label: '站点访问量', hint: '累计浏览' },
]

/** 展示工作概览：内容规模统计、内容组织入口与开始创作操作。 */
export default function StudioOverview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(/* 加载概览统计并在卸载时中止请求。 */ () => {
    const controller = new AbortController()
    setError('')
    setData(null)
    studioApi('/api/studio/overview', { signal: controller.signal })
      .then(setData)
      .catch(/* 处理请求失败并保留当前页面内容。 */ (e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return /* 中止卸载页面尚未完成的请求。 */ () => controller.abort()
  }, [retry])

  /** 递增重试计数以重新加载概览。 */
  const reload = () => setRetry((value) => value + 1)

  return (
    <section>
      <StudioPageHeader
        title="工作概览"
        description="文章、草稿与站点内容一目了然。"
      />

      {error && (
        <p role="alert">
          概览加载失败：{error}{' '}
          <button className="studio-button" onClick={reload}>
            重试
          </button>
        </p>
      )}

      {!data && !error && (
        <div className="studio-stats" aria-busy="true">
          {PRIMARY_STATS.map(/* 加载期间渲染统计骨架占位。 */ (item) => (
            <div className="studio-stat-card" key={item.key}>
              <p className="studio-stat-label">{item.label}</p>
              <p className="studio-stat-value studio-stat-value--skeleton" aria-hidden="true">
                —
              </p>
            </div>
          ))}
          <p role="status" className="sr-only">
            正在加载概览…
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="studio-stats">
            {PRIMARY_STATS.map(/* 渲染单张等权重统计卡。 */ (item) => (
              <div className="studio-stat-card" key={item.key}>
                <p className="studio-stat-label">{item.label}</p>
                <p className="studio-stat-value">{data[item.key] ?? 0}</p>
                <p className="studio-stat-hint">{item.hint}</p>
              </div>
            ))}
          </div>

          <div className="studio-card-row">
            <div className="studio-card">
              <h2>内容组织</h2>
              <p className="studio-muted-text">
                分类与标签帮助读者找到相关内容，数量为全站累计。
              </p>
              <div className="studio-card-links">
                <Link to="/studio/categories">
                  <FolderOpen aria-hidden="true" />
                  分类 {data.categories ?? 0}
                </Link>
                <Link to="/studio/tags">
                  <Tags aria-hidden="true" />
                  标签 {data.tags ?? 0}
                </Link>
              </div>
            </div>
            <div className="studio-card">
              <h2>开始创作</h2>
              <p className="studio-muted-text">保存只更新工作副本，发布才改变公开内容。</p>
              <div className="studio-card-links">
                <Link to="/studio/articles?status=draft">
                  <FileText aria-hidden="true" />
                  查看草稿
                </Link>
                <Link to="/studio/comments">
                  <MessageSquare aria-hidden="true" />
                  审核评论
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
