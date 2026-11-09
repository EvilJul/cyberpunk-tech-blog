import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { migrateAuthWorkspace } from '../server/db/migrations/authWorkspace.js'
import { migrateArticleWorkspace } from '../server/db/migrations/articleWorkspace.js'
import { migratePublishing } from '../server/db/migrations/publishing.js'

/** 构造保留旧账号与文章的内存数据库。 */
function legacyDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys=ON')
  db.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,description TEXT,created_at INTEGER);
    CREATE TABLE tags(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,created_at INTEGER);
    CREATE TABLE articles(id TEXT PRIMARY KEY,title TEXT,slug TEXT UNIQUE,content TEXT,excerpt TEXT,author TEXT,category_id INTEGER,status TEXT,publish_date TEXT,update_date TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE article_tags(article_id TEXT,tag_id INTEGER);
    CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at INTEGER,details TEXT);
    INSERT INTO users VALUES('existing-owner','existing-owner','unchanged-bcrypt-hash','admin',1,1);
    INSERT INTO categories VALUES(1,'原有分类','original',NULL,1);
    INSERT INTO tags VALUES(1,'原有标签','original-tag',1);
    INSERT INTO articles VALUES('old-published','已发布','existing-url','公开原文','摘要','作者',1,'published','2026-01-01','2026-01-02',1,2);
    INSERT INTO articles VALUES('old-draft','原草稿','existing-draft','秘密草稿','私密摘要','作者',1,'draft',NULL,NULL,1,2);
    INSERT INTO article_tags VALUES('old-published',1),('old-draft',1);
  `)
  return db
}
/** 在同一事务内执行三组升级迁移。 */
function migrate(db) {
  db.transaction(/* 依次执行认证、文章与发布迁移。 */ () => { migrateAuthWorkspace(db); migrateArticleWorkspace(db); migratePublishing(db) }).immediate()
}
test('upgrade preserves account hash, IDs, URLs and public snapshot while importing old drafts idempotently', /* 验证升级保留旧数据并可幂等重跑。 */ () => {
  const db = legacyDatabase()
  try {
    const before = db.prepare('SELECT * FROM articles WHERE id=?').get('old-published')
    migrate(db)
    assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash, 'unchanged-bcrypt-hash')
    const after = db.prepare('SELECT * FROM articles WHERE id=?').get('old-published')
    for (const key of Object.keys(before)) assert.equal(after[key], before[key], key)
    assert.equal(after.revision, 1)
    assert.equal(after.published_revision, 1)
    const draft = JSON.parse(db.prepare('SELECT payload_json FROM article_drafts WHERE article_id=?').get('old-draft').payload_json)
    assert.equal(draft.content, '秘密草稿')
    assert.deepEqual(draft.tags, ['原有标签'])
    migrate(db)
    assert.equal(db.prepare('SELECT count(*) n FROM article_drafts').get().n, 1)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  } finally { db.close() }
})
test('failed combined migration rolls back columns, sessions and private draft schema', /* 验证联合迁移失败时完整回滚。 */ () => {
  const db = legacyDatabase()
  try {
    db.exec("CREATE TRIGGER reject_author_version BEFORE INSERT ON schema_migrations WHEN NEW.version='author-articles-v1' BEGIN SELECT RAISE(ABORT,'injected migration failure'); END")
    assert.throws(/* 运行注入故障的联合迁移。 */ () => migrate(db), /injected migration failure/)
    assert.ok(!db.prepare('PRAGMA table_info(users)').all().some(/* 查找不应在回滚后存在的账号版本列。 */ column => column.name === 'token_version'))
    assert.ok(!db.prepare('PRAGMA table_info(articles)').all().some(/* 查找不应在回滚后存在的文章版本列。 */ column => column.name === 'revision'))
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('sessions','article_drafts','integrations')").get().n, 0)
    assert.equal(db.prepare('SELECT content FROM articles WHERE id=?').get('old-published').content, '公开原文')
  } finally { db.close() }
})
