import React, { useEffect, useRef, useState } from 'react'

/** 将选区限制在原图范围内，保证输出始终为完整方形。 */
function constrain(crop, image) {
  return { ...crop, x: Math.max(0, Math.min(image.width - crop.size, crop.x)), y: Math.max(0, Math.min(image.height - crop.size, crop.y)) }
}

/** 在本机预览、移动和缩放头像选区，仅确认后才输出 JPEG 并调用上传方。 */
export default function AvatarCropper({ file, onCancel, onConfirm }) {
  const dialog = useRef(null), surface = useRef(null), square = useRef(null), circle = useRef(null), drag = useRef(null), lock = useRef(false)
  const [image, setImage] = useState(null), [crop, setCrop] = useState(null), [zoom, setZoom] = useState(1), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(/* 解码前校验文件，卸载时释放本机预览地址并恢复焦点。 */ () => {
    const previous = document.activeElement
    dialog.current.showModal()
    let active = true, url
    if (file.size > 5 * 1024 * 1024) setError('图片不能超过 5MB，请重新选择。')
    else if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) setError('请选择 JPEG、PNG、WebP 或 GIF 图片。')
    else {
      url = URL.createObjectURL(file)
      const decoded = new Image()
      decoded.onload = /* 初始化居中方形选区，拒绝超大像素图片。 */ () => {
        if (!active) return
        if (!decoded.naturalWidth || !decoded.naturalHeight || decoded.naturalWidth * decoded.naturalHeight > 40000000) {
          setError('图片尺寸无效或超过 4000 万像素，请缩小后重试。')
          return
        }
        const size = Math.min(decoded.naturalWidth, decoded.naturalHeight)
        setImage({ element: decoded, width: decoded.naturalWidth, height: decoded.naturalHeight })
        setCrop({ x: (decoded.naturalWidth - size) / 2, y: (decoded.naturalHeight - size) / 2, size })
      }
      decoded.onerror = /* 明确反馈伪格式或损坏文件，禁止继续确认。 */ () => { if (active) setError('图片无法解码，请选择有效的图片文件。') }
      decoded.src = url
    }
    return /* 停止迟到解码回调并清理预览资源。 */ () => {
      active = false
      if (url) URL.revokeObjectURL(url)
      previous?.focus()
    }
  }, [file])
  useEffect(/* 根据原图选区实时绘制方形和圆形预览。 */ () => {
    if (!image || !crop) return
    for (const canvas of [square.current, circle.current]) {
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 96, 96)
      ctx.drawImage(image.element, crop.x, crop.y, crop.size, crop.size, 0, 0, 96, 96)
    }
  }, [image, crop])
  /** 按显示比例移动原图选区，鼠标与触摸使用同一指针路径。 */
  function move(event) {
    if (!drag.current || !image) return
    const rect = surface.current.getBoundingClientRect()
    setCrop(constrain({ ...drag.current.crop, x: drag.current.crop.x + (event.clientX - drag.current.x) * image.width / rect.width, y: drag.current.crop.y + (event.clientY - drag.current.y) * image.height / rect.height }, image))
  }
  /** 围绕当前选区中心缩放，并在靠近图片边缘时限制越界。 */
  function resize(value) {
    const size = Math.min(image.width, image.height) / value
    setZoom(value)
    setCrop(constrain({ x: crop.x + (crop.size - size) / 2, y: crop.y + (crop.size - size) / 2, size }, image))
  }
  /** 按选区生成 512 像素 JPEG；上传失败保留选区供重试。 */
  async function confirm() {
    if (!image || !crop || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('浏览器无法创建裁剪画布，请换用支持 Canvas 的浏览器。')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 512, 512)
      ctx.drawImage(image.element, crop.x, crop.y, crop.size, crop.size, 0, 0, 512, 512)
      const blob = await new Promise(/* 等待 JPEG 编码，失败时返回明确错误。 */ (resolve, reject) => canvas.toBlob(/* 校验编码结果以避免上传空图片。 */ value => value ? resolve(value) : reject(new Error('图片编码失败，请重试。')), 'image/jpeg', 0.92))
      if (blob.type !== 'image/jpeg' || blob.size > 5 * 1024 * 1024) throw new Error('裁剪输出无效或超过 5MB，请重试。')
      await onConfirm(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    } catch (e) {
      setError(`头像处理失败：${e.message}`)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialog} aria-labelledby="avatar-crop-title" onCancel={/* Esc 与取消按钮保持相同的不上传语义。 */ e => { e.preventDefault(); if (!lock.current) onCancel() }} style={{ margin: 'auto', padding: 24, maxWidth: 'min(560px, 94vw)', maxHeight: '90vh', overflow: 'auto', color: '#e8edf5', background: '#111722', border: '1px solid #748ba5' }}>
      <h2 id="avatar-crop-title">裁剪头像</h2>
      <p>拖动方形选区选择主体，缩放可缩小选区；也可聚焦选区后使用方向键移动。确认后上传，保存设置后生效。</p>
      {error && <p role="alert">{error}</p>}
      {image && crop && <>
        <div ref={surface} style={{ position: 'relative', width: 'min(400px, 72vw)', lineHeight: 0, overflow: 'hidden' }}>
          <img src={image.element.src} alt="头像原图" draggable={false} style={{ width: '100%', height: 'auto', display: 'block' }} />
          <div role="group" aria-label="头像方形选区" tabIndex={0}
            onPointerDown={/* 捕获指针，记录原图坐标下的拖动起点。 */ e => { if (busy) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, crop } }}
            onPointerMove={move}
            onPointerUp={/* 结束拖动并释放指针捕获。 */ e => { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }}
            onPointerCancel={/* 系统取消手势时清除拖动状态。 */ () => { drag.current = null }}
            onKeyDown={/* 为键盘用户提供选区移动，每次移动原图的百分之一。 */ e => { const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!delta || busy) return; e.preventDefault(); setCrop(constrain({ ...crop, x: crop.x + delta[0] * image.width / 100, y: crop.y + delta[1] * image.height / 100 }, image)) }}
            style={{ position: 'absolute', left: `${crop.x / image.width * 100}%`, top: `${crop.y / image.height * 100}%`, width: `${crop.size / image.width * 100}%`, height: `${crop.size / image.height * 100}%`, border: '2px solid #9bd8ff', boxSizing: 'border-box', boxShadow: '0 0 0 1000px #0009', cursor: 'move', touchAction: 'none' }} />
        </div>
        <label>头像缩放（1–4倍）<input type="range" min="1" max="4" step="0.1" value={zoom} disabled={busy} onChange={/* 调整方形选区大小并刷新预览。 */ e => resize(Number(e.target.value))} /></label>
        <p>{zoom.toFixed(1)} 倍 · 输出 512 × 512 JPEG</p>
        <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
          <canvas ref={square} width={96} height={96} role="img" aria-label="头像方形预览" />
          <canvas ref={circle} width={96} height={96} role="img" aria-label="头像圆形预览" style={{ borderRadius: '50%' }} />
        </div>
      </>}
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" disabled={busy} onClick={onCancel}>取消裁剪</button>
        <button type="button" disabled={!image || !crop || busy} onClick={confirm}>{busy ? '正在上传头像…' : '确认裁剪并上传'}</button>
      </div>
    </dialog>
  )
}
