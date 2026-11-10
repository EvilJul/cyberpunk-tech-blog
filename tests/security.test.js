import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Environment is configured before any application module can open persistent files.
const directory = await mkdtemp(path.join(tmpdir(), 'blog-security-'))
process.env.BLOG_DATA_DIR = directory
process.env.JWT_SECRET = 'security-test-secret-only-never-production'
process.env.NODE_ENV = 'production'
const { default: express } = await import('express')
const { default: db, initDatabase } = await import('../server/db/index.js')
assert.ok(db.name.startsWith(directory), 'Database must be isolated')
initDatabase()
const { UserDAO } = await import('../server/db/otherDAO.js')
const { ArticleDAO } = await import('../server/db/articleDAO.js')
const { createSetupToken } = await import('../server/services/setupService.js')
const { generateToken } = await import('../server/middleware/auth.js')
const app = express()
app.use(express.json({ limit: '16kb' }))
for (const name of ['session', 'setup', 'auth', 'articles', 'comments', 'logs', 'upload', 'telemetry']) {
  app.use(`/${name}`, (await import(`../server/routes/${name}.js`)).default)
}
app.use((error, req, res, next) => res.status(500).json({ error: error.message }))
const server = app.listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
process.env.PUBLIC_ORIGIN = base
async function request(route, method = 'GET', body, token, extraHeaders = {}) {
  return fetch(base + route, { method, headers: {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: token } : {}),
    Origin: base, ...extraHeaders
  }, body: body ? JSON.stringify(body) : undefined })
}

