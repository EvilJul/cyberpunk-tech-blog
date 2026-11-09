import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
export function useSeo({
  title,
  description = '',
  image = '',
  article = false,
  enabled = true
}) {
  const initialBase = useRef(
    document.querySelector('meta[name="site-url"]')?.content ||
      document.querySelector('link[rel="canonical"]')?.href ||
      window.location.origin
  )
  const { pathname } = useLocation()
  useEffect(() => {
    if (!enabled) return

    document.title = title || 'TechBlog'
    const base = initialBase.current
    const prefix = import.meta.env.BASE_URL.replace(/\/$/, '')
    const canonical = new URL(`${prefix}${pathname}`, base).href
    const set = (key, content, property = false) => {
      const attr = property ? 'property' : 'name'
      let node = document.head.querySelector(`meta[${attr}="${key}"]`)
      if (!node) {
        node = document.createElement('meta')
        node.setAttribute(attr, key)
        document.head.append(node)
      }
      node.content = content
    }
    set('description', description)
    set('og:title', title || '', true)
    set('og:description', description, true)
    set('og:type', article ? 'article' : 'website', true)
    set('og:url', canonical, true)
    let cover = ''
    try {
      const url = new URL(image, base)
      if (image && ['http:', 'https:'].includes(url.protocol)) cover = url.href
    } catch {}
    set('og:image', cover, true)
    set('twitter:card', cover ? 'summary_large_image' : 'summary')
    set('twitter:title', title || '')
    set('twitter:description', description)
    set('twitter:image', cover)
    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.append(link)
    }
    link.href = canonical
  }, [pathname, title, description, image, article, enabled])
}
