import { createContext, useContext, useState, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { getTheme, DEFAULT_THEME } from './index'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const { settings, loading, refreshSettings } = useSettings()
  const [override, setTheme] = useState(null)
  const preset = getTheme(settings.theme?.preset || DEFAULT_THEME)
  const theme = override || {
    ...preset,
    ...settings.theme,
    id: settings.theme?.preset || preset.id,
    colors: { ...preset.colors, ...settings.theme?.colors },
    effects: { ...preset.effects, ...settings.theme?.effects }
  }
  const themeKey = JSON.stringify(theme)
  useEffect(() => {
    applyTheme(theme)
    document.documentElement.setAttribute('data-theme', theme.id)
  }, [themeKey])

  const switchTheme = (themeId) => {
    setTheme(getTheme(themeId))
  }

  const updateTheme = (newTheme) => {
    setTheme(newTheme)
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        loading,
        switchTheme,
        updateTheme,
        refreshTheme: refreshSettings
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

// 应用主题到 CSS 变量
function applyTheme(theme) {
  const root = document.documentElement

  // 应用背景图片
  if (
    theme.background &&
    theme.background.image &&
    theme.background.image.trim()
  ) {
    const bg = theme.background
    const imageUrl = bg.image.trim()
    root.style.setProperty('--bg-image', `url(${imageUrl})`)
    root.style.setProperty('--bg-size', bg.size || 'cover')
    root.style.setProperty('--bg-position', bg.position || 'center')
    root.style.setProperty('--bg-repeat', bg.repeat || 'no-repeat')
    root.style.setProperty(
      '--bg-overlay',
      bg.overlay !== undefined ? bg.overlay : 0.7
    )
  } else root.style.setProperty('--bg-image', 'none')

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
    document.documentElement.setAttribute(
      'data-pixel-snow',
      theme.effects.pixelSnow
    )
    document.documentElement.setAttribute(
      'data-side-rays',
      theme.effects.sideRays
    )
    document.documentElement.setAttribute(
      'data-splash-cursor',
      theme.effects.splashCursor
    )
    document.documentElement.setAttribute(
      'data-grid-overlay',
      theme.effects.gridOverlay
    )
    document.documentElement.setAttribute(
      'data-glass-effect',
      theme.effects.glassEffect
    )
    document.documentElement.setAttribute(
      'data-animations',
      theme.effects.animations
    )
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
