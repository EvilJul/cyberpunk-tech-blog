import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { startFixture } from './helpers/server.js'

test('public service: routing, health, cache, compression, discovery and shutdown', async t => {
  const { root, base, child } = await startFixture(t)
  const db = new Database(join(root, 'blog.db'))
  t.after(() => db.close())
  const insert = db.prepare('INSERT INTO articles (id,title,slug,excerpt,content,status,created_at,updated_at,publish_date) VALUES (?,?,?,?,?,?,?,?,?)')
  for (let i = 0; i < 25; i++) insert.run(`p${i}`, `标题 & <${i}>`, `post-${i}`, '摘要 "安全"', '正文', 'published', Date.now(), Date.now(), `2026-10-${String(i + 1).padStart(2, '0')}`)
  insert.run('dotted', 'Dotted slug', 'release-1.0', 'public', 'public', 'published', 1, 1, '2026-01-01')
  insert.run('draft', '隐私草稿', 'private-draft', 'secret', 'secret', 'draft', 1, 1, '2026-11-01')
  const health = await fetch(`${base}/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).status, 'ok')
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
  for (const path of ['/api', '/api/not-found', '/uploads/missing.png', '/assets/missing.js']) {
    const response = await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } })
    assert.equal(response.status, 404, path)
    assert.ok(!response.headers.get('content-type').includes('text/html'), path)
  }
  const html = await fetch(`${base}/article/post-1?utm_source=test`, { headers: { Accept: 'text/html' } })
  assert.equal((await fetch(`${base}/article/release-1.0`, { headers: { Accept: 'text/html' } })).status, 200)
  assert.equal(html.status, 200)
  const body = await html.text()
  assert.match(body, /标题 &amp; &lt;1&gt;/)
  assert.match(body, /https:\/\/blog.example\/article\/post-1/)
  assert.ok(!body.includes('utm_source'))
  assert.equal(html.headers.get('cache-control'), 'no-cache')
  assert.equal((await fetch(`${base}/article/private-draft`)).status, 404)
  const asset = await fetch(`${base}/assets/test-abcdefgh.js`, { headers: { 'Accept-Encoding': 'gzip' } })
  assert.match(asset.headers.get('cache-control'), /31536000.*immutable/)
  assert.equal(asset.headers.get('content-encoding'), 'gzip')
  const rssResponse = await fetch(`${base}/rss.xml`)
  assert.match(rssResponse.headers.get('content-type'), /rss\+xml/)
  const rss = await rssResponse.text()
  assert.equal((rss.match(/<item>/g) || []).length, 20)
  assert.ok(!rss.includes('private-draft'))
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text()
  assert.equal((sitemap.match(/\/article\/post-/g) || []).length, 25)
  assert.ok(!sitemap.includes('private-draft'))
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/blog.example\/sitemap.xml/)
  const exit = new Promise(resolve => child.once('exit', resolve))
  child.kill('SIGTERM')
  assert.equal(await exit, 0)
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
})


test('database dependency failures produce 503 without internal details', async t => {
  const { base, child } = await startFixture(t, 'tests/helpers/fault-server.js')
  const closed = new Promise(resolve => child.once('message', resolve))
  child.send('close-database')
  await closed
  const response = await fetch(`${base}/health`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { status: 'unavailable' })
})
for (const fault of ['fatal', 'rejection']) test(`${fault} exits nonzero under controlled shutdown`, async t => {
  const { child } = await startFixture(t, 'tests/helpers/fault-server.js')
  const exit = new Promise(resolve => child.once('exit', resolve))
  child.send(fault)
  assert.equal(await exit, 1)
})


test('deployment subpath keeps SPA, API, assets and canonical consistent', async t => {
  const { root, base } = await startFixture(t, 'server/index.js', { VITE_BASE_PATH: '/blog/', SITE_URL: 'https://blog.example/blog' })
  const db = new Database(join(root, 'blog.db'))
  t.after(() => db.close())
  db.prepare("INSERT INTO articles(id,title,slug,status,created_at,updated_at) VALUES('base','Base','base','published',1,1)").run()
  const response = await fetch(`${base}/blog/article/base`)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /https:\/\/blog.example\/blog\/article\/base/)
  assert.equal((await fetch(`${base}/blog/api/articles`)).status, 200)
  assert.equal((await fetch(`${base}/blog/assets/test-abcdefgh.js`)).status, 200)
  assert.match(await (await fetch(`${base}/blog/robots.txt`)).text(), /Disallow: \/blog\/admin/)
})
