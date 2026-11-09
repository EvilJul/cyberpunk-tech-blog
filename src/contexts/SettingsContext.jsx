import { apiFetch } from '../utils/api'
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react'

const SettingsContext = createContext(null)

const defaultSettings = {
  title: 'TechBlog',
  description: '探索技术世界，分享编程经验',
  grid: true,
  footer: true,
  excerpt: 100,
  perpage: 10,
  color: 'gold',
  sidebar: 'right',
  showSidebar: true,
  author: 'Tech Blogger',
  bio: '探索技术世界，分享编程经验',
  github: '',
  email: ''
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)

  const request = useRef(null)
  const fetchSettings = useCallback(async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    try {
      const res = await apiFetch('/api/settings', {
        signal: controller.signal,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
        }
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      if (data.settings) {
        setSettings((prev) => ({ ...prev, ...data.settings }))
      }
    } catch (err) {
      if (err.name !== 'AbortError' && import.meta.env.DEV)
        console.warn('获取设置失败:', err)
    } finally {
      request.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()

    // 定期刷新设置
    const interval = setInterval(fetchSettings, 30000)

    // 页面可见性变化时刷新设置
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSettings()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      request.current?.abort()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchSettings])

  return (
    <SettingsContext.Provider
      value={{ settings, loading, refreshSettings: fetchSettings }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
