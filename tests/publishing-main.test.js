import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import sharp from 'sharp'
import { startFixture } from './helpers/server.js'

test('single-origin application: browser-managed integrations and publishing target interoperate', { timeout: 30000 }, /* 验证同源管理会话与机器发布接口互通。 */ async t => {
  const fixture = await startFixture(t, 'server/index.js', { PUBLISHING_API_ENABLED: 'true', SESSION_COOKIE_SECURE: 'false', VITE_BASE_PATH: '/', PUBLIC_ORIGIN: '' })
  execFileSync(process.execPath, ['scripts/init-admin.js', '--username', 'publishing-owner', '--non-interactive'], { env: { ...process.env, BLOG_DATA_DIR: fixture.root, BLOG_LOG_DIR: join(fixture.root, 'logs'), ADMIN_PASSWORD: 'Publishing-fixture-only-password', NODE_ENV: 'test' }, stdio: 'pipe' })
  const base = fixture.base
  const login = await fetch(base + '/api/session/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'publishing-owner', password: 'Publishing-fixture-only-password' }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const auth = await login.json()
  /** 携带会话与版本条件请求工作台接口。 */
  async function studio(path, method = 'GET', body, revision) {
    const response = await fetch(base + '/api/studio' + path, { method, headers: { Cookie: cookie, Origin: base, 'X-CSRF-Token': auth.csrfToken, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(revision ? { 'If-Match': `"${revision}"` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { response, body: await response.json() }
  }
  const created = await studio('/integrations', 'POST', { name: '内容中台验收' })
  assert.equal(created.response.status, 201)
  const integration = created.body.data.id
  const credential = await studio(`/integrations/${integration}/keys`, 'POST', { scopes: ['articles:read', 'articles:write', 'articles:publish', 'media:write'] })
  assert.equal(credential.response.status, 201)
  let key = credential.body.data.key
  /** 携带集成凭据及幂等条件请求发布接口。 */
  async function machine(path, method = 'GET', body, condition, idempotency) {
    const response = await fetch(base + '/api/v1' + path, { method, headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(condition ? condition : {}), ...(idempotency ? { 'Idempotency-Key': idempotency } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { response, body: await response.json() }
  }
  assert.equal((await machine('/connection')).response.status, 200)
  const payload = { title: '中台首篇文章', body_markdown: '# 原始 Markdown\n\n正文', slug: 'integration-main', tags: ['集成标签'] }
  const draft = await machine('/articles/by-external-id/main-001', 'PUT', payload, { 'If-None-Match': '*' }, 'create-main-001')
  assert.equal(draft.response.status, 201, JSON.stringify(draft.body))
  const id = draft.body.data.id
  assert.equal((await fetch(base + '/api/articles/integration-main')).status, 404)
  const replay = await machine('/articles/by-external-id/main-001', 'PUT', payload, { 'If-None-Match': '*' }, 'create-main-001')
  assert.equal(replay.body.data.id, id)
  assert.equal(replay.response.headers.get('Idempotency-Replayed'), 'true')
  const published = await machine(`/articles/${id}/publish`, 'POST', undefined, { 'If-Match': draft.response.headers.get('etag') }, 'publish-main-001')
  assert.equal(published.response.status, 200, JSON.stringify(published.body))
  assert.equal((await (await fetch(base + '/api/articles/integration-main')).json()).content, payload.body_markdown)
  const working = await studio(`/articles/${id}`)
  assert.equal(working.response.status, 200)
  const saved = await studio(`/articles/${id}/draft`, 'PUT', { content: '本地修改的草稿' }, working.body.revision)
  assert.equal(saved.response.status, 200)
  assert.equal((await (await fetch(base + '/api/articles/integration-main')).json()).content, payload.body_markdown)
  assert.equal((await machine(`/articles/${id}`, 'PATCH', { excerpt: '过期同步' }, { 'If-Match': published.response.headers.get('etag') }, 'stale-main-001')).response.status, 412)
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#69a5b3' } }).png().toBuffer()
  const form = new FormData(); form.append('file', new Blob([image], { type: 'image/png' }), 'fixture.png')
  const media = await fetch(base + '/api/v1/media', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Idempotency-Key': 'media-main-001' }, body: form })
  assert.equal(media.status, 201)
  const uploaded = (await media.json()).data
  assert.equal((await fetch(base + uploaded.url)).status, 200)
  const rotated = await studio(`/integrations/${integration}/keys/${credential.body.data.key_id}/rotate`, 'POST', {})
  assert.equal(rotated.response.status, 200)
  assert.equal((await machine('/connection')).response.status, 401)
  key = rotated.body.data.key
  const mapped = await machine('/articles?external_id=main-001')
  assert.equal(mapped.body.data[0].id, id)
  const revoked = await studio(`/integrations/${integration}/keys/${rotated.body.data.key_id}/revoke`, 'POST', {})
  assert.equal(revoked.response.status, 200)
  assert.equal((await machine('/connection')).response.status, 401)
  const log = await studio(`/integrations/${integration}/audit`)
  assert.ok(log.body.data.length >= 4)
  assert.ok(!JSON.stringify(log.body).includes(key))
  assert.equal((await fetch(base + '/api/studio/articles', { headers: { Authorization: `Bearer ${key}` } })).status, 401)
})

test('v1 pre-router origin errors keep the private protocol even in development', /* 验证前置跨域拒绝不会泄露开发堆栈或失去私有响应头。 */ async t => {
  const fixture = await startFixture(t, 'server/index.js', { NODE_ENV: 'test', PUBLISHING_API_ENABLED: 'true', VITE_BASE_PATH: '/blog/' })
  const response = await fetch(fixture.base + '/blog/api/v1/connection', { headers: { Origin: 'https://untrusted.example' } })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.error.code, 'ORIGIN_REJECTED')
  assert.equal(body.error.details, null)
  assert.equal(body.request_id, response.headers.get('x-request-id'))
  assert.ok(body.request_id)
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'details', 'message'])
})