test('isolated security acceptance', async t => {
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    db.close()
    // Winston owns asynchronous file handles until process exit; leave its temporary directory.
  })
  assert.equal((await request('/auth/users', 'POST', { username: 'attacker', password: 'test-password' })).status, 401)
  assert.deepEqual(await (await request('/setup/status')).json(), { needsSetup: true })
  assert.equal((await request('/setup/complete', 'POST', { username: 'attacker', password: 'test-password' })).status, 403)
  const setupToken = createSetupToken()
  const results = await Promise.all(['first', 'second'].map(username =>
    request('/setup/complete', 'POST', { username, password: 'test-password', token: setupToken })))
  assert.deepEqual(results.map(r => r.status).sort(), [201, 403])
  assert.deepEqual(await (await request('/setup/status')).json(), { needsSetup: false })
  assert.equal(UserDAO.findAll().length, 1)
  const admin = UserDAO.findAll()[0]
  assert.match(admin.id, /^[0-9a-f-]{36}$/)
  const anonymous = await request('/session/me')
  assert.equal(anonymous.status, 200)
  assert.deepEqual(await anonymous.json(), { user: null, csrfToken: null })
  assert.equal((await request('/session/me', 'GET', undefined, undefined, { Cookie: 'blog_session=' })).status, 401)
  const credentials = { username: admin.username, password: 'test-password' }
  assert.equal((await request('/session/login', 'POST', credentials, undefined, { Origin: 'https://evil.test' })).status, 403)
  const login = await request('/session/login', 'POST', credentials)
  assert.equal(login.status, 200)
  assert.equal(login.headers.get('cache-control'), 'no-store')
  assert.match(login.headers.get('set-cookie'), /Secure/)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const session = await login.json()
  assert.deepEqual(session.user, { id: admin.id, username: admin.username, role: 'admin' })
  assert.equal(session.token, undefined)
  const me = await request('/session/me', 'GET', undefined, undefined, { Cookie: cookie })
  assert.equal(me.status, 200)
  assert.equal((await me.json()).csrfToken, session.csrfToken)
  assert.equal((await request('/session/logout', 'POST', {}, undefined, { Cookie: cookie })).status, 403)
  assert.equal((await request('/session/logout', 'POST', {}, undefined, { Cookie: cookie, 'X-CSRF-Token': session.csrfToken, Origin: 'https://evil.test' })).status, 403)
  assert.equal((await request('/session/logout', 'POST', {}, undefined, { Cookie: cookie, 'X-CSRF-Token': session.csrfToken })).status, 200)
  assert.equal((await request('/session/me', 'GET', undefined, undefined, { Cookie: cookie })).status, 401)
  const adminToken = `Bearer ${generateToken(admin)}`
  UserDAO.create({ id: 'legacy-user', username: 'reader', passwordHash: 'unused', role: 'user' })
  // Old versionless JWTs remain accepted at token_version=0.
  const { default: legacyJwt } = await import('jsonwebtoken')
  const versionless = legacyJwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET)
  assert.equal((await request('/auth/me', 'GET', undefined, `Bearer ${versionless}`)).status, 200)
  const userToken = `Bearer ${generateToken({ id: 'legacy-user', role: 'admin' })}`
  for (const route of ['/articles', '/upload']) {
    assert.equal((await request(route, 'POST', {}, 'Basic YWRtaW46YWRtaW4xMjM=')).status, 401)
    assert.equal((await request(route, 'POST', {}, userToken)).status, 403)
  }
  const create = await request('/articles', 'POST', { title: 'Published', slug: 'public', content: 'needle', status: 'published' }, adminToken)
  assert.equal(create.status, 201)
  const article = await create.json()
  assert.match(article.id, /^[0-9a-f-]{36}$/)
  ArticleDAO.create({ id: 'old-draft', title: 'Draft', slug: 'secret', content: 'needle', status: 'draft', publishDate: null, updateDate: null })
  for (const route of ['/articles/secret', '/articles/by-id/old-draft']) {
    assert.equal((await request(route)).status, 404)
    assert.equal((await request(route, 'GET', undefined, adminToken)).status, 200)
  }
  const adminList = await (await request('/articles?status=draft', 'GET', undefined, adminToken)).json()
  assert.equal(adminList.pagination.total, 1)
  assert.equal(adminList.data[0].id, 'old-draft')
  assert.equal((await (await request('/articles/stats/summary', 'GET', undefined, adminToken)).json()).total, 2)
  const list = await (await request('/articles?status=draft')).json()
  assert.equal(list.pagination.total, 1)
  assert.equal(list.data[0].id, article.id)
  const search = await (await request('/articles/search/advanced?q=needle')).json()
  assert.equal(search.pagination.total, 1)
  assert.equal((await (await request('/articles/stats/summary')).json()).total, 1)
  assert.equal((await request('/comments/old-draft', 'POST', { author: 'a', content: 'b' })).status, 404)
  assert.equal((await request(`/comments/${article.id}`, 'POST', { author: {}, content: 'b' })).status, 400)
  const payload = { author: 'visitor', content: '<script>alert(1)</script>' }
  const commentResponse = await request(`/comments/${article.id}`, 'POST', payload)
  assert.equal(commentResponse.status, 201)
  const comment = await commentResponse.json()
  assert.equal(comment.status, 'pending')
  assert.equal(comment.content, payload.content)
  assert.match(comment.id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(await (await request(`/comments/${article.id}`)).json(), [])
  for (let index = 0; index < 7; index++) await request(`/comments/${article.id}`, 'POST', payload)
  assert.equal((await request(`/comments/${article.id}`, 'POST', payload)).status, 429)
  assert.equal((await request('/logs/clear', 'POST', {}, userToken)).status, 403)
  assert.equal((await request('/logs', 'POST', { level: 'BAD', message: 'bad' }, adminToken)).status, 400)
  await assert.rejects(readFile(path.join(directory, 'app.log')), { code: 'ENOENT' })
  assert.equal((await request('/logs', 'POST', { level: 'INFO', message: 'ok\nstructured' }, adminToken)).status, 200)
  const lines = (await readFile(path.join(directory, 'app.log'), 'utf8')).trim().split('\n')
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse(lines[0]).message, 'ok\nstructured')
  assert.equal((await request('/telemetry', 'POST', { level: 'ERROR', message: 'client error' })).status, 202)
  for (const payload of [
    { level: 'INFO', message: 'x'.repeat(501) },
    { level: 'INFO', message: 'ok', data: 'x'.repeat(2001) },
    { level: 'INFO', message: 'ok', unexpected: true }
  ]) assert.equal((await request('/logs', 'POST', payload, adminToken)).status, 400)
  assert.equal((await request('/upload', 'POST', {}, adminToken)).status, 400)
  assert.equal((await request('/logs/clear', 'POST', {}, adminToken)).status, 200)
  assert.equal(await readFile(path.join(directory, 'app.log'), 'utf8'), '')
  const { default: jwt } = await import('jsonwebtoken')
  for (const token of [
    'garbage', jwt.sign({ id: admin.id }, 'wrong-secret'),
    jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: -1 }),
    jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { algorithm: 'HS384' }),
    jwt.sign({ id: 'nonexistent' }, process.env.JWT_SECRET),
    jwt.sign({ id: { invalid: true } }, process.env.JWT_SECRET)
  ]) {
    assert.equal((await request('/auth/me', 'GET', undefined, `Bearer ${token}`)).status, 401)
    assert.equal((await request('/articles/secret', 'GET', undefined, `Bearer ${token}`)).status, 404)
  }
  const { default: sharp } = await import('sharp')
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
  async function multipart(bytes, type, token, field = 'image') {
    const form = new FormData()
    form.append(field, new Blob([bytes], { type }), 'image.png')
    return fetch(`${base}/upload`, { method: 'POST', headers: token ? { Authorization: token } : {}, body: form })
  }
  const beforeFiles = await readdir(path.join(directory, 'uploads'))
  assert.equal((await multipart(image, 'image/png')).status, 401)
  assert.equal((await multipart(image, 'image/png', userToken)).status, 403)
  assert.equal((await multipart(image, 'text/html', adminToken)).status, 400)
  assert.equal((await multipart(Buffer.from('fake png'), 'image/png', adminToken)).status, 400)
  assert.equal((await multipart(image, 'image/png', adminToken, 'unexpected')).status, 400)
  assert.equal((await multipart(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', adminToken)).status, 400)
  assert.deepEqual(await readdir(path.join(directory, 'uploads')), beforeFiles)
  const uploaded = await multipart(image, 'image/png', adminToken)
  assert.equal(uploaded.status, 200)
  const uploadedBody = await uploaded.json()
  const metadata = await sharp(path.join(directory, 'uploads', path.basename(uploadedBody.url))).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 2)
  const malformed = await fetch(`${base}/upload`, { method: 'POST', headers: {
    Authorization: adminToken, 'Content-Type': 'multipart/form-data; boundary=missing'
  }, body: 'malformed' })
  assert.equal(malformed.status, 400)
  const oldToken = adminToken
  UserDAO.update(admin.id, { role: 'user' })
  assert.equal((await request('/articles', 'POST', {}, oldToken)).status, 403)
  UserDAO.delete(admin.id)
  assert.equal((await request('/auth/me', 'GET', undefined, oldToken)).status, 401)
})
