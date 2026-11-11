/** 幂等增加独立置顶元数据，保留已有文章和工作副本。 */
export function migrateFeaturedArticles(db) {
  db.transaction(/* 原子增加字段、推荐索引及迁移记录。 */ () => {
    const columns = db.prepare('PRAGMA table_info(articles)').all()
    if (!columns.some(/* 检查置顶列是否已经存在。 */ column => column.name === 'pinned'))
      db.exec('ALTER TABLE articles ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1))')
    db.exec('CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(status,pinned,publish_date DESC,id)')
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)')
      .run('featured-articles-v1', Date.now())
  })()
}
