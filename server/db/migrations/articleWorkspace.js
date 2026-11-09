/** 幂等迁移文章修订、工作副本及地址预留结构。 */
export function migrateArticleWorkspace(db) {
  db.transaction(/* 在事务中迁移文章字段及工作副本结构。 */ () => {
    const columns = new Set(
      db
        .prepare('PRAGMA table_info(articles)')
        .all()
        .map(/* 提取已有文章列名。 */ (column) => column.name)
    )
    for (const [name, definition] of [
      ['revision', 'INTEGER NOT NULL DEFAULT 1'],
      ['published_revision', 'INTEGER'],
      ['cover_media_id', 'TEXT'],
      ['canonical_source', 'TEXT']
    ]) {
      if (!columns.has(name))
        db.exec(`ALTER TABLE articles ADD COLUMN ${name} ${definition}`)
    }
    db.exec(`CREATE TABLE IF NOT EXISTS article_drafts (
      article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
      base_published_revision INTEGER
    );
    CREATE TABLE IF NOT EXISTS article_slug_reservations (
      slug TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE
    );`)
    if (
      db
        .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
        .get('author-articles-v1')
    )
      return
    db.prepare(
      "UPDATE articles SET published_revision = revision WHERE status = 'published'"
    ).run()
    const insert = db.prepare(
      'INSERT OR IGNORE INTO article_drafts(article_id,payload_json,updated_at,base_published_revision) VALUES(?,?,?,NULL)'
    )
    for (const article of db
      .prepare(
        "SELECT a.*, c.name AS category FROM articles a LEFT JOIN categories c ON c.id=a.category_id WHERE a.status != 'published'"
      )
      .all()) {
      const tags = db
        .prepare(
          'SELECT t.name FROM tags t JOIN article_tags at ON at.tag_id=t.id WHERE at.article_id=?'
        )
        .all(article.id)
        .map(/* 提取历史文章标签名称。 */ (tag) => tag.name)
      insert.run(
        article.id,
        JSON.stringify({
          title: article.title,
          slug: article.slug,
          content: article.content || '',
          excerpt: article.excerpt || '',
          author: article.author || '博主',
          category: article.category || null,
          category_id: article.category_id,
          tags,
          cover_media_id: null,
          canonical_source: null
        }),
        article.updated_at
      )
    }
    db.prepare(
      'INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)'
    ).run('author-articles-v1', Date.now())
  }).immediate()
}
