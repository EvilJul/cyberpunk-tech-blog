import React from 'react'
import './appearance-controls.css'

const backgroundOptions = {
  size: [['cover', '铺满区域'], ['contain', '完整显示'], ['auto', '原始尺寸'], ['100%', '按宽度适配'], ['100% 100%', '拉伸铺满']],
  position: [['center', '居中'], ['top center', '顶部居中'], ['bottom center', '底部居中'], ['left center', '左侧居中'], ['right center', '右侧居中'], ['top left', '左上角'], ['top right', '右上角'], ['bottom left', '左下角'], ['bottom right', '右下角']],
  repeat: [['no-repeat', '不重复'], ['repeat', '平铺'], ['repeat-x', '横向重复'], ['repeat-y', '纵向重复'], ['space', '留白平铺'], ['round', '适配平铺']]
}
const fontOptions = [
  ['Fraunces, "DM Serif Display", serif', '典雅衬线 · 标题'],
  ['Inter, "Noto Sans SC", system-ui, sans-serif', '现代无衬线 · 正文'],
  ['"Inter", sans-serif', '简洁无衬线'],
  ['"Inter", "Noto Sans SC", sans-serif', '中英文无衬线'],
  ['"Fira Code", "JetBrains Mono", monospace', '等宽代码 · 连字'],
  ['"Fira Code", monospace', '等宽代码'],
  ['system-ui, sans-serif', '系统默认'],
  ['serif', '系统衬线'],
  ['monospace', '系统等宽']
]
const effectHelp = {
  pixelSnow: '在页面背景显示漂浮的粒子雪花。',
  sideRays: '在页面两侧显示光线氛围效果。',
  splashCursor: '鼠标移动时显示流体光影，会使用图形性能。',
  gridOverlay: '在背景叠加网格纹理。',
  enableAnimations: '启用页面过渡和动态效果。',
  animations: '启用页面过渡和动态效果。',
  glassEffect: '为卡片添加半透明玻璃质感。'
}

/** 提供外观字段可视操作；仅在用户操作时回传新值，未知字段使用精确输入兜底。 */
export default function StudioAppearanceControl({ path, fieldKey, label, value, onChange, disabled = false }) {
  const parts = Array.isArray(path) ? path : String(path ?? '').split(/[.[\]/]+/).filter(Boolean)
  const key = fieldKey ?? parts[parts.length - 1]
  const isBackground = parts.includes('background')
  const isFont = parts.includes('fonts') && ['heading', 'body', 'code'].includes(key)
  const isRadius = parts.includes('borderRadius')
  const isSpacing = parts.includes('spacing') && key === 'unit'
  const isOverlay = isBackground && key === 'overlay'
  const isEffect = parts.includes('effects') && typeof value === 'boolean'
  const options = isFont ? fontOptions : isBackground && Object.hasOwn(backgroundOptions, key) ? backgroundOptions[key] : null
  const textValue = value == null ? '' : String(value)
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const radiusMatch = isRadius ? textValue.match(/^([\d.]+)(px|rem)$/) : null
  // rem 仅用于滑块位置估算；原值及圆角示例保持原单位，交互后才写入 px。
  const radiusPixels = radiusMatch ? Number(radiusMatch[1]) * (radiusMatch[2] === 'rem' ? 16 : 1) : 0

  /** 保留数字或布尔字段的原类型，拒绝无法表示该类型的精确输入。 */
  function changeExact(event) {
    const next = event.target.value
    if (typeof value === 'number') {
      if (next.trim() && Number.isFinite(Number(next))) onChange(Number(next))
    } else if (typeof value === 'boolean') {
      if (next === 'true' || next === 'false') onChange(next === 'true')
    } else onChange(next)
  }

  /** 为所有可视控件附加可折叠的精确输入，不在挂载或失焦时规范化旧值。 */
  function advanced() {
    return <details className="studio-appearance-advanced">
      <summary>{label}：高级输入</summary>
      <label>{label}自定义<input aria-label={`${label}自定义`} type="text" inputMode={typeof value === 'number' ? 'decimal' : undefined} value={textValue} disabled={disabled} onChange={changeExact} /></label>
      <small>保留原始自定义值；只有主动编辑才会更新。</small>
    </details>
  }

  if (isEffect) return <div className="studio-appearance-control">
    <label className="studio-appearance-toggle"><input type="checkbox" aria-label={label} checked={value} disabled={disabled} onChange={/* 仅明确切换时写入布尔值。 */ event => onChange(event.target.checked)} />{label}</label>
    <p className="studio-appearance-help">{effectHelp[key] ?? '控制此项页面特效，关闭可减少视觉干扰和渲染开销。'}</p>
  </div>

  if (options) {
    const known = options.some(/* 精确比较预设，保留所有非标准字符串。 */ option => option[0] === value)
    return <div className="studio-appearance-control">
      <label>{label}<select aria-label={label} value={textValue} disabled={disabled} onChange={/* 仅选择新预设时替换自定义值。 */ event => onChange(event.target.value)}>
        {!known && <option value={textValue}>自定义：{textValue || '未设置'}</option>}
        {options.map(/* 使用稳定的预设值作为选项标识。 */ ([optionValue, title]) => <option key={optionValue} value={optionValue}>{title}</option>)}
      </select></label>
      {isFont && <p className="studio-appearance-help">优先使用本机已有字体；未安装时使用后备字体，不会自动下载。</p>}
      {isFont && <div className="studio-appearance-font" style={{ fontFamily: textValue }} aria-label={`${label}示例`}>文字示例 Aa 0123{key === 'code' && ' const hello = "你好"'}</div>}
      {advanced()}
    </div>
  }

  if (isOverlay || isRadius || isSpacing) return <div className="studio-appearance-control">
    <label>{isRadius ? `${label}调节` : label}<span className="studio-appearance-value">{isOverlay && numeric ? `${Math.round(value * 100)}%` : isRadius ? radiusPixels >= 9999 ? '完全圆角' : radiusMatch ? `${radiusPixels} 像素` : '自定义形状' : textValue}{isSpacing ? ' 像素' : ''}</span>
      <input type="range" aria-label={isRadius ? `${label}调节` : label} min="0" max={isOverlay ? 1 : isRadius ? 128 : Math.max(64, numeric ? value : 64)} step={isOverlay ? 0.01 : isSpacing ? 'any' : 1} value={isRadius ? Math.min(128, radiusPixels) : numeric ? Math.min(isOverlay ? 1 : Infinity, Math.max(0, value)) : 0} disabled={disabled} onChange={/* 滑块交互明确写入 px 字符串或数字，避免隐式类型转换。 */ event => onChange(isRadius ? `${event.target.value}px` : typeof value === 'string' ? event.target.value : Number(event.target.value))} />
    </label>
    {isOverlay && <p className="studio-appearance-help">向左画面更明亮，向右遮罩更深、文字更清晰。</p>}
    {isSpacing && <p className="studio-appearance-help">控制页面基础留白大小，单位为像素。</p>}
    {isRadius && <div className="studio-appearance-radius-row"><span className="studio-appearance-radius" style={{ borderRadius: textValue }} aria-label={`${label}示例`}>圆角示例</span><button type="button" disabled={disabled} onClick={/* 明确选择完全圆角，保持主题约定的值。 */ () => onChange('9999px')}>完全圆角</button></div>}
    {advanced()}
  </div>

  return <div className="studio-appearance-control"><label>{label}<input aria-label={label} value={textValue} disabled={disabled} onChange={changeExact} /></label></div>
}
