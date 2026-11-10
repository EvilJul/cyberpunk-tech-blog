import React, { useEffect, useRef, useState } from 'react'
import { Mail, MessagesSquare, X } from 'lucide-react'
import { apiUrl } from '../../utils/api'

/** 使用猫形轮廓标识 GitHub，避免依赖图标库已移除的品牌导出。 */
function Github({ size = 19, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 19 4.77 5.07 5.07 0 0 0 18.91 1S17.73.65 15 2.48a13.38 13.38 0 0 0-7 0C5.27.65 4.09 1 4.09 1A5.07 5.07 0 0 0 4 4.77 5.44 5.44 0 0 0 2.5 8.55c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 8 18.13V22" /></svg>
}

/** 仅接受文本字段，兼容旧配置并移除首尾空白。 */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 联系链接仅允许 HTTP(S)，二维码的本地上传路径补齐部署前缀。 */
function contactUrl(value, local = false) {
  const raw = text(value)
  const candidate = local && raw.startsWith('/uploads/') ? apiUrl(raw) : raw
  if (!/^https?:\/\//i.test(candidate) && !(local && candidate.startsWith('/') && !candidate.startsWith('//'))) return ''
  try {
    const url = new URL(candidate, window.location.origin)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

/** 展示公众号名、微信号和可选二维码，关闭后恢复原按钮焦点。 */
function WechatDialog({ name, account, qr, onClose }) {
  const dialog = useRef(null)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(/* 使用原生模态框约束焦点，避免背景页面随弹层滚动。 */ () => {
    const element = dialog.current
    const trigger = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return /* 关闭时恢复滚动状态与触发焦点。 */ () => {
      element.close()
      document.body.style.overflow = overflow
      trigger?.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog ref={dialog} className="reader-wechat-dialog" aria-labelledby="reader-wechat-title" onCancel={onClose}>
      <header><h2 id="reader-wechat-title">微信公众号</h2><button type="button" aria-label="关闭公众号" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
      {name && <p className="reader-wechat-name">{name}</p>}
      {qr && !failed && <img src={qr} alt="微信公众号二维码" onError={/* 图片失败时保留名称与账号作为替代关注方式。 */ () => setFailed(true)} />}
      {failed && <p role="alert">二维码加载失败，请在微信中搜索下方账号或公众号名称。</p>}
      {account && <p>微信号：<strong>{account}</strong></p>}
      <p className="reader-wechat-hint">{qr && !failed ? '使用微信扫描二维码关注。' : '打开微信，搜索公众号名称或微信号关注。'}</p>
      {account && <button type="button" className="reader-wechat-copy" onClick={/* 复制微信号并保留手动复制的失败提示。 */ async () => {
        try {
          await navigator.clipboard.writeText(account)
          setMessage('微信号已复制')
        } catch {
          setMessage('复制失败，请手动复制上方微信号')
        }
      }}>复制微信号</button>}
      {message && <p role="status">{message}</p>}
    </dialog>
  )
}

/** 联系方式固定显示三种图标，有效配置点亮，空值与危险链接保持不可点击。 */
export default function ContactLinks({ settings }) {
  const [open, setOpen] = useState(false)
  const github = contactUrl(settings.github)
  const email = text(settings.email)
  const validEmail = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)
  const name = text(settings.wechatName)
  const account = text(settings.wechatId)
  const qr = contactUrl(settings.wechatQr, true)
  const wechat = Boolean(name || account || qr)
  return (
    <div className="reader-contacts" aria-label="作者联系账号">
      {github ? <a className="reader-contact is-enabled" href={github} target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="访问 GitHub"><Github size={19} aria-hidden="true" /></a> : <span className="reader-contact" role="img" aria-label="GitHub（未设置）" title="GitHub 未设置"><Github size={19} aria-hidden="true" /></span>}
      {validEmail ? <a className="reader-contact is-enabled" href={`mailto:${encodeURIComponent(email)}`} aria-label="联系邮箱" title="发送邮件"><Mail size={19} aria-hidden="true" /></a> : <span className="reader-contact" role="img" aria-label="联系邮箱（未设置）" title="联系邮箱未设置"><Mail size={19} aria-hidden="true" /></span>}
      {wechat ? <button type="button" className="reader-contact reader-contact--wechat is-enabled" aria-label="微信公众号" aria-haspopup="dialog" title="查看微信公众号" onClick={/* 在当前页面展示公众号，不跳转外部网站。 */ () => setOpen(true)}><MessagesSquare size={19} aria-hidden="true" /></button> : <span className="reader-contact" role="img" aria-label="微信公众号（未设置）" title="微信公众号未设置"><MessagesSquare size={19} aria-hidden="true" /></span>}
      {open && wechat && <WechatDialog key={qr} name={name} account={account} qr={qr} onClose={/* 关闭公众号信息弹层。 */ () => setOpen(false)} />}
    </div>
  )
}
