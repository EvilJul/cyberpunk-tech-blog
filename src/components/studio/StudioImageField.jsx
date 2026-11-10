import React, { useState } from 'react'
import AvatarCropper from './AvatarCropper'

/** 将上传、裁剪与反馈放在图片地址旁，仅回填待保存值。 */
export default function StudioImageField({ label, value, onChange, upload, resolveUrl, avatar = false, background = false, disabled = false, onBusy }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [broken, setBroken] = useState('')
  /** 上传失败保留当前地址；裁剪上传失败继续交由裁剪器展示并允许重试。 */
  async function send(selected) {
    setBusy(true)
    onBusy(1)
    setError('')
    setMessage('')
    try {
      const result = await upload(selected, background ? 'background' : 'normal')
      if (!result?.url) throw new Error('上传响应缺少图片地址')
      onChange(resolveUrl(result.url))
      setBroken('')
      setFile(null)
      setMessage('上传完成，保存设置后生效。')
    } catch (e) {
      setError(`上传失败：${e.message}`)
      if (avatar) throw e
    } finally {
      setBusy(false)
      onBusy(-1)
    }
  }
  return (
    <div style={{ margin: '12px 0', minWidth: 0 }} aria-busy={busy}>
      <label style={{ display: 'block' }}>{label}
        <input value={value ?? ''} disabled={disabled || busy}
          onChange={/* 手动输入仍只修改待保存地址，并清理旧反馈。 */ e => { onChange(e.target.value); setMessage(''); setError(''); setBroken('') }} />
      </label>
      <label style={{ display: 'block', marginTop: 8 }}>
        {avatar ? '上传头像（选择区域裁剪）' : background ? '上传背景' : `上传${label}`}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled || busy}
          onChange={/* 校验所选文件，头像先裁剪，其他图片直接上传。 */ e => {
            const selected = e.target.files[0]
            e.target.value = ''
            if (!selected) return
            setError(''); setMessage('')
            if (avatar) { setFile(selected); return }
            if (selected.size > 5 * 1024 * 1024) { setError('图片不能超过 5MB'); return }
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(selected.type)) { setError('请选择 JPEG、PNG、WebP 或 GIF 图片'); return }
            send(selected)
          }} />
      </label>
      <small>支持 JPEG、PNG、WebP、GIF，最大 5MB；上传后需保存设置。</small>
      {value && <img key={value} src={resolveUrl(value)} alt={`${label}预览`} hidden={broken === value}
        onError={/* 记录当前预览失败，地址仍保留以便更正。 */ () => setBroken(value)}
        style={{ display: broken === value ? 'none' : 'block', maxWidth: '100%', width: avatar ? 96 : 240, maxHeight: 160, objectFit: 'contain', marginTop: 8 }} />}
      {broken === value && value && <p role="alert">图片预览失败，请检查地址或重新上传。</p>}
      {busy && <p aria-live="polite">正在上传…</p>}
      {message && <p aria-live="polite">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {file && <AvatarCropper file={file} onConfirm={send}
        onCancel={/* 取消裁剪不上传，也不改变现有头像。 */ () => setFile(null)} />}
    </div>
  )
}
