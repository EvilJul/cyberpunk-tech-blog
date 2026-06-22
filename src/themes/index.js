// 主题配置定义
export const themes = {
  cyberpunk: {
    id: 'cyberpunk',
    name: '暗金赛博朋克',
    description: '深邃太空黑 + Indigo/Violet 霓虹',
    background: {
      image: '',
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
      overlay: 0.7
    },
    colors: {
      // 背景色系
      background: '#0a0a0f',
      surface: '#141837',
      surfaceLight: '#202648',
      border: '#2a2a3a',

      // 主色调
      primary: '#6366f1',
      primaryLight: '#818cf8',
      primaryDark: '#4f46e5',

      // 辅助色
      secondary: '#8b5cf6',
      secondaryLight: '#a78bfa',

      // 强调色
      accent: '#C4612F',
      accentLight: '#A94E22',
      accentGlow: 'rgba(99, 102, 241, 0.15)',

      // 文字色
      textPrimary: '#ffffff',
      textSecondary: '#a0aec0',
      textMuted: '#5C635D',

      // 状态色
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6'
    },
    fonts: {
      heading: 'Fraunces, "DM Serif Display", serif',
      body: 'Inter, "Noto Sans SC", system-ui, sans-serif',
      code: '"Fira Code", "JetBrains Mono", monospace'
    },
    effects: {
      // WebGL 背景特效
      pixelSnow: true,
      sideRays: true,
      splashCursor: true,
      gridOverlay: true,

      // 动画
      enableAnimations: true,

      // 玻璃态效果
      glassEffect: true
    },
    spacing: {
      unit: 8, // 基础间距单位 (px)
    },
    borderRadius: {
      sm: '0.25rem',
      md: '0.5rem',
      lg: '1rem',
      xl: '1.5rem',
      full: '9999px'
    }
  },

  minimal: {
    id: 'minimal',
    name: '极简白',
    description: '纯净简约的浅色主题',
    background: {
      image: '',
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
      overlay: 0.9
    },
    colors: {
      background: '#ffffff',
      surface: '#f8f9fa',
      surfaceLight: '#e9ecef',
      border: '#dee2e6',

      primary: '#000000',
      primaryLight: '#333333',
      primaryDark: '#000000',

      secondary: '#6c757d',
      secondaryLight: '#868e96',

      accent: '#0066cc',
      accentLight: '#3399ff',
      accentGlow: 'rgba(0, 102, 204, 0.1)',

      textPrimary: '#212529',
      textSecondary: '#495057',
      textMuted: '#6c757d',

      success: '#28a745',
      warning: '#ffc107',
      error: '#dc3545',
      info: '#17a2b8'
    },
    fonts: {
      heading: '"Inter", sans-serif',
      body: '"Inter", "Noto Sans SC", sans-serif',
      code: '"Fira Code", monospace'
    },
    effects: {
      pixelSnow: false,
      sideRays: false,
      splashCursor: false,
      gridOverlay: false,
      enableAnimations: true,
      glassEffect: false
    },
    spacing: {
      unit: 8,
    },
    borderRadius: {
      sm: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px'
    }
  },

  dark: {
    id: 'dark',
    name: '暗色',
    description: '经典深色主题',
    background: {
      image: '',
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
      overlay: 0.8
    },
    colors: {
      background: '#1a1a1a',
      surface: '#2d2d2d',
      surfaceLight: '#3d3d3d',
      border: '#404040',

      primary: '#60a5fa',
      primaryLight: '#93c5fd',
      primaryDark: '#3b82f6',

      secondary: '#a78bfa',
      secondaryLight: '#c4b5fd',

      accent: '#f59e0b',
      accentLight: '#fbbf24',
      accentGlow: 'rgba(96, 165, 250, 0.15)',

      textPrimary: '#f5f5f5',
      textSecondary: '#d4d4d4',
      textMuted: '#a3a3a3',

      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa'
    },
    fonts: {
      heading: '"Inter", sans-serif',
      body: '"Inter", "Noto Sans SC", sans-serif',
      code: '"Fira Code", monospace'
    },
    effects: {
      pixelSnow: false,
      sideRays: false,
      splashCursor: true,
      gridOverlay: false,
      enableAnimations: true,
      glassEffect: true
    },
    spacing: {
      unit: 8,
    },
    borderRadius: {
      sm: '0.25rem',
      md: '0.5rem',
      lg: '0.75rem',
      xl: '1rem',
      full: '9999px'
    }
  }
}

// 默认主题
export const DEFAULT_THEME = 'cyberpunk'

// 获取主题
export function getTheme(themeId) {
  return themes[themeId] || themes[DEFAULT_THEME]
}

// 获取所有主题
export function getAllThemes() {
  return Object.values(themes)
}
