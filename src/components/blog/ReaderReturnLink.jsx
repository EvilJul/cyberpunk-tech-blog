import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { safeListUrl, searchSources } from '../../utils/readerNavigation'

/** 以醒目箭头入口返回安全列表来源，保留搜索历史及阅读位置。 */
export default function ReaderReturnLink() {
  const location = useLocation()
  const navigate = useNavigate()
  const source = location.state?.readerReturn
  const fromSearch = Boolean(source?.sourceId)
  const url = safeListUrl(source?.url)
  return <Link className="reader-return-link" to={url} state={{ readerRestoreY: Math.max(0, Number(source?.scrollY) || 0) }} onClick={/* 只有本会话建立的搜索历史允许后退，其他来源使用安全站内兜底。 */ (event) => {
    if (!fromSearch || !searchSources.has(source.sourceId) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(-1)
  }}><ArrowLeft size={19} aria-hidden="true" /><span>{fromSearch ? '返回搜索结果' : '返回文章列表'}</span></Link>
}
