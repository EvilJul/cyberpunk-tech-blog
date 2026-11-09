import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import sharp from 'sharp'
const directory = mkdtempSync(join(tmpdir(), 'studio-management-'))
process.env.BLOG_DATA_DIR = directory
process.env.JWT_SECRET = 'studio-test-only-isolated-secret-32chars'
process.env.NODE_ENV = 'test'
const { default: db, initDatabase } = await import('../server/db/index.js')
initDatabase()
const { migrateAuthWorkspace } = await import('../server/db/migrations/authWorkspace.js')
migrateAuthWorkspace(db)
const { createSession } = await import('../server/services/sessionService.js')
const { default: studio } = await import('../server/routes/studio.js')
const { default: comments } = await import('../server/routes/comments.js')
const { default: legacyUpload } = await import('../server/routes/upload.js')
const { default: logger } = await import('../server/utils/logger.js')
for (const [id, role] of [['admin', 'admin'], ['reader', 'user']]) db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id, id, 'unused-test-hash', role, 1, 1)
const admin = createSession('admin'), reader = createSession('reader')
const app = express(); app.use(express.json()); app.use('/api/studio', studio); app.use('/api/comments', comments); app.use('/api/upload', legacyUpload)
app.use(/* 将管理接口错误转换为可断言的响应。 */ (error, req, res, next) => res.status(error.status || 500).json({ error: { code: error.code, message: error.message } }))
const server = app.listen(0, '127.0.0.1'); await new Promise(/* 等待临时管理服务开始监听。 */ resolve => server.once('listening', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
/** 构造管理员会话、来源及可选上传请求。 */
async function req(path, method = 'GET', body, options = {}) {
  const actor = options.actor || admin
  return fetch(origin + path, { method, headers: { ...(options.anonymous ? {} : { Cookie: `blog_session=${actor.token}` }), Origin: options.origin || origin, ...(options.noCsrf ? {} : { 'X-CSRF-Token': actor.csrfToken }), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined })
}
after(/* 关闭服务及日志并移除隔离目录。 */ async () => { await new Promise(/* 等待管理服务关闭连接。 */ resolve => server.close(resolve)); db.close(); await new Promise(/* 等待管理日志写入完成。 */ resolve => logger.end(resolve)); rmSync(directory, { recursive: true, force: true }) })
test('studio requires admin session and same-origin CSRF, legacy upload does not accept cookies', /* 验证管理员会话、同源校验与旧上传边界。 */ async () => {
  assert.equal((await req('/api/studio/categories', 'GET', null, { anonymous: true })).status, 401)
  assert.equal((await req('/api/studio/categories', 'GET', null, { actor: reader })).status, 403)
  assert.equal((await req('/api/studio/categories', 'POST', { name: 'bad' }, { noCsrf: true })).status, 403)
  assert.equal((await req('/api/studio/categories', 'POST', { name: 'bad' }, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await req('/api/upload', 'POST')).status, 401)
})
test('category and tag CRUD preserves envelopes and rejects conflicts', /* 验证分类标签增删改查及重复冲突。 */ async () => {
  for (const type of ['categories', 'tags']) {
    const created = await req(`/api/studio/${type}`, 'POST', { name: '测试', description: '分类说明' }); assert.equal(created.status, 201)
    const item = await created.json()
    assert.equal((await req(`/api/studio/${type}`, 'POST', { name: '测试' })).status, 409)
    assert.equal((await req(`/api/studio/${type}/${item.id}`, 'PUT', { name: '重命名', description: '新说明' })).status, 200)
    const all = await (await req(`/api/studio/${type}`)).json(); assert.ok(all.some(/* 确认改名后的分类或标签可查询。 */ row => row.name === '重命名'))
    assert.equal((await req(`/api/studio/${type}/${item.id}`, 'DELETE')).status, 200)
    assert.equal((await req(`/api/studio/${type}/${item.id}`, 'DELETE')).status, 404)
  }
})
test('moderation hides complete unapproved ancestor subtree and cascades delete', /* 验证祖先审核状态控制公开子树及级联删除。 */ async () => {
  db.prepare('INSERT INTO articles(id,title,slug,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('post', '公开文章', 'post', 'published', 1, 1)
  for (const [id, parent, status] of [['parent', null, 'approved'], ['child', 'parent', 'approved'], ['grandchild', 'child', 'approved'], ['pending', null, 'pending']]) db.prepare('INSERT INTO comments(id,article_id,parent_id,author,email,content,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, 'post', parent, '评论者', 'private@example.test', '内容', status, 1)
  const publicComments = /* 以匿名身份读取公开评论。 */ async () => (await req('/api/comments/post', 'GET', null, { anonymous: true })).json()
  assert.equal((await publicComments()).length, 3); assert.ok((await publicComments()).every(/* 确认公开评论不含邮箱字段。 */ item => !('email' in item)))
  assert.equal((await req('/api/studio/comments/parent', 'PATCH', { status: 'invalid' })).status, 400)
  await req('/api/studio/comments/parent', 'PATCH', { status: 'rejected' }); assert.equal((await publicComments()).length, 0)
  assert.equal(db.prepare('SELECT status FROM comments WHERE id=?').get('child').status, 'approved')
  await req('/api/studio/comments/parent', 'PATCH', { status: 'approved' }); assert.equal((await publicComments()).length, 3)
  const page = await (await req('/api/studio/comments?status=pending&limit=1')).json(); assert.equal(page.total, 1); assert.equal(page.items[0].id, 'pending')
  const removed = await (await req('/api/studio/comments/parent', 'DELETE')).json(); assert.equal(removed.affectedCount, 3)
  assert.equal(db.prepare('SELECT count(*) n FROM comments').get().n, 1)
})
test('settings preserve complete nested fields and reset defaults; safe logs omit payload', /* 验证嵌套设置保留、默认恢复与日志脱敏。 */ async () => {
  const original = await (await req('/api/studio/settings')).json(); assert.equal(original.settings.theme.background.overlay, 0.7)
  const saved = await (await req('/api/studio/settings', 'PUT', { avatar: '/uploads/avatar.jpg', perpage: 8, theme: { background: { image: '/uploads/background.jpg' }, fonts: { body: '测试字体' }, spacing: { card: '2rem' }, customExtension: { marker: '保留扩展' } } })).json()
  assert.deepEqual(saved.settings.theme.spacing, { card: '2rem' }); assert.deepEqual(saved.settings.theme.customExtension, { marker: '保留扩展' });
  const loaded = await (await req('/api/studio/settings')).json(); assert.deepEqual(loaded.settings.theme.spacing, { card: '2rem' }); assert.deepEqual(loaded.settings.theme.customExtension, { marker: '保留扩展' });
  assert.equal(saved.settings.theme.fonts.body, '测试字体'); assert.ok(saved.settings.theme.colors.primary); assert.equal(saved.settings.avatar, '/uploads/avatar.jpg')
  assert.ok((await (await req('/api/studio/settings/default-theme')).json()).theme.effects)
  assert.equal((await (await req('/api/studio/settings/reset', 'POST')).json()).settings.perpage, 10)
  writeFileSync(join(directory, 'app.log'), JSON.stringify({ timestamp: '2026-11-09', level: 'ERROR', message: 'secret-bpk_token', data: { Authorization: 'secret-value' } }) + '\n')
  const text = await (await req('/api/studio/logs')).text(); assert.ok(!text.includes('secret')); assert.ok(text.includes('ERROR'))
  assert.equal((await req('/api/studio/logs/clear', 'POST', null, { noCsrf: true })).status, 403)
  assert.equal((await req('/api/studio/logs/clear', 'POST')).status, 200)
})
test('multipart validates actual image, lists uploaded media and has no deletion endpoint', /* 验证真实图片校验、上传字段与媒体列表。 */ async () => {
  const form = /* 构造伪装为图片的上传请求。 */ () => { const data = new FormData(); data.append('image', new Blob(['fake'], { type: 'image/png' }), 'fake.png'); return data }
  assert.equal((await req('/api/studio/media', 'POST', form(), { noCsrf: true })).status, 403)
  assert.equal((await req('/api/studio/media', 'POST', form())).status, 400)
  const image = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const data = new FormData(); data.append('image', new Blob([image], { type: 'image/png' }), 'test.png'); data.append('type', 'avatar')
  const response = await req('/api/studio/media', 'POST', data); assert.equal(response.status, 200)
  const uploaded = await response.json(); assert.ok(uploaded.url.startsWith('/uploads/'))
  const metadata = await sharp(join(directory, uploaded.url)).metadata(); assert.equal(metadata.width, metadata.height)
  const namedFile = new FormData(); namedFile.append('file', new Blob([image], { type: 'image/png' }), 'editor.png')
  assert.equal((await req('/api/studio/media', 'POST', namedFile)).status, 200)
  const twoFiles = new FormData(); for (const field of ['image', 'file']) twoFiles.append(field, new Blob([image], { type: 'image/png' }), 'two.png')
  assert.equal((await req('/api/studio/media', 'POST', twoFiles)).status, 400)
  const { generateToken } = await import('../server/middleware/auth.js')
  const token = generateToken({ id: 'admin', username: 'admin', role: 'admin' })
  const legacyFile = new FormData(); legacyFile.append('file', new Blob([image], { type: 'image/png' }), 'legacy.png')
  assert.equal((await req('/api/upload', 'POST', legacyFile, { headers: { Authorization: `Bearer ${token}` } })).status, 400)
  const list = await (await req('/api/studio/media')).json(); assert.ok(list.items.some(/* 确认上传结果出现在媒体列表。 */ item => item.url === uploaded.url))
  assert.equal((await req('/api/studio/media/anything', 'DELETE')).status, 404)
})
test('article route adapts shared service and mandatory versions', /* 验证文章路由共享服务及强制版本条件。 */ async () => {
  const created = await req('/api/studio/articles', 'POST', { title: '路由草稿', content: '仅草稿' }); assert.equal(created.status, 201)
  const dto = await created.json(); assert.equal(created.headers.get('etag'), '"1"')
  assert.equal((await req(`/api/studio/articles/${dto.id}/draft`, 'PUT', { content: '保存' })).status, 428)
  const saved = await req(`/api/studio/articles/${dto.id}/draft`, 'PUT', { content: '保存' }, { headers: { 'If-Match': '"1"' } }); assert.equal(saved.status, 200)
  assert.equal((await req(`/api/studio/articles/${dto.id}/publish`, 'POST', {}, { headers: { 'If-Match': '"1"' } })).status, 412)
  assert.equal((await req(`/api/studio/articles/${dto.id}/publish`, 'POST', {}, { headers: { 'If-Match': saved.headers.get('etag') } })).status, 200)
})
