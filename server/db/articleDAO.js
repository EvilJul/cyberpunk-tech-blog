import db from './index.js'

/**
 * 文章 DAO
 */
export class ArticleDAO {
  /**
   * 清理 FTS5 查询字符串，转义特殊字符
   */
  static sanitizeFtsQuery(query) {
    // 移除 FTS5 特殊字符: " ' * ( ) : ^ ~
    let sanitized = query.replace(/["'*:()^~\[\]]/g, ' ')
    // 将连续空白压缩为单个空格
    sanitized = sanitized.replace(/\s+/g, ' ').trim()
    if (!sanitized) return ''
    // 每个词加上后缀通配符 * 以支持部分匹配
    return sanitized.split(' ').map(w => `"${w}"`).join(' OR ')
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
   * 根据 ID 查询文章
   */
  static findById(id) {
    const article = db.prepare(`
      SELECT a.*, c.name as category
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.id = ?
    `).get(id)

    if (article) {
      article.tags = this.getTags(id)
    }

    return article
  }

  /**
   * 根据 slug 查询文章
   */
  static findBySlug(slug) {
    const article = db.prepare(`
      SELECT a.*, c.name as category
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.slug = ?
    `).get(slug)

    if (article) {
      article.tags = this.getTags(article.id)
    }

    return article
  }

  /**
   * 分页查询文章
   */
  static findAll({ page = 1, perPage = 10, category, tag, search, status, sort = 'publish_date', order = 'DESC' }) {
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

    // 搜索筛选（使用 FTS5 全文搜索）
    if (search) {
      const ftsQuery = this.sanitizeFtsQuery(search)
      if (ftsQuery) {
        whereConditions.push(`a.rowid IN (
          SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
        )`)
        params.push(ftsQuery)
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // 查询总数
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      ${whereClause}
    `)
    const { count: total } = countStmt.get(...params)

    // 查询数据
    const validSortFields = ['publish_date', 'update_date', 'title', 'created_at']
    const sortField = validSortFields.includes(sort) ? sort : 'publish_date'
    const orderDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const stmt = db.prepare(`
      SELECT a.id, a.title, a.slug, a.excerpt, a.author, a.status, a.publish_date, a.update_date, c.name as category,
             GROUP_CONCAT(t.name, ',') as tags_concat
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN article_tags at ON a.id = at.article_id
      LEFT JOIN tags t ON at.tag_id = t.id
      ${whereClause}
      GROUP BY a.id
      ORDER BY a.${sortField} ${orderDir}
      LIMIT ? OFFSET ?
    `)

    const articles = stmt.all(...params, perPage, offset)

    // 处理标签字段
    articles.forEach(article => {
      article.tags = article.tags_concat ? article.tags_concat.split(',') : []
      delete article.tags_concat
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
  static search(query, page = 1, perPage = 10) {
    const offset = (page - 1) * perPage

    // 使用 FTS5 搜索
    const stmt = db.prepare(`
      SELECT a.id, a.title, a.slug, a.excerpt, a.author, a.publish_date, c.name as category,
             snippet(articles_fts, 1, '<mark>', '</mark>', '...', 30) as highlight,
             GROUP_CONCAT(t.name, ',') as tags_concat
      FROM articles_fts
      JOIN articles a ON articles_fts.rowid = a.rowid
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN article_tags at ON a.id = at.article_id
      LEFT JOIN tags t ON at.tag_id = t.id
      WHERE articles_fts MATCH ?
      GROUP BY a.id
      ORDER BY rank
      LIMIT ? OFFSET ?
    `)

    const articles = stmt.all(query, perPage, offset)

    // 查询总数
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM articles_fts WHERE articles_fts MATCH ?
    `)
    const { count: total } = countStmt.get(query)

    // 处理标签字段
    articles.forEach(article => {
      article.tags = article.tags_concat ? article.tags_concat.split(',') : []
      delete article.tags_concat
    })

    return {
      data: articles,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(perPage),
        total,
        total_pages: Math.ceil(total / perPage)
      }
    }
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
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
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
    return stmt.all(articleId).map(row => row.name)
  }

  /**
   * 为文章添加标签
   */
  static addTags(articleId, tagNames) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) return

    const insertTagStmt = db.prepare(`
      INSERT OR IGNORE INTO tags (name, slug, created_at)
      VALUES (?, ?, ?)
    `)

    const getTagIdStmt = db.prepare('SELECT id FROM tags WHERE name = ?')
    const linkStmt = db.prepare('INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)')

    const now = Date.now()

    tagNames.forEach(tagName => {
      const slug = tagName.toLowerCase().replace(/\s+/g, '-')
      insertTagStmt.run(tagName, slug, now)
      const tag = getTagIdStmt.get(tagName)
      if (tag) {
        linkStmt.run(articleId, tag.id)
      }
    })
  }

  /**
   * 获取统计信息
   */
  static getStats() {
    // 总数
    const { total } = db.prepare('SELECT COUNT(*) as total FROM articles').get()

    // 按分类统计
    const categories = db.prepare(`
      SELECT c.name, COUNT(a.id) as count
      FROM categories c
      LEFT JOIN articles a ON c.id = a.category_id
      GROUP BY c.id, c.name
      ORDER BY count DESC
    `).all()

    // 按标签统计
    const tags = db.prepare(`
      SELECT t.name, COUNT(at.article_id) as count
      FROM tags t
      LEFT JOIN article_tags at ON t.id = at.tag_id
      GROUP BY t.id, t.name
      ORDER BY count DESC
    `).all()

    // 按月份统计
    const months = db.prepare(`
      SELECT substr(publish_date, 1, 7) as month, COUNT(*) as count
      FROM articles
      WHERE publish_date IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
    `).all()

    return { total, categories, tags, months }
  }
}
