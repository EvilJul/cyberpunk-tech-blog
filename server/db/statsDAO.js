import db from './index.js'

const maxCount = Number.MAX_SAFE_INTEGER
function overflow() {
  const error = new RangeError('统计计数已达到安全整数上限')
  error.code = 'STATS_COUNT_OVERFLOW'
  error.status = 409
  return error
}

export class StatsDAO {
  static article(id, { includeDrafts = false } = {}) {
    return db.prepare(`
      SELECT COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes
      FROM articles a LEFT JOIN article_stats s ON s.article_id = a.id
      WHERE a.id = ? ${includeDrafts ? '' : "AND a.status = 'published'"}
    `).get(id)
  }

  static siteViews() {
    return db.prepare('SELECT views FROM site_stats WHERE id = 1').get().views
  }

  static incrementSiteViews() {
    const row = db.prepare('UPDATE site_stats SET views = views + 1 WHERE id = 1 AND views < ? RETURNING views').get(maxCount)
    if (!row) throw overflow()
    return row.views
  }

  static incrementViews(id) {
    return db.transaction(() => {
      if (!this.article(id)) return null
      const row = db.prepare(`INSERT INTO article_stats(article_id, views) VALUES(?, 1)
        ON CONFLICT(article_id) DO UPDATE SET views = views + 1
        WHERE views < ? RETURNING views`).get(id, maxCount)
      if (!row) throw overflow()
      return row
    }).immediate()
  }

  static like(id, sourceHash) {
    if (typeof sourceHash !== 'string' || !sourceHash) throw new TypeError('来源标识不能为空')
    return db.transaction(() => {
      if (!this.article(id)) return null
      const result = db.prepare('INSERT OR IGNORE INTO article_likes(article_id, source_hash) VALUES(?, ?)').run(id, sourceHash)
      if (result.changes) {
        const row = db.prepare(`INSERT INTO article_stats(article_id, likes) VALUES(?, 1)
          ON CONFLICT(article_id) DO UPDATE SET likes = likes + 1
          WHERE likes < ? RETURNING likes`).get(id, maxCount)
        // 抛出会同时回滚来源记录，避免失败点赞耗尽去重机会。
        if (!row) throw overflow()
      }
      return { likes: this.article(id).likes }
    }).immediate()
  }

  static all(options = {}) {
    const rows = db.prepare(`SELECT a.id, COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes
      FROM articles a LEFT JOIN article_stats s ON s.article_id = a.id
      ${options.includeDrafts ? '' : "WHERE a.status = 'published'"}`).all()
    return {
      views: this.siteViews(),
      likes: Object.fromEntries(rows.map(a => [a.id, a.likes])),
      articleViews: Object.fromEntries(rows.map(a => [a.id, a.views]))
    }
  }
}
