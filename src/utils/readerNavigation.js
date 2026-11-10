import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const positions = new Map()
export const searchSources = new Set()
/** 只允许读者站内列表地址，拒绝协议相对地址和外部返回目标。 */
export function safeListUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  try {
    const url = new URL(value, window.location.origin)
    const pathname = decodeURIComponent(url.pathname)
    if (url.origin !== window.location.origin || /[\\?#]/.test(pathname) || pathname.split('/').some(/* 编码或多层编码的目录跳转一律拒绝。 */ (segment) => segment === '.' || segment === '..' || /%|\\/.test(segment))) return '/'
    if (!/^\/(?:explore|(?:category|tag)\/[^/]+)?$/.test(pathname)) return '/'
    return url.pathname + url.search
  } catch {
    return '/'
  }
}
/** 将读者地址规范化，聚焦意图不属于结果缓存。 */
function positionKey(location) {
  const params = new URLSearchParams(location.search)
  params.delete('focus')
  params.sort()
  return location.pathname + (params.size ? `?${params}` : '')
}
/** 在有限内存中记录公开页滚动，返回时等待异步内容足够高再恢复。 */
export function ReaderScrollMemory() {
  const location = useLocation()
  const action = useNavigationType()
  const previousLocation = useRef(null)
  useEffect(/* 接管浏览器恢复，避免与异步内容恢复竞争。 */ () => {
    const previous = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return /* 离开读者布局时恢复浏览器默认行为。 */ () => { history.scrollRestoration = previous }
  }, [])
  useEffect(/* 路由切换后恢复已记录位置，新的详情页从顶部阅读。 */ () => {
    const key = positionKey(location)
    const samePage = previousLocation.current?.pathname === location.pathname
    const explicitRestore = Number.isFinite(location.state?.readerRestoreY) && (location.state.readerRestoreY !== previousLocation.current?.state?.readerRestoreY || location.state.readerRestoreRequest !== previousLocation.current?.state?.readerRestoreRequest)
    previousLocation.current = location
    const preserve = samePage && action === 'REPLACE' && !explicitRestore
    const target = preserve ? window.scrollY : Number(location.state?.readerSearch?.articleScrollY ?? location.state?.readerRestoreY ?? (action === 'POP' ? positions.get(key) : 0)) || 0
    let restoring = true
    let frame
    /** 尺寸满足目标或内容加载完成后恢复，不用固定延时猜测网络速度。 */
    const restore = () => {
      const reading = location.pathname.startsWith('/article/')
      const ready = document.querySelector(reading ? '[data-reading-ready="true"]' : '[data-list-ready="true"]')
      const listing = location.pathname === '/' || location.pathname === '/explore' || /^\/(category|tag)\//.test(location.pathname)
      if (target && (reading || listing) && !ready) return
      window.scrollTo(0, target)
      if (ready || target === 0) restoring = false
    }
    restore()
    const observer = new MutationObserver(/* 异步文章和列表挂载后再次尝试恢复。 */ () => {
      if (restoring) { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore) }
    })
    observer.observe(document.getElementById('main'), { childList: true, subtree: true, attributes: true, attributeFilter: ['data-list-ready', 'data-reading-ready'] })
    /** 滚动时写入当前位置，缓存仅保留二十个公开地址。 */
    const save = () => {
      if (restoring) return
      positions.delete(key)
      positions.set(key, window.scrollY)
      if (positions.size > 20) positions.delete(positions.keys().next().value)
    }
    window.addEventListener('scroll', save, { passive: true })
    return /* 路由离开前清理监听，防止旧异步内容改变新页面。 */ () => {
      observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', save)
    }
  }, [location.key])
  return null
}
