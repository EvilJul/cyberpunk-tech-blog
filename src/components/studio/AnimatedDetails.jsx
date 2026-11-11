import React, { useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

/** 为原生折叠区补充双向高度动画，保留 summary 的键盘与无障碍语义。 */
export default function AnimatedDetails({ title, className, children, defaultOpen = true }) {
  const element = useRef(null)
  const animation = useRef(null)
  const expanded = useRef(defaultOpen)

  useEffect(/* 离开编辑页后取消未完成动画，避免回调访问已卸载节点。 */ () => {
    return /* 清理动画及完成回调。 */ () => {
      if (animation.current) animation.current.onfinish = null
      animation.current?.cancel()
    }
  }, [])

  /** 先记录正在绘制的高度，允许连续点击从中途平滑反向。 */
  function toggle(event) {
    event.preventDefault()
    const details = element.current
    const from = details.getBoundingClientRect().height
    if (animation.current) animation.current.onfinish = null
    animation.current?.cancel()
    const next = !expanded.current
    expanded.current = next
    details.dataset.expanded = String(next)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      details.open = next
      delete details.dataset.animating
      return
    }
    // 收起时保留 open，直到退场结束才让浏览器隐藏内容。
    details.open = next
    const to = details.getBoundingClientRect().height
    details.open = true
    details.dataset.animating = 'true'
    const current = details.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 260,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards'
    })
    animation.current = current
    current.onfinish = /* 动画结束后恢复自然高度，允许封面和媒体内容继续改变尺寸。 */ () => {
      details.open = next
      delete details.dataset.animating
      current.cancel()
      animation.current = null
    }
  }

  return <details ref={element} className={className} open={defaultOpen} data-expanded={defaultOpen}>
    <summary onClick={toggle}>{title}<ChevronDown className="studio-collapse-chevron" size={16} aria-hidden="true" /></summary>
    {children}
  </details>
}
