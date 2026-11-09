import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-data-test-'))
process.env.BLOG_DATA_DIR = dir
process.env.JWT_SECRET = 'disposable-test-secret-for-data-tests'
process.env.NODE_ENV = 'production'
const { default: db, initDatabase, dbPath } = await import('../server/db/index.js')
const { ArticleDAO } = await import('../server/db/articleDAO.js')
const { CategoryDAO, TagDAO } = await import('../server/db/otherDAO.js')
const { StatsDAO } = await import('../server/db/statsDAO.js')
const { migrateStats } = await import('../server/db/migrateStats.js')
initDatabase()
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }) })
const create = (id, status = 'published', categoryId = null) => ArticleDAO.create({
  id, slug: id, title: '中文搜索技术指南 ' + id, content: '连续中文片段测试', status, categoryId,
  tags: ['技术'], publishDate: '2026-11-09'
})

test('data isolation, Chinese fallback, symbol safety, pagination and draft counts', () => {
  assert.equal(dbPath, path.join(dir, 'blog.db'))
  const category = CategoryDAO.create({ name: '分类' })
  create('public', 'published', category.id)
  create('draft', 'draft', category.id)
  assert.equal(ArticleDAO.findAll({ status: 'draft' }).pagination.total, 1)
  assert.equal(ArticleDAO.findAll({ includeDrafts: true }).pagination.total, 2)
  assert.equal(ArticleDAO.search('中文片').pagination.total, 1)
  assert.equal(ArticleDAO.search('!!! "*():').pagination.total, 0)
  assert.equal(ArticleDAO.search('中文片', 2, 1).data.length, 0)
  assert.equal(CategoryDAO.findAll()[0].count, 1)
  assert.equal(TagDAO.findAll()[0].count, 1)
  assert.equal(ArticleDAO.getStats().total, 1)
  assert.equal(ArticleDAO.getStats({ includeDrafts: true }).total, 2)
})

test('migration rejects orphans with backup/report and retries idempotently', async () => {
  const source = path.join(dir, 'stats.json')
  fs.writeFileSync(source, JSON.stringify({ views: 10, articleViews: { missing: 8 }, likes: {} }))
  await assert.rejects(migrateStats(source), /校验失败/)
  assert.equal(StatsDAO.siteViews(), 0)
  fs.writeFileSync(source, JSON.stringify({ views: 10, articleViews: { public: 8, draft: 3 }, likes: { public: 2 } }))
  db.exec("CREATE TRIGGER fail_stats BEFORE INSERT ON article_stats WHEN new.article_id = 'draft' BEGIN SELECT RAISE(ABORT, 'migration injected'); END")
  await assert.rejects(migrateStats(source), /migration injected/)
  assert.equal(StatsDAO.siteViews(), 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_stats').get().n, 0)
  assert.equal(db.prepare("SELECT 1 FROM schema_migrations WHERE version = 'legacy-stats-json-v1'").get(), undefined)
  db.exec('DROP TRIGGER fail_stats')
  const migrated = await migrateStats(source)
  assert.equal(migrated.views, 11)
  assert.ok(fs.existsSync(path.join(migrated.backupDir, 'blog.db')))
  assert.equal((await migrateStats(source)).skipped, true)
  const backups = fs.readdirSync(path.join(dir, 'migration-backups')).sort()
  fs.writeFileSync(source, 'invalid changed source')
  assert.deepEqual(await migrateStats(source), { skipped: true, backupDir: migrated.backupDir })
  fs.unlinkSync(source)
  assert.deepEqual(await migrateStats(source), { skipped: true, backupDir: migrated.backupDir })
  assert.deepEqual(fs.readdirSync(path.join(dir, 'migration-backups')).sort(), backups)
  assert.equal(StatsDAO.siteViews(), 10)
  assert.equal(ArticleDAO.findById('public').views, 8)
  assert.equal(ArticleDAO.findBySlug('public').likes, 2)
  assert.equal(StatsDAO.article('public').views, 8)
  assert.equal(StatsDAO.all().articleViews.draft, undefined)
})

test('atomic concurrent writers, persistent unique likes and cascading delete', async () => {
  const code = `const { parentPort, workerData } = require('node:worker_threads');
    const Database = require(workerData.module); const db = new Database(workerData.path);
    db.pragma('busy_timeout = 5000');
    for (let i = 0; i < 40; i++) db.prepare('UPDATE site_stats SET views = views + 1 WHERE id = 1').run();
    db.close(); parentPort.postMessage('done')`
  await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
    const w = new Worker(code, { eval: true, workerData: { path: dbPath, module: path.resolve('node_modules/better-sqlite3') } })
    w.on('error', reject); w.on('exit', code => code ? reject(new Error('worker ' + code)) : resolve())
  })))
  assert.equal(StatsDAO.siteViews(), 130)
  assert.deepEqual(StatsDAO.like('public', 'hash'), { likes: 3 })
  assert.deepEqual(StatsDAO.like('public', 'hash'), { likes: 3 })
  assert.equal(StatsDAO.incrementViews('draft'), null)
  ArticleDAO.delete('public')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_stats WHERE article_id = ?').get('public').n, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_likes').get().n, 0)
})

