import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import bcrypt from 'bcrypt'

const directory = mkdtempSync(path.join(os.tmpdir(), 'blog-author-auth-'))
process.env.BLOG_DATA_DIR = directory
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'isolated-author-auth-test-secret-32-characters'
const { default: db, initDatabase } = await import('../server/db/index.js')
const { migrateAuthWorkspace } = await import('../server/db/migrations/authWorkspace.js')
const setup = await import('../server/services/setupService.js')
const sessions = await import('../server/services/sessionService.js')
const auth = await import('../server/middleware/auth.js')
const { default: sessionRouter } = await import('../server/routes/session.js')
const { default: setupRouter } = await import('../server/routes/setup.js')
const { default: legacyRouter } = await import('../server/routes/auth.js')
const { default: logger } = await import('../server/utils/logger.js')
initDatabase()
migrateAuthWorkspace(db)
migrateAuthWorkspace(db)
const app = express()
app.use(express.json())
app.use('/api/session', sessionRouter)
app.use('/api/setup', setupRouter)
app.use('/api/auth', legacyRouter)
app.get('/admin', auth.requireAdminSession, /* 返回受管理员会话保护的身份。 */ (req, res) => res.json(req.principal))
app.post('/write', auth.requireAdminSession, auth.requireCsrf, /* 返回通过会话及来源校验的写入结果。 */ (req, res) => res.json({ ok: true }))
const server = app.listen(0, '127.0.0.1')
await new Promise(/* 等待临时认证服务开始监听。 */ resolve => server.once('listening', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
/** 携带可选会话及来源头请求认证接口。 */
async function request(url, { method = 'GET', body, cookie, csrf, source = origin, bearer } = {}) {
  return fetch(origin + url, { method, headers: { ...(source ? { Origin: source } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
}
let user
let cookie
let csrf
let jwt

test('anonymous me is quiet while malformed cookies and protected routes still reject', /* 验证匿名查询与损坏会话的不同处理。 */ async () => {
  for (const cookie of [undefined, 'theme=dark', 'not_blog_session=garbage']) {
    const response = await request('/api/session/me', { cookie })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { user: null, csrfToken: null })
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(response.headers.get('x-robots-tag'), /noindex/)
  }
  assert.equal(sessions.readSessionToken({ headers: {} }), undefined)
  assert.equal(sessions.readSessionToken({ headers: { cookie: 'blog_session=' } }), null)
  for (const cookie of ['blog_session=', 'blog_session=broken', 'blog_session=' + '0'.repeat(64),
    'blog_session=one; blog_session=two']) {
    assert.equal((await request('/api/session/me', { cookie })).status, 401)
  }
  assert.equal((await request('/admin')).status, 401)
  assert.equal((await request('/write', { method: 'POST' })).status, 401)
})

test('invalid setup proofs reject before bcrypt work; proof is rechecked after hashing', /* 验证首装凭证在哈希前后均被检查。 */ async t => {
  const originalHash = bcrypt.hash
  const spy = t.mock.method(bcrypt, 'hash')
  const input = { username: 'owner', password: 'secret123' }
  const expired = setup.createSetupToken(Date.now() - 31 * 60 * 1000)
  for (const token of [undefined, '', 'invalid', '0'.repeat(64), expired]) {
    await assert.rejects(setup.completeSetup({ ...input, token }), { code: 'SETUP_DENIED' })
  }
  assert.equal(spy.mock.callCount(), 0)
  const token = setup.createSetupToken()
  spy.mock.mockImplementation(/* 在哈希期间轮换首装凭证以模拟竞态。 */ async (...args) => {
    const hash = await originalHash(...args)
    setup.createSetupToken() // Local operator rotates proof while bcrypt is running.
    return hash
  })
  await assert.rejects(setup.completeSetup({ ...input, token }), { code: 'SETUP_DENIED' })
  assert.equal(spy.mock.callCount(), 1)
  assert.equal(setup.setupStatus().needsSetup, true)
})

test('empty database cannot register remotely; setup proof is hashed, replaced, expired and atomic', /* 验证首装凭证生命周期及并发原子性。 */ async () => {
  assert.equal((await request('/api/auth/users', { method: 'POST', body: { username: 'attacker', password: 'secret123' } })).status, 401)
  assert.deepEqual(await (await request('/api/setup/status')).json(), { needsSetup: true })
  const expired = setup.createSetupToken(Date.now() - 31 * 60 * 1000)
  await assert.rejects(setup.completeSetup({ username: 'owner', password: 'secret123', token: expired }), { code: 'SETUP_DENIED' })
  const old = setup.createSetupToken()
  const token = setup.createSetupToken()
  assert.notEqual(db.prepare('SELECT token_hash FROM setup_tokens').get().token_hash, token)
  await assert.rejects(setup.completeSetup({ username: 'owner', password: 'secret123', token: old }))
  const results = await Promise.allSettled([1, 2].map(/* 并发使用同一凭证尝试首装。 */ () => setup.completeSetup({ username: 'owner', password: 'secret123', token })))
  assert.equal(results.filter(/* 统计成功完成首装的请求。 */ r => r.status === 'fulfilled').length, 1)
  user = results.find(/* 取得唯一成功创建的管理员。 */ r => r.status === 'fulfilled').value
  assert.equal(user.role, 'admin')
  assert.equal(db.prepare('SELECT count(*) n FROM users').get().n, 1)
  assert.ok(db.prepare('SELECT consumed_at FROM setup_tokens').get().consumed_at)
  await assert.rejects(setup.initializeLocalAdmin({ username: 'other', password: 'secret123' }))
})

test('setup HTTP denies missing proof and trusted CLI shares atomic rollback', /* 验证首装接口拒绝及本机初始化事务回滚。 */ async () => {
  assert.equal((await request('/api/setup/complete', { method: 'POST', body: { username: 'new', password: 'secret123' } })).status, 403)
  const original = db.prepare('SELECT * FROM users WHERE id=?').get(user.id)
  db.prepare('DELETE FROM users').run()
  const token = setup.createSetupToken()
  db.exec("CREATE TRIGGER fail_setup BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
  await assert.rejects(setup.completeSetup({ username: 'new', password: 'secret123', token }))
  assert.equal(setup.setupStatus().needsSetup, true)
  assert.equal(db.prepare('SELECT consumed_at FROM setup_tokens').get().consumed_at, null)
  db.exec('DROP TRIGGER fail_setup')
  const local = await setup.initializeLocalAdmin({ username: 'local', password: 'secret123' })
  assert.equal(local.role, 'admin')
  assert.ok(db.prepare('SELECT consumed_at FROM setup_tokens').get().consumed_at)
  db.prepare('DELETE FROM users').run()
  db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at,token_version) VALUES(?,?,?,?,?,?,?)')
    .run(original.id, original.username, original.password_hash, original.role, original.created_at, original.updated_at, original.token_version)
})

test('initialized setup rejects before hashing for browser and trusted CLI', /* 验证已初始化时无需密码哈希即拒绝首装。 */ async t => {
  const spy = t.mock.method(bcrypt, 'hash')
  for (const initialize of [setup.completeSetup, setup.initializeLocalAdmin]) {
    await assert.rejects(initialize({ username: 'other', password: 'secret123', token: '0'.repeat(64) }), { code: 'SETUP_DENIED' })
  }
  assert.equal(spy.mock.callCount(), 0)
})

test('legacy credentials reject bcrypt truncation while accepting valid existing passwords', /* 验证旧认证拒绝超长密码且兼容合法密码。 */ async () => {
  for (const password of ['x'.repeat(73), '密'.repeat(25)]) {
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'owner', password } })).status, 400)
    const bearer = auth.generateToken(user)
    assert.equal((await request('/api/auth/users', { method: 'POST', bearer, body: { username: 'new', password } })).status, 400)
  }
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'secret123' } })).status, 200)
})

