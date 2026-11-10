import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ContactLinks from './ContactLinks'
import { apiUrl } from '../../utils/api'

/** 打开唯一原生模态，约束焦点并在关闭时恢复背景和有效触发按钮。 */
export function ReaderDialog({ title, onClose, children, dialogRef, className = '', ...props }) {
  const ownRef = useRef(null)
  const ref = dialogRef || ownRef
  useEffect(/* 挂载后打开模态，使用原生焦点陷阱和背景 inert。 */ () => {
    const element = ref.current
    const trigger = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    element.querySelector('.reader-list-search input')?.focus({ preventScroll: true })
    return /* 关闭时不聚焦已卸载节点，以底栏更多作为可靠兜底。 */ () => {
      element.close()
      document.body.style.overflow = overflow
      const target = trigger?.isConnected && trigger !== document.body && trigger !== document.documentElement ? trigger : document.querySelector('[data-reader-more]')
      target?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={`reader-modal ${className}`} aria-label={title} onCancel={/* Esc 同步 React 状态。 */ (event) => { event.preventDefault(); onClose() }} {...props}>
    <header className="reader-modal-heading"><h2>{title}</h2><button type="button" onClick={onClose} aria-label={title === '搜索文章' ? '关闭搜索' : `关闭${title}`}>关闭</button></header>
    {children}
  </dialog>
}
/** 首页使用两行简介和关于入口；更多面板继续显示真实联系账号。 */
export function ReaderIdentity({ settings, onWechatOpen, home = false }) {
  return <section className={`reader-identity${home ? ' reader-identity--home' : ''}`} aria-label="作者信息">
    <div className="reader-identity-line">
      {settings.avatar ? <img src={settings.avatar.startsWith('/uploads/') ? apiUrl(settings.avatar) : settings.avatar} width="40" height="40" alt="" decoding="async" /> : <span className="reader-identity-avatar" aria-hidden="true">{(settings.author || settings.title || 'B').slice(0, 1)}</span>}
      <div className="reader-identity-copy"><strong>{settings.author || settings.title}</strong><p>{settings.bio || settings.description}</p></div>
      {home && <Link className="reader-identity-about" to="/about">关于我<span aria-hidden="true">↗</span></Link>}
    </div>
    {!home && <ContactLinks settings={settings} onWechatOpen={onWechatOpen} />}
  </section>
}
/** 更多面板复用真实作者联系方式与当前身份可用的入口。 */
export function ReaderMore({ settings, user, location, onClose, onWechatOpen }) {
  return <ReaderDialog title="更多" onClose={onClose}>
    <ReaderIdentity settings={settings} onWechatOpen={onWechatOpen} />
    <nav className="reader-more-links" aria-label="更多入口" onClick={/* 站内导航时同步关闭面板。 */ (event) => { if (event.target.closest('a')) onClose() }}>
      <Link to="/about">关于作者</Link><a href={apiUrl('/rss.xml')}>RSS 订阅</a>
      {!user && <Link to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>登录</Link>}
      {user?.role === 'admin' && <Link to="/studio">作者工作台</Link>}
    </nav>
  </ReaderDialog>
}
/** 监听可见视口，仅在聚焦输入且键盘明显挤压视口时隐藏底栏。 */
export function useReaderKeyboard(mobile) {
  useEffect(/* 可视视口缺失时保持 CSS dvh 降级。 */ () => {
    if (!mobile) return
    const viewport = window.visualViewport
    let baseline = window.innerHeight
    /** 旋转与缩放不视为键盘，普通地址栏缩放不会隐藏导航。 */
    const update = () => {
      const editable = document.activeElement?.matches('input,textarea,[contenteditable="true"]')
      const height = viewport?.height || window.innerHeight
      const keyboard = editable && (!viewport || viewport.scale === 1) && Math.max(baseline, window.innerHeight) - height > 150
      document.documentElement.dataset.readerKeyboard = keyboard ? 'true' : 'false'
      document.documentElement.style.setProperty('--reader-visible-height', `${height}px`)
      if (!editable) baseline = window.innerHeight
    }
    update()
    viewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return /* 清理手机专用属性与所有监听。 */ () => {
      viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update); document.removeEventListener('focusout', update)
      delete document.documentElement.dataset.readerKeyboard
      document.documentElement.style.removeProperty('--reader-visible-height')
    }
  }, [mobile])
}
