import { Link, useLocation, useNavigate } from 'react-router-dom'
import { safeListUrl, searchSources } from '../../utils/readerNavigation'

/** 使用经过验证的列表来源；同会话文章搜索返回原历史项及搜索面板。 */
export default function ReaderReturnLink() {
  const location = useLocation()
  const navigate = useNavigate()
  const source = location.state?.readerReturn
  const fromSearch = Boolean(source?.sourceId)
  const url = safeListUrl(source?.url)
  return <Link to={url} state={{ readerRestoreY: Math.max(0, Number(source?.scrollY) || 0) }} onClick={/* 只有本会话建立的搜索历史允许后退，其他来源使用安全站内兜底。 */ (event) => {
    if (!fromSearch || !searchSources.has(source.sourceId) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(-1)
  }}>{fromSearch ? '返回搜索结果' : '返回文章列表'}</Link>
}
