/** 将浏览器支持的主题颜色转为 RGBA，非法颜色回退到确定值。 */
function parseColor(value, fallback) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = fallback
  context.fillStyle = value || fallback
  context.fillRect(0, 0, 1, 1)
  return [...context.getImageData(0, 0, 1, 1).data]
}
/** 将透明主题色合成为不透明局部表面，避免文章背景穿透。 */
function composite(front, back) {
  const alpha = front[3] / 255
  return front.slice(0, 3).map(/* 按透明度合成每个颜色通道。 */ (value, index) => Math.round(value * alpha + back[index] * (1 - alpha)))
}
/** 计算 WCAG 相对亮度，用于主题文字对比度判断。 */
function luminance(rgb) {
  const linear = rgb.map(/* 将 sRGB 通道转换为线性亮度。 */ (value) => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 })
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}
/** 保留主题色气质，仅对手机表面的不可读文字和强调色作局部兜底。 */
export function readerPalette(theme) {
  const colors = theme?.colors || {}
  const background = composite(parseColor(colors.background, '#11151d'), [17, 21, 29])
  const surface = composite(parseColor(colors.surface, '#1b2230'), background)
  const light = [244, 246, 252]
  const dark = [20, 25, 34]
  /** 当前候选不达标时，选择对表面对比度更高的中性色。 */
  const readable = (value, minimum) => {
    const rgb = composite(parseColor(value, '#f4f6fc'), surface)
    /** 根据两个相对亮度计算对比度。 */
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
    return ratio(rgb, surface) >= minimum ? rgb : ratio(light, surface) > ratio(dark, surface) ? light : dark
  }
  /** 输出完全不透明的 RGB 变量，不影响数据库中的主题配置。 */
  const css = (rgb) => `rgb(${rgb.join(', ')})`
  return {
    '--reader-surface': css(surface), '--reader-text': css(readable(colors.textPrimary, 4.5)),
    '--reader-muted': css(readable(colors.textSecondary, 4.5)), '--reader-accent': css(readable(colors.primary, 4.5))
  }
}
