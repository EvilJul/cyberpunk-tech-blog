/** 按北京时间聚合近十四天文章活动，不将当前状态伪装为历史快照。 */
export function getOverview(db, now = Date.now()) {
  const day = 86400000
  const last = new Date(now + 8 * 3600000).toISOString().slice(0, 10)
  const first = new Date(now + 8 * 3600000 - 13 * day).toISOString().slice(0, 10)
  const counts = db.prepare(`SELECT COUNT(*) AS articles,
    COALESCE(SUM(status='published'), 0) AS published,
    COALESCE(SUM(status!='published'), 0) AS drafts FROM articles`).get()
  const created = db.prepare(`SELECT date(created_at / 1000.0, 'unixepoch', '+8 hours') AS date,
    COUNT(*) AS articles, SUM(status!='published') AS drafts FROM articles
    WHERE created_at >= ? AND created_at < ? GROUP BY date`).all(
    Date.parse(`${first}T00:00:00+08:00`), Date.parse(`${last}T00:00:00+08:00`) + day
  )
  const published = db.prepare(`SELECT date(publish_date, '+8 hours') AS date, COUNT(*) AS published
    FROM articles WHERE status='published' AND date(publish_date, '+8 hours') BETWEEN ? AND ? GROUP BY date`).all(first, last)
  const creationByDay = new Map(created.map(/* 索引实际创建记录，空日期由下方补零。 */ row => [row.date, row]))
  const publishedByDay = new Map(published.map(/* 索引当前公开文章的发布日期分布。 */ row => [row.date, row.published]))
  const activity = Array.from({ length: 14 }, /* 按日期顺序补全没有活动的天。 */ (_, index) => {
    const date = new Date(Date.parse(`${first}T00:00:00Z`) + index * day).toISOString().slice(0, 10)
    return { date, articles: creationByDay.get(date)?.articles || 0, drafts: creationByDay.get(date)?.drafts || 0, published: publishedByDay.get(date) || 0 }
  })
  return {
    ...counts,
    categories: db.prepare('SELECT COUNT(*) AS count FROM categories').get().count,
    tags: db.prepare('SELECT COUNT(*) AS count FROM tags').get().count,
    views: db.prepare('SELECT views FROM site_stats WHERE id=1').get().views,
    activity,
    timezone: 'Asia/Shanghai'
  }
}
