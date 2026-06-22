import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

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
  author: 'Tech Blogger',
  bio: '探索技术世界，分享编程经验',
  github: '',
  email: ''
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings) {
        const { theme, ...rest } = data.settings
        setSettings(prev => ({ ...prev, ...rest }))
      }
    } catch (err) {
      console.error('获取设置失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    const interval = setInterval(fetchSettings, 30000)
    return () => clearInterval(interval)
  }, [fetchSettings])

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings }}>
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
