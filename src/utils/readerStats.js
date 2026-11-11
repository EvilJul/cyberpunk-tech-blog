import { useEffect, useRef } from 'react'
import { apiFetch } from './api'

export const STATS_CHANGED = 'reader-stats-changed'

/** 告知同页展示组件重新读取统计，不在浏览器中累加服务端计数。 */
export function notifyStatsChanged() {
  window.dispatchEvent(new Event(STATS_CHANGED))
}

/** 每次进入读者路径记录一次页面访问；搜索参数、弹层与重渲染不重复计数，工作台不挂载此钩子。 */
export function useReaderVisit(pathname) {
  const recorded = useRef(null)
  useEffect(/* 按路径变化写入访问量，兼容 StrictMode 的重复执行。 */ () => {
    if (recorded.current === pathname) return
    recorded.current = pathname
    apiFetch('/api/stats/views', { method: 'POST' })
      .then(/* 消费响应体后再通知刷新，让记录请求完整结束。 */ async response => {
        if (!response.ok) return
        await response.json()
        notifyStatsChanged()
      })
      .catch(/* 统计写入失败不阻断阅读，也不在前端伪造新增计数。 */ () => {})
  }, [pathname])
}
