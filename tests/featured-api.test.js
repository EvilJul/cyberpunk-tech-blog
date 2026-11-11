import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import Database from 'better-sqlite3'
import express from 'express'
const directory = mkdtempSync(join(tmpdir(), 'featured-api-'))
process.env.BLOG_DATA_DIR = directory
process.env.NODE_ENV = 'production'
process.env.JWT_SECRET = 'featured-test-isolated-secret-32chars'
const { default: db, initDatabase } = await import('../server/db/index.js')
initDatabase()
const { createSession } = await import('../server/services/sessionService.js')
const { default: studio } = await import('../server/routes/studio.js')
const { default: integrations } = await import('../server/routes/integrations.js')
const { default: articles } = await import('../server/routes/articles.js')
const service = await import('../server/services/articleService.js')
const { migrateFeaturedArticles } = await import('../server/db/migrations/featuredArticles.js')
const { default: logger } = await import('../server/utils/logger.js')
for (const [id, role] of [['admin', 'admin'], ['reader', 'user']])
  db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,1,1)').run(id, id, 'unused', role)
const admin = createSession('admin'), reader = createSession('reader')
db.prepare('INSERT INTO integrations(id,name,created_at) VALUES(?,?,1)').run('media-owner', '测试媒体')
for (const id of ['old', 'new'])
  db.prepare('INSERT INTO integration_media(id,integration_id,sha256,filename,url,mime_type,size,width,height,created_at) VALUES(?,?,?,?,?,?,1,1,1,1)').run(id, 'media-owner', id, `${id}.jpg`, `/uploads/${id}.jpg`, 'image/jpeg')
