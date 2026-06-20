import { createContext, useContext, useState, useEffect } from 'react'
import { getTheme, DEFAULT_THEME } from './index'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    // 从 localStorage 读取用户选择的主题
    const saved = localStorage.getItem('theme')
    return saved || DEFAULT_THEME
  })

  const theme = getTheme(currentTheme)

  useEffect(() => {
    // 应用 CSS 变量到 document
    applyTheme(theme)

    // 保存到 localStorage
    localStorage.setItem('theme', currentTheme)

    // 设置 data-theme 属性（方便 CSS 选择器）
    document.documentElement.setAttribute('data-theme', currentTheme)
  }, [currentTheme, theme])

  const switchTheme = (themeId) => {
    setCurrentTheme(themeId)
  }

  return (
    <ThemeContext.Provider value={{ theme, currentTheme, switchTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// 应用主题到 CSS 变量
function applyTheme(theme) {
  const root = document.documentElement

  // 应用颜色
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--theme-${camelToKebab(key)}`, value)
  })

  // 应用字体
  Object.entries(theme.fonts).forEach(([key, value]) => {
    root.style.setProperty(`--font-${key}`, value)
  })

  // 应用圆角
  Object.entries(theme.borderRadius).forEach(([key, value]) => {
    root.style.setProperty(`--radius-${key}`, value)
  })

  // 应用间距单位
  root.style.setProperty('--spacing-unit', `${theme.spacing.unit}px`)
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
