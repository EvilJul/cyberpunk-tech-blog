/** 幂等迁移发布集成及审计相关结构。 */
export function migratePublishing(db) {
  db.transaction(/* 在事务中创建发布表、索引和触发器。 */ () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integrations(id TEXT PRIMARY KEY,name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS integration_keys(key_id TEXT PRIMARY KEY,integration_id TEXT NOT NULL REFERENCES integrations(id),secret_hash TEXT NOT NULL,scopes TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER,last_used_at INTEGER,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS article_sources(integration_id TEXT NOT NULL REFERENCES integrations(id),external_id TEXT NOT NULL,article_id TEXT NOT NULL UNIQUE,tombstone INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(integration_id,external_id));
      CREATE TRIGGER IF NOT EXISTS publishing_source_delete BEFORE DELETE ON articles BEGIN UPDATE article_sources SET tombstone=1 WHERE article_id=OLD.id; END;
      CREATE TABLE IF NOT EXISTS publishing_idempotency(integration_id TEXT NOT NULL,method TEXT NOT NULL,route TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,status INTEGER NOT NULL,body TEXT NOT NULL,etag TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(integration_id,method,route,key));
      CREATE TABLE IF NOT EXISTS integration_media(id TEXT PRIMARY KEY,integration_id TEXT NOT NULL REFERENCES integrations(id),sha256 TEXT NOT NULL,filename TEXT NOT NULL UNIQUE,url TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(integration_id,sha256));
      CREATE TABLE IF NOT EXISTS integration_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,integration_id TEXT,key_id TEXT,operation TEXT NOT NULL,resource_id TEXT,result INTEGER NOT NULL,revision INTEGER,request_id TEXT NOT NULL,source TEXT,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS publishing_audit_time ON integration_audit(integration_id,created_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS publishing_idempotency_time ON publishing_idempotency(created_at);
    `)
    if (
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migrations'")
        .get()
    )
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)'
      ).run('publishing-v1', Date.now())
  })()
}
