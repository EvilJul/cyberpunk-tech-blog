// Called by the database owner after the users table exists. All times are milliseconds.
/** 幂等迁移会话、初始化凭据及用户令牌版本结构。 */
export function migrateAuthWorkspace(db) {
  db.transaction(/* 在事务中补齐认证字段和表。 */ () => {
    if (
      !db
        .prepare('PRAGMA table_info(users)')
        .all()
        .some(/* 检查用户表是否已有令牌版本列。 */ (c) => c.name === 'token_version')
    ) {
      db.exec(
        'ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0'
      )
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS setup_tokens (
        token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, consumed_at INTEGER
      );
    `)
    if (
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        )
        .get()
    ) {
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)'
      ).run('author-auth-v1', Date.now())
    }
  }).immediate()
}
