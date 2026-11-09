import express from 'express'
import db from '../db/index.js'
import { readSettings } from './settings.js'

export const escapeMarkup = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  )
export function siteBase() {
  const url = new URL(
    process.env.SITE_URL ||
      `http://localhost:${process.env.PUBLIC_PORT || 9098}`
  )
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('SITE_URL must use http or https')
  return url.href.replace(/\/$/, '')
}
const articleLink = (article) =>
  `${siteBase()}/article/${encodeURIComponent(article.slug)}`
const isoDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString()
}

export function injectMetadata(html, article, pathname = '/') {
  const settings = readSettings()
  const title = article
    ? `${article.title} - ${settings.title}`
    : settings.title
  const description = article?.excerpt || settings.description || ''
  const canonical = article
    ? articleLink(article)
    : `${siteBase()}${pathname === '/' ? '/' : pathname}`
  const storedCover = article?.cover_media_id
    ? db
        .prepare('SELECT url FROM integration_media WHERE id=?')
        .get(article.cover_media_id)?.url
    : null
  const image =
    article?.cover || article?.cover_image || storedCover || settings.avatar
  const tags = [
    `<meta name="site-url" content="${escapeMarkup(siteBase())}">`,
    `<title>${escapeMarkup(title)}</title>`,
    `<meta name="description" content="${escapeMarkup(description)}">`,
    `<link rel="canonical" href="${escapeMarkup(canonical)}">`,
    ...Object.entries({
      title,
      description,
      type: article ? 'article' : 'website',
      url: canonical
    }).map(
      ([key, value]) =>
        `<meta property="og:${key}" content="${escapeMarkup(value)}">`
    ),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeMarkup(title)}">`,
    `<meta name="twitter:description" content="${escapeMarkup(description)}">`
  ]
  if (image) {
    try {
      const imageUrl = new URL(image, `${siteBase()}/`)
      if (['http:', 'https:'].includes(imageUrl.protocol))
        tags.push(
          `<meta property="og:image" content="${escapeMarkup(imageUrl.href)}">`,
          `<meta name="twitter:image" content="${escapeMarkup(imageUrl.href)}">`
        )
    } catch {
      /* Invalid optional image must not break page rendering. */
    }
  }
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(
      /<meta\s+(?:name|property)=["'](?:description|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,
      ''
    )
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', `${tags.join('\n')}\n</head>`)
}

const router = express.Router()
router.get('/rss.xml', (req, res) => {
  const settings = readSettings()
  const articles = db
    .prepare(
      "SELECT * FROM articles WHERE status = 'published' ORDER BY publish_date DESC, created_at DESC LIMIT 20"
    )
    .all()
  const items = articles
    .map(
      (article) =>
        `<item><title>${escapeMarkup(article.title)}</title><link>${escapeMarkup(articleLink(article))}</link><guid isPermaLink="true">${escapeMarkup(articleLink(article))}</guid><description>${escapeMarkup(article.excerpt)}</description><pubDate>${new Date(isoDate(article.publish_date || article.created_at)).toUTCString()}</pubDate></item>`
    )
    .join('')
  res
    .type('application/rss+xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeMarkup(settings.title)}</title><link>${escapeMarkup(siteBase())}/</link><description>${escapeMarkup(settings.description)}</description><language>zh-CN</language>${items}</channel></rss>`
    )
})
router.get('/sitemap.xml', (req, res) => {
  const articles = db
    .prepare(
      "SELECT slug, update_date, publish_date, updated_at FROM articles WHERE status = 'published' ORDER BY id"
    )
    .all()
  const categories = db
    .prepare(
      "SELECT DISTINCT c.name FROM categories c JOIN articles a ON a.category_id = c.id WHERE a.status = 'published'"
    )
    .all()
  const tags = db
    .prepare(
      "SELECT DISTINCT t.name FROM tags t JOIN article_tags at ON at.tag_id = t.id JOIN articles a ON a.id = at.article_id WHERE a.status = 'published'"
    )
    .all()
  const urls = [
    `<url><loc>${escapeMarkup(siteBase())}/</loc></url>`,
    `<url><loc>${escapeMarkup(siteBase())}/about</loc></url>`
  ]
  for (const article of articles)
    urls.push(
      `<url><loc>${escapeMarkup(articleLink(article))}</loc><lastmod>${isoDate(article.update_date || article.publish_date || article.updated_at)}</lastmod></url>`
    )
  for (const [kind, entries] of [
    ['category', categories],
    ['tag', tags]
  ])
    for (const entry of entries)
      urls.push(
        `<url><loc>${escapeMarkup(`${siteBase()}/${kind}/${encodeURIComponent(entry.name)}`)}</loc></url>`
      )
  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`
    )
})
router.get('/robots.txt', (req, res) => {
  const prefix = new URL(`${siteBase()}/`).pathname.replace(/\/$/, '')
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: ${prefix}/\nDisallow: ${prefix}/admin\nDisallow: ${prefix}/studio\nDisallow: ${prefix}/login\nDisallow: ${prefix}/setup\nDisallow: ${prefix}/api/\nSitemap: ${siteBase()}/sitemap.xml\n`
    )
})
export default router
