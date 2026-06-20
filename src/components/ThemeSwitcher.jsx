import { useState } from 'react'
import { useTheme } from '../themes/ThemeProvider'
import { getAllThemes } from '../themes'
import { Sun, Moon, Palette } from 'lucide-react'

export default function ThemeSwitcher({ className = '' }) {
  const { theme, currentTheme, switchTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const allThemes = getAllThemes()

  const handleThemeChange = (themeId) => {
    switchTheme(themeId)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface/50 backdrop-blur-sm border border-border hover:border-primary transition-colors"
        aria-label="切换主题"
      >
        <Palette size={18} />
        <span className="hidden sm:inline text-sm">{theme.name}</span>
      </button>

      {/* 主题选择面板 */}
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 主题列表 */}
          <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-semibold">选择主题</h3>
            </div>

            <div className="p-2 space-y-1">
              {allThemes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg hover:bg-surface-light transition-colors text-left ${
                    currentTheme === t.id ? 'bg-primary/10 border border-primary' : ''
                  }`}
                >
                  {/* 主题图标 */}
                  <div
                    className="w-10 h-10 rounded-lg border-2 flex-shrink-0"
                    style={{
                      backgroundColor: t.colors.background,
                      borderColor: t.colors.primary
                    }}
                  >
                    <div
                      className="w-full h-full rounded-md"
                      style={{
                        background: `linear-gradient(135deg, ${t.colors.primary} 0%, ${t.colors.secondary} 100%)`
                      }}
                    />
                  </div>

                  {/* 主题信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.name}</span>
                      {currentTheme === t.id && (
                        <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                          当前
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary mt-0.5 line-clamp-2">
                      {t.description}
                    </p>

                    {/* 特效标签 */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.effects.pixelSnow && (
                        <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                          粒子雪花
                        </span>
                      )}
                      {t.effects.glassEffect && (
                        <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                          玻璃态
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