test('login origin, cookie policy, no JWT and session-only admin boundary', /* 验证来源、会话 Cookie 和管理员权限边界。 */ async () => {
  assert.equal((await request('/api/session/login', { method: 'POST', source: 'https://evil.test', body: { username: 'owner', password: 'secret123' } })).status, 403)
  const response = await request('/api/session/login', { method: 'POST', body: { username: 'owner', password: 'secret123' } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const setCookie = response.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Lax/)
  cookie = setCookie.split(';')[0]
  const body = await response.json()
  csrf = body.csrfToken
  assert.equal(body.token, undefined)
  assert.equal(body.user.id, user.id)
  assert.notEqual(db.prepare('SELECT token_hash FROM sessions').get().token_hash, cookie.split('=')[1])
  jwt = auth.generateToken(user)
  assert.equal((await request('/admin', { bearer: jwt })).status, 401)
  assert.equal((await request('/admin', { cookie })).status, 200)
  const me = await (await request('/api/session/me', { cookie })).json()
  assert.equal(me.csrfToken, csrf)
  assert.equal((await request('/write', { method: 'POST', cookie, csrf })).status, 200)
  for (const options of [{ cookie }, { cookie, csrf: 'é'.repeat(64) }, { cookie, csrf, source: 'https://evil.test' }, { cookie, csrf, source: null }]) {
    assert.equal((await request('/write', { method: 'POST', ...options })).status, 403)
  }
  const second = sessions.createSession(user.id)
  assert.equal((await request('/write', { method: 'POST', cookie, csrf: second.csrfToken })).status, 403)
  db.prepare("UPDATE users SET role='user' WHERE id=?").run(user.id)
  assert.equal((await request('/admin', { cookie })).status, 403)
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id)
})

