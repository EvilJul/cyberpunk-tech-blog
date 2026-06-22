import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getTheme, DEFAULT_THEME } from './index'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchTheme = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      if (data.settings?.theme) {
        const newTheme = {
          id: data.settings.theme.preset || DEFAULT_THEME,
          name: data.settings.theme.name,
          background: data.settings.theme.background,
          colors: data.settings.theme.colors,
          fonts: data.settings.theme.fonts,
          effects: data.settings.theme.effects,
          borderRadius: data.settings.theme.borderRadius
        }
        console.log('主题已更新:', newTheme)
        console.log('背景配置:', newTheme.background)
        setTheme(newTheme)
      }
    } catch (err) {
      console.error('获取主题失败:', err)
      // 出错时使用默认主题
      const fallbackTheme = getTheme(DEFAULT_THEME)
      setTheme(fallbackTheme)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTheme()

    // 定期刷新主题
    const interval = setInterval(fetchTheme, 30000)

    // 页面可见性变化时刷新主题（用户切回标签页时）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTheme()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchTheme])

  useEffect(() => {
    // 只在 theme 不为 null 时应用
    if (theme) {
      console.log('🎨 useEffect 触发，准备应用主题:', {
        id: theme.id,
        hasBackground: !!theme.background,
        backgroundImage: theme.background?.image || '(无)',
        timestamp: new Date().toLocaleTimeString()
      })
      applyTheme(theme)
      document.documentElement.setAttribute('data-theme', theme.id)
    } else {
      console.log('⏳ 主题为 null，跳过应用')
    }
  }, [theme])

  const switchTheme = (themeId) => {
    setTheme(getTheme(themeId))
  }

  const updateTheme = (newTheme) => {
    setTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, loading, switchTheme, updateTheme, refreshTheme: fetchTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// 应用主题到 CSS 变量
function applyTheme(theme) {
  console.log('🔧 applyTheme 被调用:', {
    themeId: theme.id,
    hasBackground: !!theme.background,
    backgroundImage: theme.background?.image || '(无)',
    backgroundImageType: typeof theme.background?.image
  })

  const root = document.documentElement

  // 应用背景图片
  if (theme.background && theme.background.image && theme.background.image.trim()) {
    const bg = theme.background
    const imageUrl = bg.image.trim()
    console.log('✅ 应用背景图片:', imageUrl, 'size:', bg.size, 'overlay:', bg.overlay)
    root.style.setProperty('--bg-image', `url(${imageUrl})`)
    root.style.setProperty('--bg-size', bg.size || 'cover')
    root.style.setProperty('--bg-position', bg.position || 'center')
    root.style.setProperty('--bg-repeat', bg.repeat || 'no-repeat')
    root.style.setProperty('--bg-overlay', bg.overlay !== undefined ? bg.overlay : 0.7)
  }
  // 不在此处清除背景图片，让其持久显示直到被新值覆盖

  // 应用颜色
  if (theme.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${camelToKebab(key)}`, value)
    })
  }

  // 应用字体
  if (theme.fonts) {
    Object.entries(theme.fonts).forEach(([key, value]) => {
      root.style.setProperty(`--font-${key}`, value)
    })
  }

  // 应用圆角
  if (theme.borderRadius) {
    Object.entries(theme.borderRadius).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value)
    })
  }

  // 应用效果开关到 data 属性
  if (theme.effects) {
    document.documentElement.setAttribute('data-pixel-snow', theme.effects.pixelSnow)
    document.documentElement.setAttribute('data-side-rays', theme.effects.sideRays)
    document.documentElement.setAttribute('data-splash-cursor', theme.effects.splashCursor)
    document.documentElement.setAttribute('data-grid-overlay', theme.effects.gridOverlay)
    document.documentElement.setAttribute('data-glass-effect', theme.effects.glassEffect)
    document.documentElement.setAttribute('data-animations', theme.effects.animations)
  }
}

// 驼峰转短横线
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// 自定义 Hook
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
