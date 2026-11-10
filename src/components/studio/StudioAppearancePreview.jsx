import React from 'react'

/** 组合待保存背景、字体和圆角的静态样张，不加载特效或改变全站 CSS。 */
export default function StudioAppearancePreview({ theme, resolveUrl }) {
  const background = theme.background || {}
  const colors = theme.colors || {}
  const fonts = theme.fonts || {}
  const radius = theme.borderRadius || {}
  return (
    <div className="studio-appearance-sample" aria-label="外观搭配预览" style={{
      backgroundColor: colors.background || '#101318',
      backgroundImage: background.image ? `url(${JSON.stringify(resolveUrl(background.image))})` : undefined,
      backgroundSize: background.size || 'cover', backgroundPosition: background.position || 'center', backgroundRepeat: background.repeat || 'no-repeat'
    }}>
      <div className="studio-appearance-sample-overlay" style={{ background: `rgba(0, 0, 0, ${Math.max(0, Math.min(1, Number(background.overlay) || 0))})` }} />
      <article style={{ backgroundColor: colors.surface || '#1b2029', color: colors.textPrimary || '#edf2f7', borderColor: colors.border || '#333e4e', borderRadius: radius.lg || '12px', fontFamily: fonts.body }}>
        <span>文章样张 · 仅预览</span>
        <h3 style={{ fontFamily: fonts.heading }}>文字、背景与形状，一起看效果</h3>
        <p style={{ color: colors.textSecondary }}>这是正文示例。你可以直接比较字体与背景是否清晰、圆角是否合适。</p>
        <code style={{ fontFamily: fonts.code }}>const hello = '你好，世界'</code>
      </article>
    </div>
  )
}