test('taxonomy rename, duplicate rejection, delete and injected-fault rollback', () => {
  const category = CategoryDAO.findByName('分类')
  CategoryDAO.update(category.id, { name: '重命名' })
  const other = CategoryDAO.create({ name: '重复' })
  assert.throws(() => CategoryDAO.update(category.id, { name: other.name }))
  db.exec("CREATE TRIGGER fail_category BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT, 'injected'); END")
  assert.throws(() => CategoryDAO.delete(category.id), /injected/)
  assert.equal(ArticleDAO.findById('draft').category_id, category.id)
  db.exec('DROP TRIGGER fail_category')
  CategoryDAO.delete(category.id)
  assert.equal(ArticleDAO.findById('draft').category_id, null)
  const tag = TagDAO.findByName('技术')
  TagDAO.update(tag.id, { name: '新技术' })
  assert.deepEqual(ArticleDAO.findById('draft').tags, ['新技术'])
  TagDAO.delete(tag.id)
  assert.deepEqual(ArticleDAO.findById('draft').tags, [])
})


test('stats HTTP compatibility, draft hiding, source dedupe and write limit', async () => {
  process.env.STATS_RATE_LIMIT = '3'
  const { default: express } = await import('express')
  const { default: stats } = await import('../server/routes/stats.js')
  const app = express()
  app.use('/api/stats', stats)
  create('http')
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/api/stats'
    assert.equal((await fetch(base + '/article/draft/views')).status, 404)
    assert.equal((await fetch(base + '/article/absent/likes')).status, 404)
    const post = url => fetch(base + url, { method: 'POST' })
    assert.deepEqual(await (await post('/article/http/likes')).json(), { likes: 1 })
    assert.deepEqual(await (await post('/article/http/likes')).json(), { likes: 1 })
    assert.deepEqual(await (await post('/article/http/views')).json(), { views: 1 })
    assert.equal((await post('/views')).status, 429)
    const all = await (await fetch(base + '/all')).json()
    assert.equal(all.likes.http, 1)
    assert.equal(all.articleViews.draft, undefined)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})


test('atomic increments refuse unsafe integers and roll back new like sources', () => {
  create('overflow')
  assert.equal(ArticleDAO.findById('overflow').views, 0)
  assert.equal(ArticleDAO.findBySlug('overflow').likes, 0)
  const max = Number.MAX_SAFE_INTEGER
  const siteBefore = StatsDAO.siteViews()
  try {
    db.prepare('UPDATE site_stats SET views = ? WHERE id = 1').run(max - 1)
    assert.equal(StatsDAO.incrementSiteViews(), max)
    const isOverflow = error => error.code === 'STATS_COUNT_OVERFLOW' && error.status === 409
    assert.throws(() => StatsDAO.incrementSiteViews(), isOverflow)
    assert.equal(StatsDAO.siteViews(), max)
    db.prepare('INSERT INTO article_stats(article_id, views, likes) VALUES(?, ?, ?)').run('overflow', max - 1, max - 1)
    assert.deepEqual(StatsDAO.incrementViews('overflow'), { views: max })
    assert.throws(() => StatsDAO.incrementViews('overflow'), isOverflow)
    assert.deepEqual(StatsDAO.like('overflow', 'accepted'), { likes: max })
    assert.deepEqual(StatsDAO.like('overflow', 'accepted'), { likes: max })
    assert.throws(() => StatsDAO.like('overflow', 'rejected'), isOverflow)
    assert.equal(db.prepare('SELECT 1 FROM article_likes WHERE article_id = ? AND source_hash = ?').get('overflow', 'rejected'), undefined)
    assert.deepEqual(StatsDAO.article('overflow'), { views: max, likes: max })
  } finally {
    db.prepare('UPDATE site_stats SET views = ? WHERE id = 1').run(siteBefore)
    ArticleDAO.delete('overflow')
  }
})


test('reading metrics use full content, exclude whitespace and preserve compact list payloads', () => {
  const cases = [
    ['empty', '', 0, 1],
    ['whitespace', ' \t\n\r\v\f\u00a0\u3000', 0, 1],
    ['one', '中', 1, 1],
    ['boundary', '文'.repeat(400) + ' \n\t', 400, 1],
    ['over', '文'.repeat(401), 401, 2],
    ['long', '文'.repeat(801), 801, 3],
    ['unicode', '中😀 文', 3, 1]
  ]
  try {
    for (const [name, content, words, minutes] of cases) {
      const id = 'reading-' + name
      ArticleDAO.create({ id, slug: id, title: id, content, excerpt: '摘要', status: 'published' })
      const list = ArticleDAO.findAll({ search: id }).data.find(a => a.id === id)
      assert.ok(list)
      assert.equal(list.word_count, words, name)
      assert.equal(list.reading_minutes, minutes, name)
      assert.equal(Object.hasOwn(list, 'content'), false)
      for (const detail of [ArticleDAO.findById(id), ArticleDAO.findBySlug(id)]) {
        assert.equal(detail.word_count, words)
        assert.equal(detail.reading_minutes, minutes)
        assert.equal(detail.views, 0)
        assert.equal(detail.likes, 0)
      }
    }
    StatsDAO.incrementViews('reading-over')
    StatsDAO.like('reading-over', 'reading-test')
    for (const detail of [ArticleDAO.findById('reading-over'), ArticleDAO.findBySlug('reading-over')]) {
      assert.equal(detail.views, 1)
      assert.equal(detail.likes, 1)
    }
    assert.equal(ArticleDAO.search('reading-over').data.find(a => a.id === 'reading-over').reading_minutes, 2)
  } finally {
    for (const [name] of cases) ArticleDAO.delete('reading-' + name)
  }
})
