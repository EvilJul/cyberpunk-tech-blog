import db from './index.js'
import { createHash } from 'node:crypto'

// SQLite length 按字符计数；排除空格、ASCII 空白、不换行空格和中文全角空格。
// 基于正文而非摘要，列表仅返回计数，不返回正文。
const wordCountSql = [32, 9, 10, 11, 12, 13, 160, 12288].reduce(
  /* 逐项剔除正文中的空白字符以生成字数统计SQL。 */ (sql, code) => `replace(${sql}, char(${code}), '')`,
  "COALESCE(a.content, '')"
)
const readingMetricsSql = `length(${wordCountSql}) AS word_count,
  MAX(1, CAST((length(${wordCountSql}) + 399) / 400 AS INTEGER)) AS reading_minutes`

/**
 * 文章 DAO
 */
export class ArticleDAO {
  /**
   * 清理 FTS5 查询字符串，转义特殊字符
   */
  static sanitizeFtsQuery(query) {
    if (typeof query !== 'string') return ''
    const words = query.match(/[\p{L}\p{N}]+/gu) || []
    return words.map(/* 将搜索词转换为带引号的FTS查询项。 */ (word) => `"${word}"`).join(' OR ')
  }

  /**
   * 创建文章
   */
  static create(article) {
    const now = Date.now()
    const { categoryId, tags, ...articleData } = article
    const status = articleData.status || 'draft'

    const stmt = db.prepare(`
      INSERT INTO articles (id, title, slug, content, excerpt, author, category_id, status, publish_date, update_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      articleData.id,
      articleData.title,
      articleData.slug,
      articleData.content || '',
      articleData.excerpt || '',
      articleData.author || '博主',
      categoryId || null,
      status,
      articleData.publishDate,
      articleData.updateDate,
      now,
      now
    )

    // 添加标签关联
    if (tags && tags.length > 0) {
      this.addTags(articleData.id, tags)
    }

    return this.findById(articleData.id)
  }

  /**
   * 根据 ID 查询文章（含 views/likes，未产生统计时为 0；调用方负责发布权限）
   */
  static findById(id) {
    const article = db
      .prepare(
        `
      SELECT a.*, c.name as category, COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes, m.url AS cover_image, ${readingMetricsSql}
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN article_stats s ON s.article_id = a.id
      LEFT JOIN integration_media m ON m.id = a.cover_media_id
      WHERE a.id = ?
    `
      )
      .get(id)

    if (article) {
      article.tags = this.getTags(id)
    }

    return article
  }

  /**
   * 根据 slug 查询文章（含 views/likes，未产生统计时为 0；调用方负责发布权限）
   */
  static findBySlug(slug) {
    const article = db
      .prepare(
        `
      SELECT a.*, c.name as category, COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes, m.url AS cover_image, ${readingMetricsSql}
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN article_stats s ON s.article_id = a.id
      LEFT JOIN integration_media m ON m.id = a.cover_media_id
      WHERE a.slug = ?
    `
      )
      .get(slug)

    if (article) {
      article.tags = this.getTags(article.id)
    }

    return article
  }

  /**
   * 分页查询文章
   */
  static findAll({
    page = 1,
    perPage = 10,
    category,
    tag,
    search,
    status,
    includeDrafts = false,
    sort = 'publish_date',
    order = 'DESC'
  } = {}) {
    page = Math.max(1, Math.floor(Number(page)) || 1)
    perPage = Math.min(100, Math.max(1, Math.floor(Number(perPage)) || 10))
    if (!includeDrafts) status = 'published'
    const offset = (page - 1) * perPage
    const params = []
    const whereConditions = []

    // 状态筛选
    if (status) {
      whereConditions.push('a.status = ?')
      params.push(status)
    }

    // 分类筛选
    if (category) {
      whereConditions.push('c.name = ?')
      params.push(category)
    }

    // 标签筛选
    if (tag) {
      whereConditions.push(`a.id IN (
        SELECT at.article_id FROM article_tags at
        JOIN tags t ON at.tag_id = t.id
        WHERE t.name = ?
      )`)
      params.push(tag)
    }

    // 先在相同可见性与筛选范围探测 FTS，未命中才执行字面 LIKE。
    if (search !== undefined && search !== '') {
      const ftsQuery = this.sanitizeFtsQuery(search)
      const match =
        'a.rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)'
      if (!ftsQuery) whereConditions.push('0')
      else {
        const scope = [...whereConditions, match].join(' AND ')
        const hit = db
          .prepare(
            `SELECT 1 FROM articles a LEFT JOIN categories c ON c.id = a.category_id WHERE ${scope} LIMIT 1`
          )
          .get(...params, ftsQuery)
        if (hit) {
          whereConditions.push(match)
          params.push(ftsQuery)
        } else {
          const literal = search.replace(/[\\%_]/g, /* 转义LIKE通配符及转义符以执行字面搜索。 */ (value) => '\\' + value)
          whereConditions.push(
            "(a.title LIKE ? ESCAPE '\\' OR a.content LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\')"
          )
          params.push(...Array(3).fill('%' + literal + '%'))
        }
      }
    }

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // 查询总数
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      ${whereClause}
    `)
    const { count: total } = countStmt.get(...params)

    // 查询数据
    const validSortFields = [
      'publish_date',
      'update_date',
      'title',
      'created_at'
    ]
    const sortField = validSortFields.includes(sort) ? sort : 'publish_date'
    const orderDir = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const stmt = db.prepare(`
      SELECT a.id, a.title, a.slug, a.excerpt, a.author, a.status, a.publish_date, a.update_date, c.name as category,
             COALESCE(s.views, 0) AS views, COALESCE(s.likes, 0) AS likes,
             ${readingMetricsSql},
             json_group_array(t.name) FILTER (WHERE t.name IS NOT NULL) AS tags_json
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN article_tags at ON a.id = at.article_id
      LEFT JOIN tags t ON at.tag_id = t.id
      LEFT JOIN article_stats s ON s.article_id = a.id
      ${whereClause}
      GROUP BY a.id
      ORDER BY a.${sortField} ${orderDir}, a.id ASC
      LIMIT ? OFFSET ?
    `)

    const articles = stmt.all(...params, perPage, offset)

    // 处理标签字段
    articles.forEach(/* 解析列表标签数组并移除内部聚合字段。 */ (article) => {
      article.tags = JSON.parse(article.tags_json || '[]')
      delete article.tags_json
    })

    return {
      data: articles,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(perPage),
        total,
        total_pages: Math.ceil(total / perPage),
        has_next: page < Math.ceil(total / perPage),
        has_prev: page > 1
      }
    }
  }

  /**
   * 全文搜索
   */
  static search(query, page = 1, perPage = 10, options = {}) {
    const result = this.findAll({
      ...options,
      search: typeof query === 'string' && query.trim() ? query.trim() : '!!!',
      page,
      perPage
    })
    result.data.forEach(/* 为兼容搜索结果提供摘要高亮字段。 */ (article) => {
      article.highlight = article.excerpt || ''
    })
    return result
  }

  /**
   * 更新文章
   */
  static update(id, updates) {
    const { categoryId, tags, ...articleData } = updates
    const now = Date.now()

    const fields = []
    const values = []

    Object.entries(articleData).forEach(([key, value]) => {
      if (value !== undefined) {
        const snakeKey = key.replace(
          /[A-Z]/g,
          (letter) => `_${letter.toLowerCase()}`
        )
        fields.push(`${snakeKey} = ?`)
        values.push(value)
      }
    })

    if (categoryId !== undefined) {
      fields.push('category_id = ?')
      values.push(categoryId)
    }

    fields.push('updated_at = ?')
    values.push(now)

    if (fields.length > 0) {
      const stmt = db.prepare(`
        UPDATE articles SET ${fields.join(', ')} WHERE id = ?
      `)
      stmt.run(...values, id)
    }

    // 更新标签
    if (tags !== undefined) {
      // 删除旧标签
      db.prepare('DELETE FROM article_tags WHERE article_id = ?').run(id)
      // 添加新标签
      if (tags.length > 0) {
        this.addTags(id, tags)
      }
    }

    return this.findById(id)
  }

  /**
   * 删除文章
   */
  static delete(id) {
    const stmt = db.prepare('DELETE FROM articles WHERE id = ?')
    return stmt.run(id).changes > 0
  }

  /**
   * 获取文章的标签
   */
  static getTags(articleId) {
    const stmt = db.prepare(`
      SELECT t.name
      FROM tags t
      JOIN article_tags at ON t.id = at.tag_id
      WHERE at.article_id = ?
    `)
    return stmt.all(articleId).map((row) => row.name)
  }

  /**
   * 为文章添加标签
   */
  static addTags(articleId, tagNames) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) return

    const findName = db.prepare('SELECT id FROM tags WHERE name = ?')
    const findSlug = db.prepare('SELECT name FROM tags WHERE slug = ?')
    const insert = db.prepare(
      'INSERT INTO tags(name,slug,created_at) VALUES(?,?,?)'
    )
    const link = db.prepare(
      'INSERT OR IGNORE INTO article_tags(article_id,tag_id) VALUES(?,?)'
    )
    for (const tagName of tagNames) {
      let tag = findName.get(tagName)
      if (!tag) {
        const base = tagName.toLowerCase().replace(/\s+/g, '-') || 'tag'
        let slug = base,
          counter = 0
        while (findSlug.get(slug)) {
          const suffix = createHash('sha256')
            .update(`${tagName}:${counter++}`)
            .digest('hex')
            .slice(0, 10)
          slug = `${base}-${suffix}`
        }
        const result = insert.run(tagName, slug, Date.now())
        tag = { id: result.lastInsertRowid }
      }
      link.run(articleId, tag.id)
    }
  }

  /**
   * 获取统计信息
   */
  static getStats({ includeDrafts = false } = {}) {
    const where = includeDrafts ? '' : "WHERE status = 'published'"
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM articles ${where}`)
      .get()
    const categories = db
      .prepare(
        `SELECT c.name, COUNT(a.id) AS count FROM categories c
      LEFT JOIN articles a ON a.category_id = c.id ${includeDrafts ? '' : "AND a.status = 'published'"}
      GROUP BY c.id ORDER BY count DESC, c.name`
      )
      .all()
    const tags = db
      .prepare(
        `SELECT t.name, COUNT(a.id) AS count FROM tags t
      LEFT JOIN article_tags at ON at.tag_id = t.id
      LEFT JOIN articles a ON a.id = at.article_id ${includeDrafts ? '' : "AND a.status = 'published'"}
      GROUP BY t.id ORDER BY count DESC, t.name`
      )
      .all()
    const months = db
      .prepare(
        `SELECT substr(publish_date, 1, 7) AS month, COUNT(*) AS count FROM articles
      WHERE publish_date IS NOT NULL ${includeDrafts ? '' : "AND status = 'published'"} GROUP BY month ORDER BY month DESC`
      )
      .all()
    return { total, categories, tags, months }
  }
}
