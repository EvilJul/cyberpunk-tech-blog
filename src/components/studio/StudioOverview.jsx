import React, { useEffect, useState, useId } from 'react'
import { Link } from 'react-router-dom'
import { FileText, MessageSquare, FolderOpen, Tags, Files, Send, NotebookPen, Eye } from 'lucide-react'
import { studioApi } from '../../utils/studioApi'
import './overview.css'

/** 概览四张主统计卡的取值字段、标签与口径说明；views 为全站累计浏览量。 */
const PRIMARY_STATS = [
  { key: 'articles', label: '文章总数', hint: '近14天创建', icon: Files, color: '#9bc6ff' },
  { key: 'published', label: '已发布', hint: '当前公开文章的发布日期分布', icon: Send, color: '#92d8ad' },
  { key: 'drafts', label: '草稿', hint: '当前草稿的创建日期分布', icon: NotebookPen, color: '#c7b3fb' },
  { key: 'views', label: '站点访问量', hint: '累计浏览 · 非独立访客数', icon: Eye, color: '#efc27d' },
]

/** 展示实际按日活动，纵轴从零起算；所有日期和计数可由辅助技术读取。 */
function ActivitySparkline({ rows, field, color, label }) {
  const id = useId().replace(/:/g, '')
  const max = Math.max(1, ...rows.map(/* 取得日计数的真实最大值。 */ row => row[field]))
  const points = rows.map(/* 将各日计数映射到固定图表坐标。 */ (row, index) => `${4 + index * 232 / Math.max(1, rows.length - 1)},${52 - row[field] / max * 42}`).join(' ')
  const total = rows.reduce(/* 合计窗口内活动，明确图表与累计主数值的区别。 */ (sum, row) => sum + row[field], 0)
  return <div className="studio-activity-chart">
    <svg viewBox="0 0 240 60" role="img" aria-label={`${label}，最近14天合计 ${total} 篇`} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d="M4 52H236" stroke="currentColor" strokeDasharray="3 4" opacity=".18" />
      {rows.length > 0 && <><polygon points={`4,56 ${points} 236,56`} fill={`url(#${id})`} /><polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></>}
    </svg>
    <span className="studio-chart-note">{total ? `近14天 ${total} 篇` : '近14天无新增'}</span>
    <details className="studio-chart-data"><summary>查看每日数据</summary><table><caption>{label}（北京时间）</caption><thead><tr><th>日期</th><th>篇数</th></tr></thead><tbody>{rows.map(/* 为每个实际日期提供可读的计数。 */ row => <tr key={row.date}><td>{row.date}</td><td>{row[field]}</td></tr>)}</tbody></table></details>
  </div>
}

/** 展示累计指标与真实文章活动，访问量没有按日数据时明确保留缺失状态。 */
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
    <section className="studio-overview" aria-label="工作台概览">
      <h1 className="sr-only">工作台概览</h1>
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
            {PRIMARY_STATS.map(/* 图标与曲线颜色对应；总数与日期分布分别标注。 */ (item) => {
              const Icon = item.icon
              return <div className="studio-stat-card" key={item.key} style={{ '--metric-color': item.color }}>
                <div className="studio-metric-heading"><p className="studio-stat-label">{item.label}</p><Icon size={17} aria-hidden="true" /></div>
                <p className="studio-stat-value">{data[item.key] ?? 0}<span>{item.key === 'views' ? '次' : '篇'}</span></p>
                <p className="studio-stat-hint">{item.hint}</p>
                {item.key === 'views' ? <div className="studio-metric-missing"><Eye size={20} aria-hidden="true" /><span>尚无按日访问记录</span><small>当前仅统计累计访问量</small></div>
                  : Array.isArray(data.activity) && data.activity.length ? <ActivitySparkline rows={data.activity} field={item.key} color={item.color} label={item.label} />
                  : <p className="studio-metric-missing">趋势数据暂不可用</p>}
              </div>
            })}
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
