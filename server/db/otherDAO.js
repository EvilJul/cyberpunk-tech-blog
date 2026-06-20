import db from './index.js'

/**
 * 评论 DAO
 */
export class CommentDAO {
  /**
   * 创建评论
   */
  static create(comment) {
    const now = Date.now()

    const stmt = db.prepare(`
      INSERT INTO comments (id, article_id, parent_id, author, email, content, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      comment.id,
      comment.articleId,
      comment.parentId || null,
      comment.author,
      comment.email || null,
      comment.content,
      comment.status || 'pending',
      now
    )

    return this.findById(comment.id)
  }

  /**
   * 根据 ID 查询评论
   */
  static findById(id) {
    const stmt = db.prepare('SELECT * FROM comments WHERE id = ?')
    return stmt.get(id)
  }

  /**
   * 根据文章 ID 查询评论
   */
  static findByArticleId(articleId) {
    const stmt = db.prepare(`
      SELECT * FROM comments
      WHERE article_id = ?
      ORDER BY created_at ASC
    `)
    return stmt.all(articleId)
  }

  /**
   * 更新评论状态
   */
  static updateStatus(id, status) {
    const stmt = db.prepare('UPDATE comments SET status = ? WHERE id = ?')
    return stmt.run(status, id).changes > 0
  }

  /**
   * 删除评论
   */
  static delete(id) {
    const stmt = db.prepare('DELETE FROM comments WHERE id = ?')
    return stmt.run(id).changes > 0
  }
}

/**
 * 用户 DAO
 */
export class UserDAO {
  /**
   * 创建用户
   */
  static create(user) {
    const now = Date.now()

    const stmt = db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      user.id,
      user.username,
      user.passwordHash,
      user.role || 'user',
      now,
      now
    )

    return this.findById(user.id)
  }

  /**
   * 根据 ID 查询用户
   */
  static findById(id) {
    const stmt = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    return stmt.get(id)
  }

  /**
   * 根据用户名查询用户
   */
  static findByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?')
    return stmt.get(username)
  }

  /**
   * 查询所有用户
   */
  static findAll() {
    const stmt = db.prepare('SELECT id, username, role, created_at FROM users')
    return stmt.all()
  }

  /**
   * 更新用户
   */
  static update(id, updates) {
    const now = Date.now()
    const fields = []
    const values = []

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
        fields.push(`${snakeKey} = ?`)
        values.push(value)
      }
    })

    fields.push('updated_at = ?')
    values.push(now)

    if (fields.length > 0) {
      const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
      stmt.run(...values, id)
    }

    return this.findById(id)
  }

  /**
   * 删除用户
   */
  static delete(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?')
    return stmt.run(id).changes > 0
  }
}

/**
 * 分类 DAO
 */
export class CategoryDAO {
  /**
   * 创建分类
   */
  static create(category) {
    const now = Date.now()

    const stmt = db.prepare(`
      INSERT INTO categories (name, slug, description, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const result = stmt.run(
      category.name,
      category.slug || category.name.toLowerCase().replace(/\s+/g, '-'),
      category.description || null,
      now
    )

    return this.findById(result.lastInsertRowid)
  }

  /**
   * 根据 ID 查询分类
   */
  static findById(id) {
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?')
    return stmt.get(id)
  }

  /**
   * 根据名称查询分类
   */
  static findByName(name) {
    const stmt = db.prepare('SELECT * FROM categories WHERE name = ?')
    return stmt.get(name)
  }

  /**
   * 查询所有分类
   */
  static findAll() {
    const stmt = db.prepare(`
      SELECT c.*, COUNT(a.id) as count
      FROM categories c
      LEFT JOIN articles a ON c.id = a.category_id
      GROUP BY c.id
      ORDER BY c.name
    `)
    return stmt.all()
  }

  /**
   * 删除分类
   */
  static delete(id) {
    const stmt = db.prepare('DELETE FROM categories WHERE id = ?')
    return stmt.run(id).changes > 0
  }
}

/**
 * 标签 DAO
 */
export class TagDAO {
  /**
   * 查询所有标签
   */
  static findAll() {
    const stmt = db.prepare(`
      SELECT t.*, COUNT(at.article_id) as count
      FROM tags t
      LEFT JOIN article_tags at ON t.id = at.tag_id
      GROUP BY t.id
      ORDER BY count DESC, t.name
    `)
    return stmt.all()
  }

  /**
   * 根据名称查询标签
   */
  static findByName(name) {
    const stmt = db.prepare('SELECT * FROM tags WHERE name = ?')
    return stmt.get(name)
  }

  /**
   * 删除未使用的标签
   */
  static deleteUnused() {
    const stmt = db.prepare(`
      DELETE FROM tags
      WHERE id NOT IN (SELECT DISTINCT tag_id FROM article_tags)
    `)
    return stmt.run().changes
  }
}
