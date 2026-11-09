import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'

const script = fileURLToPath(new URL('../scripts/init-admin.js', import.meta.url))
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'blog-init-admin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function run(root, username, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--non-interactive', '--username', username], {
      cwd: root, env: { ...process.env, BLOG_DATA_DIR: path.join(root, 'data'),
        BLOG_LOG_DIR: path.join(root, 'logs'), NODE_ENV: 'production',
        ADMIN_PASSWORD: 'fixture-password', ...extra }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.once('error', reject)
    child.once('close', code => resolve({ code, output }))
  })
}

test('noninteractive initialization uses shared schema, UUID, and never resets existing accounts', async t => {
  const root = await fixture(t)
  const result = await run(root, 'first')
  assert.equal(result.code, 0, result.output)
  assert.ok(!result.output.includes('fixture-password'))
  const db = new Database(path.join(root, 'data', 'blog.db'))
  try {
    const user = db.prepare('SELECT * FROM users').get()
    assert.equal(user.role, 'admin')
    assert.equal(user.token_version, 0)
    for (const table of ['sessions', 'setup_tokens']) {
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))
    }
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.ok(await bcrypt.compare('fixture-password', user.password_hash))
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'").get())
    for (const name of ['first', 'another']) {
      const repeat = await run(root, name, { ADMIN_PASSWORD: 'different-password' })
      assert.equal(repeat.code, 1, repeat.output)
      assert.match(repeat.output, /已有用户|已初始化/)
      assert.deepEqual(db.prepare('SELECT * FROM users').all(), [user])
    }
  } finally { db.close() }
})

test('two noninteractive processes create only one first administrator', async t => {
  const root = await fixture(t)
  const results = await Promise.all([run(root, 'one'), run(root, 'two')])
  assert.deepEqual(results.map(result => result.code).sort(), [0, 1], JSON.stringify(results))
  const db = new Database(path.join(root, 'data', 'blog.db'))
  try { assert.equal(db.prepare('SELECT COUNT(*) AS total FROM users').get().total, 1) }
  finally { db.close() }
})

test('dotenv is loaded before shared database resolution', async t => {
  const root = await fixture(t)
  const target = path.join(root, 'dotenv-data')
  await writeFile(path.join(root, '.env'), `BLOG_DATA_DIR=${target}\nADMIN_PASSWORD=dotenv-password\n`)
  const result = await run(root, 'dotenv-admin', { BLOG_DATA_DIR: '', ADMIN_PASSWORD: '',
    DOTENV_CONFIG_OVERRIDE: 'true' })
  assert.equal(result.code, 0, result.output)
  const db = new Database(path.join(target, 'blog.db'), { readonly: true, fileMustExist: true })
  try { assert.equal(db.prepare('SELECT username FROM users').get().username, 'dotenv-admin') }
  finally { db.close() }
})
