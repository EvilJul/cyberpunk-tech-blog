import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import logger from '../utils/logger.js'
import { migrateArticleWorkspace } from './migrations/articleWorkspace.js'
import { migrateAuthWorkspace } from './migrations/authWorkspace.js'
import { migrateFeaturedArticles } from './migrations/featuredArticles.js'
import { migratePublishing } from './migrations/publishing.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const dataDir = path.resolve(
  process.env.BLOG_DATA_DIR || path.join(__dirname, '..', 'data')
)
fs.mkdirSync(dataDir, { recursive: true })
export const dbPath = path.join(dataDir, 'blog.db')

// 创建数据库连接
const db = new Database(dbPath, {
  verbose: process.env.NODE_ENV !== 'production' ? logger.debug : null
})

// 启用外键约束
db.pragma('foreign_keys = ON')

// 启用 WAL 模式（更好的并发性能）
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

/** 初始化基础表及幂等增量迁移。 */
export function initDatabase() {
  logger.info('初始化数据库...')

  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `)

  // 分类表
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
  `)

  // 标签表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
  `)

  // 文章表
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT,
      excerpt TEXT,
      author TEXT,
      category_id INTEGER,
      status TEXT DEFAULT 'published',
      publish_date TEXT,
      update_date TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);
    CREATE INDEX IF NOT EXISTS idx_articles_publish_date ON articles(publish_date);
  `)

  // 数据库迁移：为已有文章添加 status 字段
  const tableInfo = db.prepare('PRAGMA table_info(articles)').all()
  if (!tableInfo.some((col) => col.name === 'status')) {
    logger.info('数据库迁移：为 articles 表添加 status 字段')
    db.exec(`ALTER TABLE articles ADD COLUMN status TEXT DEFAULT 'published'`)
  }

  // 创建 status 索引（在迁移之后）
  db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)`)

  // 文章标签关联表
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_tags (
      article_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (article_id, tag_id),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_article_tags_article ON article_tags(article_id);
    CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id);
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS article_stats (
      article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
      views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0),
      likes INTEGER NOT NULL DEFAULT 0 CHECK(likes >= 0)
    );
    CREATE TABLE IF NOT EXISTS site_stats (
      id INTEGER PRIMARY KEY CHECK(id = 1), views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0)
    );
    INSERT OR IGNORE INTO site_stats(id, views) VALUES(1, 0);
    CREATE TABLE IF NOT EXISTS article_likes (
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      source_hash TEXT NOT NULL, PRIMARY KEY(article_id, source_hash)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL, details TEXT
    );
  `)

  // 评论表
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      parent_id TEXT,
      author TEXT NOT NULL,
      email TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id);
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
  `)

  // 全文搜索虚拟表
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title,
      content,
      excerpt,
      content='articles',
      content_rowid='rowid'
    );

    -- 全文搜索触发器
    CREATE TRIGGER IF NOT EXISTS articles_fts_insert AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, content, excerpt)
      VALUES (new.rowid, new.title, new.content, new.excerpt);
    END;

    DROP TRIGGER IF EXISTS articles_fts_delete;
    CREATE TRIGGER articles_fts_delete AFTER DELETE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, content, excerpt)
      VALUES ('delete', old.rowid, old.title, old.content, old.excerpt);
    END;

    DROP TRIGGER IF EXISTS articles_fts_update;
    CREATE TRIGGER articles_fts_update AFTER UPDATE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, content, excerpt)
      VALUES ('delete', old.rowid, old.title, old.content, old.excerpt);
      INSERT INTO articles_fts(rowid, title, content, excerpt)
      VALUES (new.rowid, new.title, new.content, new.excerpt);
    END;
  `)

  db.transaction(/* 原子重建旧版FTS索引并记录一次性迁移版本。 */ () => {
    if (
      !db
        .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
        .get('fts-delete-v2')
    ) {
      db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')")
      db.prepare(
        'INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)'
      ).run('fts-delete-v2', Date.now())
    }
  })()

  // 添加性能优化索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_article_status ON comments(article_id, status);
  `)

  db.transaction(/* 在同一立即事务中迁移认证、文章工作副本及发布结构。 */ () => {
    migrateAuthWorkspace(db)
    migrateArticleWorkspace(db)
    migratePublishing(db)
    migrateFeaturedArticles(db)
  }).immediate()
  logger.info('数据库初始化完成')
}

// 导出数据库实例
export default db
