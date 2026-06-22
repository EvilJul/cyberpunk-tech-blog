import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getTheme, DEFAULT_THEME } from './index'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getTheme(DEFAULT_THEME))
  const [loading, setLoading] = useState(true)

  const fetchTheme = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings?.theme) {
        setTheme({
          id: data.settings.theme.preset || DEFAULT_THEME,
          name: data.settings.theme.name,
          background: data.settings.theme.background,
          colors: data.settings.theme.colors,
          fonts: data.settings.theme.fonts,
          effects: data.settings.theme.effects,
          borderRadius: data.settings.theme.borderRadius
        })
      }
    } catch (err) {
      console.error('获取主题失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTheme()
    const interval = setInterval(fetchTheme, 30000)
    return () => clearInterval(interval)
  }, [fetchTheme])

  useEffect(() => {
    applyTheme(theme)
    document.documentElement.setAttribute('data-theme', theme.id)
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
  const root = document.documentElement

  // 应用背景图片
  if (theme.background) {
    const bg = theme.background
    if (bg.image) {
      root.style.setProperty('--bg-image', `url(${bg.image})`)
      root.style.setProperty('--bg-size', bg.size || 'cover')
      root.style.setProperty('--bg-position', bg.position || 'center')
      root.style.setProperty('--bg-repeat', bg.repeat || 'no-repeat')
      root.style.setProperty('--bg-overlay', bg.overlay || 0.7)
    } else {
      root.style.setProperty('--bg-image', 'none')
    }
  }

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