test('idle/absolute expiry, prefix cookie and session rotation', /* 验证会话过期、路径前缀及令牌轮换。 */ async () => {
  const expired = sessions.createSession(user.id)
  db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(Date.now() - 1, sessions.hashToken(expired.token))
  assert.equal((await request('/api/session/me', { cookie: `blog_session=${expired.token}` })).status, 401)
  const idle = sessions.createSession(user.id)
  assert.equal(sessions.resolveSession(idle.token, Date.now() + sessions.IDLE_MS + 1), null)
  const absolute = sessions.createSession(user.id)
  db.prepare('UPDATE sessions SET last_used_at=? WHERE token_hash=?').run(Date.now() + sessions.ABSOLUTE_MS, sessions.hashToken(absolute.token))
  assert.equal(sessions.resolveSession(absolute.token, Date.now() + sessions.ABSOLUTE_MS + 1), null)
  const rotated = sessions.createSession(user.id, cookie.split('=')[1])
  assert.equal(sessions.resolveSession(cookie.split('=')[1]), null)
  cookie = `blog_session=${rotated.token}`
  csrf = rotated.csrfToken
  process.env.VITE_BASE_PATH = '/blog/'
  assert.equal(sessions.cookieOptions().path, '/blog/')
  process.env.NODE_ENV = 'production'
  assert.equal(sessions.cookieOptions().secure, true)
  process.env.NODE_ENV = 'test'
  delete process.env.VITE_BASE_PATH
})

test('Secure cookie defaults and explicit local HTTP override', /* 验证安全 Cookie 默认值与本机覆盖配置。 */ () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalOverride = process.env.SESSION_COOKIE_SECURE
  try {
    delete process.env.SESSION_COOKIE_SECURE
    process.env.NODE_ENV = 'production'
    assert.equal(sessions.cookieOptions().secure, true)
    process.env.SESSION_COOKIE_SECURE = 'false'
    assert.equal(sessions.cookieOptions().secure, false)
    process.env.SESSION_COOKIE_SECURE = 'true'
    assert.equal(sessions.cookieOptions().secure, true)
    process.env.SESSION_COOKIE_SECURE = 'invalid'
    assert.equal(sessions.cookieOptions().secure, true)
    process.env.NODE_ENV = 'test'
    delete process.env.SESSION_COOKIE_SECURE
    assert.equal(sessions.cookieOptions().secure, false)
    process.env.SESSION_COOKIE_SECURE = 'true'
    assert.equal(sessions.cookieOptions().secure, true)
    process.env.SESSION_COOKIE_SECURE = 'false'
    assert.equal(sessions.cookieOptions().secure, false)
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalOverride === undefined) delete process.env.SESSION_COOKIE_SECURE
    else process.env.SESSION_COOKIE_SECURE = originalOverride
  }
})