const app = express()
app.use(express.json())
app.use('/api/studio', studio)
// 工作台路由未匹配时仍已执行同一管理员会话和CSRF中间件。
app.use('/api/studio/integrations', integrations)
app.use('/api/articles', articles)
app.use(/* 将业务错误转换为测试可检查的状态。 */ (error, req, res, next) => res.status(error.status || 500).json({ code: error.code }))
const server = app.listen(0, '127.0.0.1')
await new Promise(/* 等待隔离接口服务监听。 */ resolve => server.once('listening', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
process.env.PUBLIC_ORIGIN = origin
/** 发出带可选会话、CSRF及修订条件的测试请求。 */
async function request(path, method = 'GET', body, revision, options = {}) {
  const session = options.reader ? reader : admin
  return fetch(origin + path, { method, headers: {
    Origin: options.origin || origin,
    ...(options.anonymous ? {} : { Cookie: `blog_session=${session.token}` }),
    ...(options.noCsrf ? {} : { 'X-CSRF-Token': session.csrfToken }),
    ...(revision === undefined ? {} : { 'If-Match': `"${revision}"` }),
    'Content-Type': 'application/json'
  }, body: body === undefined ? undefined : JSON.stringify(body) })
}
/** 检查成功响应及返回的修订 ETag。 */
async function mutate(path, method, body, revision) {
  const response = await request(path, method, body, revision)
  assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`)
  const result = await response.json()
  assert.equal(response.headers.get('etag'), `"${result.revision}"`)
  return result
}
after(/* 清理隔离服务、数据库和日志资源。 */ async () => {
  await new Promise(/* 等待HTTP连接关闭。 */ resolve => server.close(resolve))
  db.close()
  await new Promise(/* 等待日志刷新。 */ resolve => logger.end(resolve))
  rmSync(directory, { recursive: true, force: true })
})

test('pin enforces session, CSRF, strict boolean and shared revision without publishing drafts', /* 验证置顶安全边界、冲突与公开快照隔离。 */ async () => {
  let article = await mutate('/api/studio/articles', 'POST', { title: '原标题', content: '公开正文', cover_media_id: 'old' })
  const path = `/api/studio/articles/${article.id}`
  assert.equal(article.pinned, false)
  for (const [options, expected] of [[{ anonymous: true }, 401], [{ reader: true }, 403], [{ noCsrf: true }, 403], [{ origin: 'https://evil.example' }, 403]])
    assert.equal((await request(path + '/pin', 'PUT', { pinned: true }, article.revision, options)).status, expected)
  assert.equal((await request(path + '/pin', 'PUT', { pinned: true })).status, 428)
  assert.equal((await request(path + '/pin', 'PUT', { pinned: true }, article.revision)).status, 409)
  for (const pinned of ['true', 1, null])
    assert.equal((await request(path + '/pin', 'PUT', { pinned }, article.revision)).status, 400)
  article = await mutate(path + '/publish', 'POST', undefined, article.revision)
  const publicVersion = article.published_revision
  article = await mutate(path + '/draft', 'PUT', { title: '私密标题', content: '私密正文', cover_media_id: 'new' }, article.revision)
  assert.equal(article.cover_image, '/uploads/new.jpg')
  const draftBefore = db.prepare('SELECT * FROM article_drafts WHERE article_id=?').get(article.id)
  const beforeRevision = article.revision
  article = await mutate(path + '/pin', 'PUT', { pinned: true }, article.revision)
  assert.equal(article.revision, beforeRevision + 1)
  assert.equal(article.pinned, true)
  assert.equal(article.published_revision, publicVersion)
  assert.deepEqual(db.prepare('SELECT * FROM article_drafts WHERE article_id=?').get(article.id), draftBefore)
  assert.equal((await request(path + '/draft', 'PUT', { content: '过期写入' }, beforeRevision)).status, 412)
  assert.equal((await request(path + '/pin', 'PUT', { pinned: false }, beforeRevision)).status, 412)
  for (const url of ['/api/articles', '/api/articles/featured/list']) {
    const { data } = await (await request(url, 'GET', undefined, undefined, { anonymous: true })).json()
    assert.equal(data[0].title, '原标题')
    assert.equal(Object.hasOwn(data[0], 'content'), false)
    assert.equal(data[0].cover_image, '/uploads/old.jpg')
    assert.ok(!JSON.stringify(data).includes('私密'))
  }
  const publicArticle = await (await request(`/api/articles/by-id/${article.id}`, 'GET', undefined, undefined, { anonymous: true })).json()
  assert.equal(publicArticle.content, '公开正文')
  article = await mutate(path + '/draft', 'PUT', { cover_media_id: null }, article.revision)
  assert.equal(article.cover_image, null)
  assert.equal(article.pinned, true)
  assert.equal((await request(path + '/draft', 'PUT', { cover_media_id: 'missing' }, article.revision)).status, 400)
  article = await mutate(path + '/publish', 'POST', undefined, article.revision)
  assert.equal(article.pinned, true)
  assert.equal((await (await request('/api/articles/featured/list')).json()).data[0].cover_image, null)
  article = await mutate(path + '/unpublish', 'POST', undefined, article.revision)
  assert.deepEqual(await (await request('/api/articles/featured/list')).json(), { data: [] })
  article = await mutate(path + '/pin', 'PUT', { pinned: false }, article.revision)
  assert.equal(article.pinned, false)
  assert.throws(/* 集成即使伪装管理员也不能管理置顶。 */ () => service.setPinned(article.id, { pinned: true }, article.revision, { kind: 'integration', role: 'admin' }), /* 检查集成权限拒绝。 */ error => error.status === 403)
})

test('featured returns at most twenty published snapshots even for an administrator', /* 验证公开接口上限、稳定排序及身份无关的公开筛选。 */ async () => {
  for (let i = 0; i < 22; i++)
    db.prepare("INSERT INTO articles(id,title,slug,status,pinned,publish_date,created_at,updated_at) VALUES(?,?,?,'published',1,'2026-11-11',1,1)").run(`limit-${i.toString().padStart(2, '0')}`, `公开${i}`, `limit-${i}`)
  db.prepare("INSERT INTO articles(id,title,slug,status,pinned,created_at,updated_at) VALUES('hidden','隐藏','hidden','draft',1,1,1)").run()
  const { data } = await (await request('/api/articles/featured/list?per_page=100&status=draft')).json()
  assert.equal(data.length, 20)
  assert.equal(data[0].id, 'limit-00')
  assert.equal(data[19].id, 'limit-19')
  assert.ok(data.every(/* 所有推荐均为公开快照。 */ item => item.status === 'published'))
})

test('featured migration upgrades historical schema idempotently and preserves pins', /* 验证历史库默认值、重复迁移及完整性。 */ () => {
  const historical = new Database(':memory:')
  try {
    historical.exec("CREATE TABLE articles(id TEXT PRIMARY KEY,status TEXT,publish_date TEXT,content TEXT); CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at INTEGER); INSERT INTO articles VALUES('old','published','2020','历史正文')")
    migrateFeaturedArticles(historical)
    assert.equal(historical.prepare('SELECT pinned FROM articles').get().pinned, 0)
    historical.exec('UPDATE articles SET pinned=1')
    migrateFeaturedArticles(historical)
    assert.deepEqual(historical.prepare('SELECT pinned,content FROM articles').get(), { pinned: 1, content: '历史正文' })
    assert.equal(historical.prepare('SELECT count(*) n FROM schema_migrations').get().n, 1)
    assert.equal(historical.pragma('integrity_check', { simple: true }), 'ok')
  } finally { historical.close() }
})


test('media upload and explicit historical registration supply real reusable cover IDs', /* 验证媒体编号、只读列表、历史登记及安全边界。 */ async () => {
  const uploadDir = join(directory, 'uploads')
  mkdirSync(uploadDir, { recursive: true })
  const image = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#456789' } }).png().toBuffer()
  writeFileSync(join(uploadDir, 'historical.png'), image)
  writeFileSync(join(uploadDir, 'invalid.png'), 'not an image')
  symlinkSync(join(uploadDir, 'historical.png'), join(uploadDir, 'link.png'))
  const count = db.prepare('SELECT count(*) n FROM integration_media').get().n
  let list = await (await request('/api/studio/media')).json()
  assert.equal(list.items.find(/* 定位历史图片。 */ item => item.name === 'historical.png').id, null)
  assert.equal(list.items.some(/* 不列出符号链接。 */ item => item.name === 'link.png'), false)
  assert.equal(db.prepare('SELECT count(*) n FROM integration_media').get().n, count)
  for (const [options, status] of [[{ anonymous: true }, 401], [{ reader: true }, 403], [{ noCsrf: true }, 403]])
    assert.equal((await request('/api/studio/media/register', 'POST', { filename: 'historical.png' }, undefined, options)).status, status)
  for (const filename of ['../historical.png', '/tmp/image.png', 'link.png', 'invalid.png'])
    assert.equal((await request('/api/studio/media/register', 'POST', { filename })).status, 400)
  assert.equal((await request('/api/studio/media/register', 'POST', { filename: 'missing.png' })).status, 404)
  const registered = await (await request('/api/studio/media/register', 'POST', { filename: 'historical.png' })).json()
  assert.ok(registered.id)
  assert.notEqual(registered.id, registered.url)
  assert.deepEqual(await (await request('/api/studio/media/register', 'POST', { filename: 'historical.png' })).json(), registered)
  list = await (await request('/api/studio/media')).json()
  assert.equal(list.items.find(/* 确认登记后可选编号。 */ item => item.name === 'historical.png').id, registered.id)
  const form = new FormData()
  form.append('image', new Blob([image], { type: 'image/png' }), 'upload.png')
  const response = await fetch(origin + '/api/studio/media', { method: 'POST', headers: { Origin: origin, Cookie: `blog_session=${admin.token}`, 'X-CSRF-Token': admin.csrfToken }, body: form })
  assert.equal(response.status, 200)
  const uploaded = await response.json()
  assert.equal(uploaded.success, true)
  assert.ok(uploaded.id)
  assert.ok(uploaded.url.startsWith('/uploads/'))
  assert.equal(db.prepare('SELECT url FROM integration_media WHERE id=?').get(uploaded.id).url, uploaded.url)
  let article = await mutate('/api/studio/articles', 'POST', { title: '媒体选择', cover_media_id: registered.id })
  assert.equal(article.cover_image, registered.url)
  article = await mutate(`/api/studio/articles/${article.id}/draft`, 'PUT', { cover_media_id: uploaded.id }, article.revision)
  assert.equal(article.cover_image, uploaded.url)
  assert.equal((await request(`/api/studio/articles/${article.id}/draft`, 'PUT', { cover_media_id: uploaded.url }, article.revision)).status, 400)
  const { cleanupPublishing } = await import('../server/services/mediaService.js')
  cleanupPublishing(Date.now() + 10 * 86400000)
  assert.ok(db.prepare('SELECT id FROM integration_media WHERE id=?').get(registered.id))
})

test('two-segment featured list preserves the original featured slug detail', /* 验证两段推荐路径不占用原有同名文章详情。 */ async () => {
  let article = await mutate('/api/studio/articles', 'POST', { title: '同名文章', slug: 'featured', content: '同名正文' })
  article = await mutate(`/api/studio/articles/${article.id}/publish`, 'POST', undefined, article.revision)
  const detail = await (await request('/api/articles/featured', 'GET', undefined, undefined, { anonymous: true })).json()
  assert.equal(detail.id, article.id)
  assert.equal(detail.content, '同名正文')
  assert.ok(Array.isArray((await (await request('/api/articles/featured/list')).json()).data))
})


test('internal media owner is hidden and can never obtain machine authority; existing ownership is preserved', /* 验证内部主体隔离及已有集成媒体归属不变。 */ async () => {
  const { studioMediaOwner, createKey, verifyActor, authenticate, digest } = await import('../server/services/integrationService.js')
  const priorEnabled = process.env.PUBLISHING_API_ENABLED
  process.env.PUBLISHING_API_ENABLED = 'true'
  try {
    const list = await (await request('/api/studio/integrations')).json()
    assert.equal(list.data.some(/* 内部主体不出现在管理列表。 */ row => row.id === studioMediaOwner), false)
    for (const [suffix, method, body] of [['', 'PATCH', { enabled: true }], ['/keys', 'POST', { scopes: ['media:write'] }], ['/keys', 'GET', undefined]])
      assert.equal((await request(`/api/studio/integrations/${studioMediaOwner}${suffix}`, method, body)).status, 404)
    assert.equal(db.prepare('SELECT enabled FROM integrations WHERE id=?').get(studioMediaOwner).enabled, 0)
    assert.throws(/* 共享服务也禁止内部主体创建密钥。 */ () => createKey(studioMediaOwner, { scopes: ['media:write'] }), /* 检查拒绝状态。 */ error => error.status === 404)
    // 即使历史异常库已存在启用状态及密钥，认证层也必须拒绝。
    const keyId = '11111111-1111-4111-8111-111111111111'
    db.prepare('UPDATE integrations SET enabled=1 WHERE id=?').run(studioMediaOwner)
    db.prepare('INSERT INTO integration_keys(key_id,integration_id,secret_hash,scopes,expires_at,created_at) VALUES(?,?,?,?,?,1)')
      .run(keyId, studioMediaOwner, digest('test-only-secret'), '["media:write"]', Date.now() + 60000)
    try {
      assert.throws(/* 复核权限时不能信任内部主体的启用状态。 */ () => verifyActor({ integrationId: studioMediaOwner, keyId }, 'media:write'), /* 检查认证失败状态。 */ error => error.status === 401)
      assert.throws(/* 拒绝内部主体的格式正确且摘要匹配的凭据。 */ () => authenticate(`Bearer bpk_${keyId}.test-only-secret`), /* 检查认证失败状态。 */ error => error.status === 401)
    } finally {
      db.prepare('DELETE FROM integration_keys WHERE key_id=?').run(keyId)
      db.prepare('UPDATE integrations SET enabled=0 WHERE id=?').run(studioMediaOwner)
    }
    db.prepare('INSERT INTO integration_media(id,integration_id,sha256,filename,url,mime_type,size,width,height,created_at) VALUES(?,?,?,?,?,?,1,4,4,1)')
      .run('existing-owned', 'media-owner', 'existing-owned-hash', 'existing-owned.jpg', '/uploads/existing-owned.jpg', 'image/jpeg')
    const before = db.prepare('SELECT * FROM integration_media WHERE id=?').get('existing-owned')
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()
    writeFileSync(join(directory, 'uploads', before.filename), image)
    const registered = await (await request('/api/studio/media/register', 'POST', { filename: before.filename })).json()
    assert.deepEqual(registered, { id: before.id, url: before.url })
    assert.deepEqual(db.prepare('SELECT * FROM integration_media WHERE id=?').get('existing-owned'), before)
  } finally {
    if (priorEnabled === undefined) delete process.env.PUBLISHING_API_ENABLED
    else process.env.PUBLISHING_API_ENABLED = priorEnabled
  }
})
