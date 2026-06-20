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
        setSettings(prev => ({ ...prev, ...data.settings }))
      }
    } catch (err) {
      console.error('获取设置失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    const interval = setInterval(fetchSettings, 10000)
    return () => clearInterval(interval)
  }, [fetchSettings])

  const colorMap = {
    gold:    { primary: '#ffd700', light: '#ffed4a', dark: '#b8860b', glow: 'rgba(255, 215, 0, 0.15)' },
    purple:  { primary: '#8b5cf6', light: '#a78bfa', dark: '#6d28d9', glow: 'rgba(139, 92, 246, 0.15)' },
    cyan:    { primary: '#06b6d4', light: '#22d3ee', dark: '#0891b2', glow: 'rgba(6, 182, 212, 0.15)' },
    green:   { primary: '#10b981', light: '#34d399', dark: '#059669', glow: 'rgba(16, 185, 129, 0.15)' },
    rose:    { primary: '#f43f5e', light: '#fb7185', dark: '#e11d48', glow: 'rgba(244, 63, 94, 0.15)' }
  }

  const colors = colorMap[settings.color] || colorMap.gold

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-gold', colors.primary)
    root.style.setProperty('--color-gold-light', colors.light)
    root.style.setProperty('--color-gold-dark', colors.dark)
    root.style.setProperty('--color-gold-glow', colors.glow)

    let styleEl = document.getElementById('dynamic-theme-style')
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'dynamic-theme-style'
      document.head.appendChild(styleEl)
    }

    const p = colors.primary
    const r = parseInt(p.slice(1, 3), 16)
    const g = parseInt(p.slice(3, 5), 16)
    const b = parseInt(p.slice(5, 7), 16)

    styleEl.textContent = `
      .glass-card-hover:hover {
        border-color: rgba(${r}, ${g}, ${b}, 0.3) !important;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(${r}, ${g}, ${b}, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
      }
      .glass-card-hover:hover::before {
        background: linear-gradient(90deg, transparent, rgba(${r}, ${g}, ${b}, 0.3), transparent) !important;
      }
      .gradient-border::before {
        background: linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.4), rgba(139, 92, 246, 0.2), rgba(${r}, ${g}, ${b}, 0.1)) !important;
      }
      .glow-border::after {
        background: linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.4), transparent, rgba(${r}, ${g}, ${b}, 0.2)) !important;
      }
      ::selection {
        background: rgba(${r}, ${g}, ${b}, 0.3) !important;
      }
      ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, ${colors.dark}, #334155) !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, ${colors.primary}, ${colors.dark}) !important;
      }
      .gradient-text {
        background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.light} 50%, ${colors.primary} 100%) !important;
        background-size: 200% auto !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
      }
    `
  }, [colors])

  return (
    <SettingsContext.Provider value={{ settings, loading, colors, refreshSettings: fetchSettings }}>
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
