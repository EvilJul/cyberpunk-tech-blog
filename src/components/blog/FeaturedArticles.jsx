import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Pin } from 'lucide-react'
import { apiFetch } from '../../utils/api'
import { articleDate, plainExcerpt } from '../../utils/articlePresentation'
import ArticleCover from './ArticleCover'
import './featured-articles.css'

/** 洗牌一次后顺序展示，让每篇置顶文章都有出现机会。 */
function shuffleArticles(rows) {
  const next = [...rows]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** 首页精选轮播，后台、悬停、键盘焦点及减少动态效果时停止自动切换。 */
export default function FeaturedArticles() {
  const [articles, setArticles] = useState([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [reduced, setReduced] = useState(/* 进入页面时尊重系统动态效果偏好。 */ () => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const location = useLocation()
  const multiple = articles.length > 1
  const playing = multiple && !paused && !hovered && !focused && !hidden && !reduced

  useEffect(/* 获取独立的公开推荐，失败时不影响普通文章列表。 */ () => {
    const controller = new AbortController()
    /** 仅接受有效数组，并忽略已取消的推荐响应。 */
    async function loadFeatured() {
      try {
        const response = await apiFetch('/api/articles/featured/list', { signal: controller.signal })
        if (!response.ok) throw Error('推荐暂不可用')
        const result = await response.json()
        if (!controller.signal.aborted && Array.isArray(result.data)) {
          setArticles(shuffleArticles(result.data.filter(/* 丢弃异常条目，避免推荐响应损坏影响首页。 */ item => item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && typeof item.slug === 'string')))
          setIndex(0)
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('首页推荐暂不可用', error.message)
      }
    }
    loadFeatured()
    return /* 离开首页时停止未完成的请求。 */ () => controller.abort()
  }, [])

  useEffect(/* 页面隐藏或系统切换动态偏好后及时暂停。 */ () => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    /** 同步页面可见状态。 */
    const visibility = () => setHidden(document.hidden)
    /** 同步减少动态效果偏好。 */
    const preference = () => setReduced(media.matches)
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', preference)
    return /* 卸载后解除页面与系统监听。 */ () => {
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', preference)
    }
  }, [])

  useEffect(/* 自动轮换在每次切换后重新计时，避免手动切换后立即跳页。 */ () => {
    if (!playing) return
    const timer = setTimeout(/* 顺序展示下一篇置顶文章。 */ () => setIndex((/* 保留最新索引以避免旧闭包。 */ current) => (current + 1) % articles.length), 6000)
    return /* 暂停或切换时清除旧计时器。 */ () => clearTimeout(timer)
  }, [playing, index, articles.length])

  /** 手动切换并固定暂停，给用户充分的阅读时间。 */
  function move(delta) {
    setPaused(true)
    setIndex(/* 循环到相邻的推荐条目。 */ current => (current + delta + articles.length) % articles.length)
  }

  if (!articles.length) return null
  const article = articles[index]
  const url = `/article/${encodeURIComponent(article.slug || article.id)}`
  return (
    <section className="featured-articles" aria-label="置顶推荐" aria-roledescription="轮播" onMouseEnter={/* 鼠标阅读时暂缓播放。 */ () => setHovered(true)} onMouseLeave={/* 鼠标离开后恢复原播放意图。 */ () => setHovered(false)} onFocusCapture={/* 键盘操作期间不切换内容。 */ () => setFocused(true)} onBlurCapture={/* 焦点离开整个区域后恢复原播放意图。 */ event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <h2 className="sr-only">置顶推荐</h2>
      <div className="featured-overlay">
        {multiple && <div className="featured-controls">
          <button type="button" aria-label="上一篇推荐" onClick={/* 手动查看上一篇。 */ () => move(-1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label={paused || reduced ? '播放推荐' : '暂停推荐'} aria-pressed={paused || reduced} onClick={/* 明确控制持续暂停；系统减少动态效果时保持静态。 */ () => setPaused(!paused)} disabled={reduced} title={reduced ? '已遵循系统减少动态效果设置' : undefined}>{paused || reduced ? <Play size={14} /> : <Pause size={14} />}</button>
          <button type="button" aria-label="下一篇推荐" onClick={/* 手动查看下一篇。 */ () => move(1)}><ChevronRight size={16} /></button>
        </div>}
      </div>
      <div className="featured-slide" aria-live={paused || focused || reduced ? 'polite' : 'off'} aria-atomic="true">
        <AnimatePresence initial={false} mode="wait">
        <motion.div key={article.id} className="featured-panel" initial={{ opacity: 0, x: reduced ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -24 }} transition={{ duration: reduced ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <Link className="featured-card" to={url} state={{ readerReturn: { url: location.pathname + location.search, scrollY: window.scrollY } }}>
          <ArticleCover src={article.cover_image} placeholder eager />
          <div className="featured-copy">
            <div className="featured-meta"><span className="featured-label"><Pin size={11} />精选推荐</span><span>{article.category || '精选文章'}</span><time dateTime={article.publish_date}>{articleDate(article.publish_date)}</time></div>
            <h3>{article.title}</h3>
            <p>{plainExcerpt(article.excerpt) || '打开文章，阅读完整内容。'}</p>
            <span className="featured-read">阅读全文 <ArrowUpRight size={15} /></span>
          </div>
        </Link>
        </motion.div>
        </AnimatePresence>
      </div>
      {multiple && <div className="featured-dots" aria-label="选择推荐文章">
        {articles.map(/* 每篇提供可聚焦的直接入口，当前项通过形状与属性共同标识。 */ (item, i) => <button key={item.id} type="button" aria-label={`查看推荐：${item.title}`} aria-current={index === i ? 'true' : undefined} onClick={/* 手动选择并暂停自动轮播。 */ () => { setPaused(true); setIndex(i) }}><span /></button>)}
      </div>}
    </section>
  )
}
