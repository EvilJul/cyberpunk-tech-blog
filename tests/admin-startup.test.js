import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

test('standalone admin initializes fresh database and stops gracefully', { timeout: 15000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'admin-startup-'))
  const child = spawn(process.execPath, ['server/index-admin.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, BLOG_DATA_DIR: dir, ADMIN_PORT: '0', ADMIN_HOST: '127.0.0.1', JWT_SECRET: 'startup-fixture-secret-at-least-32-chars', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  t.after(async () => { if (child.exitCode === null) child.kill('SIGKILL'); await rm(dir, { recursive: true, force: true }) })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  await new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk
      if (output.includes('管理服务器运行在 http://127.0.0.1:0')) resolve()
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`admin exited before startup: ${code}`)))
  })
  child.kill('SIGTERM')
  assert.deepEqual(await exited, { code: 0, signal: null })
  const db = new Database(join(dir, 'blog.db'), { readonly: true })
  try {
    assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count, 0)
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  } finally { db.close() }
})
