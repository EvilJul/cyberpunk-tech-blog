import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import jwt from 'jsonwebtoken'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Configure isolation before importing auth (which opens the database).
const dataDir = await mkdtemp(join(tmpdir(), 'admin-test-'))
process.env.BLOG_DATA_DIR = dataDir
process.env.JWT_SECRET = 'admin-fixture-secret-at-least-32-characters'
process.env.NODE_ENV = 'production'
const { createAdminApp } = await import('../server/index-admin.js')
const { default: db, initDatabase } = await import('../server/db/index.js')
const { generateToken } = await import('../server/middleware/auth.js')
initDatabase()
const { UserDAO } = await import('../server/db/otherDAO.js')
for (const role of ['admin', 'user']) UserDAO.create({ id: role, username: role, passwordHash: 'fixture', role })
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)))
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })

test('admin security and lossless streaming proxy', async t => {
  let uploaded
  const upstreamApp = express()
  // Use real auth policy for account endpoints; other routes remain streaming fixtures.
  upstreamApp.use('/api/auth', express.json(), (await import('../server/routes/auth.js')).default)
  const upstream = http.createServer(upstreamApp)
  upstreamApp.use(async (req, res) => {
    if (req.url.includes('slow')) return
    if (req.url.includes('upload')) {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      uploaded = { body: Buffer.concat(chunks).toString(), type: req.headers['content-type'] }
      res.setHeader('Content-Type', 'application/json')
      return res.end('{"url":"/uploads/fixture.jpg"}')
    }
    if (req.url.includes('plain')) { res.writeHead(418, { 'Content-Type': 'text/plain' }); return res.end('upstream text') }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data: [], pagination: { page: 2, total: 31, total_pages: 4 }, url: req.url }))
  })
  const apiUrl = await listen(upstream)
  const server = createAdminApp({ apiUrl, timeout: 80 }).listen()
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = { Authorization: `Bearer ${generateToken({ id: 'admin', role: 'admin' })}` }
  t.after(async () => { await close(server); await close(upstream); db.close(); await rm(dataDir, { recursive: true, force: true }) })
  const staticResponse = await fetch(base)
  assert.equal(staticResponse.headers.get('x-powered-by'), null)
  assert.match(staticResponse.headers.get('content-security-policy'), /script-src 'self';/)
  assert.match(staticResponse.headers.get('content-security-policy'), /script-src-attr 'none'/)
  assert.equal(staticResponse.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await fetch(base + '/api/articles')).status, 401)
  assert.equal((await fetch(base + '/api/articles', { headers: { Authorization: `Bearer ${generateToken({ id: 'user', role: 'admin' })}` } })).status, 403)
  assert.equal((await fetch(base + '/api/articles', { headers: { Authorization: 'Bearer expired' } })).status, 401)
  assert.equal((await fetch(base + '/api/articles', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403)
  const allowed = await fetch(base + '/api/articles?page=2', { headers: { ...headers, Origin: 'http://localhost:3033' } })
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3033')
  assert.equal((await allowed.json()).pagination.total, 31)
  assert.equal((await fetch(base + '/api/auth/login', { method: 'POST' })).status, 400)
  assert.equal((await fetch(base + '/api/auth/users', { method: 'POST' })).status, 401)
  const fresh = generateToken({ id: 'admin', role: 'admin' })
  db.prepare('UPDATE users SET token_version=token_version+1 WHERE id=?').run('admin')
  assert.equal((await fetch(base + '/api/articles', { headers: { Authorization: `Bearer ${fresh}` } })).status, 401)
  headers.Authorization = `Bearer ${generateToken({ id: 'admin', role: 'admin' })}`
  const expired = jwt.sign({ id: 'admin' }, process.env.JWT_SECRET, { expiresIn: -1 })
  assert.equal((await fetch(base + '/api/articles', { headers: { Authorization: `Bearer ${expired}` } })).status, 401)
  const plain = await fetch(base + '/api/plain', { headers })
  assert.equal(plain.status, 418)
  assert.match(plain.headers.get('content-type'), /text\/plain/)
  assert.equal(await plain.text(), 'upstream text')
  const body = '--fixture\r\nContent-Disposition: form-data; name="image"; filename="x.png"\r\n\r\nbytes\r\n--fixture--'
  assert.equal((await fetch(base + '/api/upload?type=avatar', { method: 'POST', headers: { ...headers, 'Content-Type': 'multipart/form-data; boundary=fixture' }, body })).status, 200)
  assert.deepEqual(uploaded, { body, type: 'multipart/form-data; boundary=fixture' })
  assert.equal((await fetch(base + '/api/slow', { headers })).status, 504)
  await close(upstream)
  assert.equal((await fetch(base + '/api/articles', { headers })).status, 502)
})
