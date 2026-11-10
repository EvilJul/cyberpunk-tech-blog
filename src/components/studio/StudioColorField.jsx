import React, { useRef, useEffect } from 'react'

/** 将浏览器支持的 CSS 颜色转换成选色器需要的 RGB 与透明度，不改写原配置。 */
function colorParts(value) {
  if (!value || !CSS.supports('color', value)) return { hex: '#000000', alpha: 1 }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = value
  // 优先解析规范化颜色，避免半透明像素读回的预乘取整改变 RGB。
  const normalized = context.fillStyle
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return { hex: normalized, alpha: 1 }
  const rgba = normalized.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/)
  if (rgba) return {
    hex: '#' + rgba.slice(1, 4).map(/* 精确保留未乘透明度的 RGB 通道。 */ channel => Math.round(Number(channel)).toString(16).padStart(2, '0')).join(''),
    alpha: rgba[4] === undefined ? 1 : Number(rgba[4])
  }
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return { hex: '#' + [r, g, b].map(/* 将单个颜色通道补齐为两位十六进制。 */ channel => channel.toString(16).padStart(2, '0')).join(''), alpha: a / 255 }
}

/** 为颜色提供可视选色、透明度和精确输入，所有操作仅更新待保存值。 */
export default function StudioColorField({ label, value, onChange, disabled }) {
  const input = useRef(null)
  const parts = colorParts(value)
  useEffect(/* 无效手填颜色阻止表单保存，但保留输入供修改。 */ () => {
    input.current?.setCustomValidity(value && CSS.supports('color', value) ? '' : '请输入有效颜色，或点击色块选择。')
  }, [value])
  /** 合成新颜色，透明度为全不透明时保留简洁的十六进制格式。 */
  function update(hex, alpha) {
    if (alpha >= 1) onChange(hex)
    else onChange(`rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${Number(alpha.toFixed(2))})`)
  }
  return (
    <div className="studio-color-field">
      <div className="studio-color-inputs">
        <input className="studio-color-picker" type="color" value={parts.hex} disabled={disabled} aria-label={`${label}选色`} title={`点击选择${label}`} onChange={/* 可视选色保留原透明度。 */ event => update(event.target.value, parts.alpha)} />
        <label>{label}<input ref={input} value={value ?? ''} disabled={disabled} spellCheck={false} onChange={/* 精确输入保留原格式，不做失焦自动改写。 */ event => onChange(event.target.value)} /></label>
      </div>
      <label className="studio-color-opacity">透明度 <span aria-hidden="true">{Math.round(parts.alpha * 100)}%</span>
        <input type="range" min="0" max="100" step="1" value={Math.round(parts.alpha * 100)} disabled={disabled} aria-label={`${label}透明度`} onChange={/* 调整透明度时保留当前选中的 RGB。 */ event => update(parts.hex, Number(event.target.value) / 100)} />
      </label>
    </div>
  )
}

/** 用待保存的主题颜色演示读者卡片与按钮，样式只限此区域。 */
export function StudioThemePreview({ colors }) {
  /** 无效输入使用预览兜底色，避免影响后台可读性。 */
  function color(key, fallback) {
    return colors[key] && CSS.supports('color', colors[key]) ? colors[key] : fallback
  }
  return (
    <div className="studio-theme-preview-wrap">
      <p>点击色块选颜色；拖动滑块调透明度。下方仅为搭配预览，保存后才影响读者站。</p>
      <div className="studio-theme-preview" aria-label="主题颜色预览" style={{ backgroundColor: color('background', '#101318'), color: color('textPrimary', '#edf2f7') }}>
        <div style={{ backgroundColor: color('surface', '#1b2029'), borderColor: color('border', '#333e4e') }}>
          <strong>一篇文章的标题</strong>
          <p style={{ color: color('textSecondary', '#a5b2c3') }}>正文与辅助文字的实际搭配效果。</p>
          <span style={{ backgroundColor: color('primary', '#85bcff'), color: color('background', '#101318') }}>阅读文章</span>
          <small style={{ color: color('success', '#86d5af') }}>已发布</small>
        </div>
      </div>
    </div>
  )
}