test('password verifies old secret, revokes all sessions and legacy JWT; logout revokes current', /* 验证修改密码与退出撤销相应凭据。 */ async () => {
  assert.equal((await request('/api/session/password', { method: 'POST', cookie, csrf, body: { oldPassword: 'wrong', newPassword: 'new-secret' } })).status, 403)
  assert.equal((await request('/api/auth/me', { bearer: jwt })).status, 200)
  assert.equal((await request('/api/session/password', { method: 'POST', cookie, csrf, body: { oldPassword: 'secret123', newPassword: 'new-secret' } })).status, 200)
  assert.equal((await request('/api/session/me', { cookie })).status, 401)
  assert.equal((await request('/api/auth/refresh', { method: 'POST', bearer: jwt })).status, 401)
  const response = await request('/api/session/login', { method: 'POST', body: { username: 'owner', password: 'new-secret' } })
  assert.equal(response.status, 200)
  cookie = response.headers.get('set-cookie').split(';')[0]
  csrf = (await response.json()).csrfToken
  assert.equal((await request('/api/session/logout', { method: 'POST', cookie, csrf })).status, 200)
  assert.equal((await request('/api/session/me', { cookie })).status, 401)
  process.env.LEGACY_JWT_ENABLED = 'false'
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'new-secret' } })).status, 401)
  delete process.env.LEGACY_JWT_ENABLED
})

test('password change committed before bcrypt returns cannot mint JWT or session', /* 验证密码变更竞态阻止旧密码签发凭据。 */ async t => {
  for (const [index, route] of ['/api/auth/login', '/api/session/login'].entries()) {
    const id = `login-race-${index}`
    const passwordHash = await bcrypt.hash('race-old', 10)
    db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(id, id, passwordHash, 'admin', Date.now(), Date.now())
    const priorSession = sessions.createSession(id)
    const priorToken = auth.generateToken({ id, username: id, role: 'admin' })
    const compare = bcrypt.compare
    let passwordChangeCommitted = false
    const spy = t.mock.method(bcrypt, 'compare', /* 在登录比较返回前提交真实密码变更。 */ async (...args) => {
      const valid = await compare(...args)
      if (!passwordChangeCommitted) {
        passwordChangeCommitted = true
        // The password change uses the real service, including version bump and
        // revocation, before the outstanding login receives its successful comparison.
        await sessions.changePassword(id, 'race-old', 'race-new')
        assert.equal(db.inTransaction, false)
      }
      return valid
    })
    let response
    try {
      response = await request(route, { method: 'POST', body: { username: id, password: 'race-old' } })
    } finally { spy.mock.restore() }
    assert.equal(passwordChangeCommitted, true)
    assert.equal(response.status, 401, route)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal((await response.json()).token, undefined)
    assert.equal(db.prepare('SELECT count(*) n FROM sessions WHERE user_id=? AND revoked_at IS NULL').get(id).n, 0)
    assert.equal(sessions.resolveSession(priorSession.token), null)
    assert.equal((await request('/api/auth/me', { bearer: priorToken })).status, 401)
    const fresh = await request(route, { method: 'POST', body: { username: id, password: 'race-new' } })
    assert.equal(fresh.status, 200)
    db.prepare('DELETE FROM users WHERE id=?').run(id)
  }
})

test('setup completion has independent per-IP throttling with Retry-After', /* 验证首装接口独立限流及重试提示。 */ async () => {
  let response
  for (let index = 0; index < 11; index++) {
    response = await request('/api/setup/complete', { method: 'POST', body: { username: `attempt-${index}`, password: 'secret123' } })
  }
  assert.equal(response.status, 429)
  assert.ok(Number(response.headers.get('retry-after')) > 0)
  assert.equal((await response.json()).error.code, 'RATE_LIMITED')
  assert.equal((await request('/api/setup/status')).status, 200)
})

after(/* 关闭认证服务并清理隔离数据。 */ async () => {
  await new Promise(/* 等待认证服务关闭连接。 */ resolve => server.close(resolve))
  db.close()
  await new Promise(/* 等待日志写入完成。 */ resolve => logger.end(resolve))
  rmSync(directory, { recursive: true, force: true })
})
