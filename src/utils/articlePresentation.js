/** 将摘要中的 Markdown 标记转成卡片纯文本，不插入 HTML。 */
export function plainExcerpt(value) {
  return String(value || '')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/!?\[([^\]]*)\]\((?:[^()\n]|\([^()]*\))*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(?:^|\n)\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+)/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 用稳定的年月日展示发布时间，非法历史值不显示。 */
export function articleDate(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : ''
}

/** 仅接受 HTTP 图片或站内路径，并补齐历史上传地址的部署前缀。 */
export function coverUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const path = value.trim()
  if (path.startsWith('//') || path.includes('\\')) return ''
  if (path.startsWith('/uploads/')) return `${import.meta.env.BASE_URL}${path.slice(1)}`
  try {
    const url = new URL(path, window.location.origin)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
