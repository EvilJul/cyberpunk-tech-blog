import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { coverUrl } from '../../utils/articlePresentation'

/** 展示文章封面；缺图或加载失败时按场景隐藏或展示安静的主题占位。 */
export default function ArticleCover({ src, placeholder = false, eager = false, className = '' }) {
  const url = coverUrl(src)
  const [failed, setFailed] = useState('')
  if (!url || failed === url) return placeholder ? (
    <div className={`article-cover article-cover--placeholder ${className}`} aria-hidden="true">
      <ImageIcon size={32} strokeWidth={1} />
      <span>精选阅读</span>
    </div>
  ) : null
  return <img className={`article-cover ${className}`} src={url} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={/* 只降级当前失败地址，新封面仍可正常加载。 */ () => setFailed(url)} />
}
