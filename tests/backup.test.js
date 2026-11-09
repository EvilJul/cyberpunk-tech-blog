import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { backupDatabase, validateDatabase } from '../scripts/backup-db.js'
import { restoreDatabase } from '../scripts/restore-db.js'

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolg-backup-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'blog.db')
  const db = new Database(source)
  t.after(() => db.close())
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, content TEXT); INSERT INTO events VALUES (1, \'已提交\')')
  return { root, source, db, directory: path.join(root, 'backups') }
}

test('online WAL snapshot during writes restores committed data into a fresh directory', async t => {
  const { root, source, db, directory } = await fixture(t)
  // More than one backup step: interleave committed writes while backup is yielding.
  const insert = db.prepare('INSERT INTO events(content) VALUES (?)')
  db.transaction(() => { for (let i = 0; i < 2000; i++) insert.run('x'.repeat(1000)) })()
  let writes = 0
  const writer = setInterval(() => { insert.run('concurrent'); writes++ }, 1)
  let snapshot
  try { snapshot = await backupDatabase({ source, directory }) } finally { clearInterval(writer) }
  assert.ok(writes > 0, 'writer ran while asynchronous backup was active')
  validateDatabase(snapshot)
  const restored = await restoreDatabase(snapshot, path.join(root, 'restored'))
  const read = new Database(restored, { readonly: true })
  try {
    assert.equal(read.prepare('SELECT content FROM events WHERE id=1').get().content, '已提交')
    assert.ok(read.prepare('SELECT COUNT(*) AS n FROM events').get().n >= 2001)
  } finally { read.close() }
  await assert.rejects(restoreDatabase(snapshot, path.join(root, 'restored')), /EEXIST/)
  assert.equal((await fs.readdir(directory)).filter(n => n.endsWith('.tmp')).length, 0)
})

test('rotation removes only expired tool-owned regular files, after successful backup', async t => {
  const { root, source, directory } = await fixture(t)
  const old = await backupDatabase({ source, directory, now: new Date('2020-01-01T00:00:00Z') })
  const recent = await backupDatabase({ source, directory, now: new Date('2020-01-07T00:00:00Z') })
  const unrelated = path.join(directory, 'notes.db')
  await fs.writeFile(unrelated, 'keep')
  const link = path.join(directory, 'blog-2010-01-01T00-00-00-000Z-00000000-0000-0000-0000-000000000000.db')
  await fs.symlink(source, link)
  await backupDatabase({ source, directory, now: new Date('2020-01-10T00:00:00Z') })
  await assert.rejects(fs.stat(old), /ENOENT/)
  await fs.stat(recent)
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'keep')
  assert.ok((await fs.lstat(link)).isSymbolicLink())
  await assert.rejects(backupDatabase({ source: path.join(root, 'missing.db'), directory }))
  await fs.stat(recent)
})

test('invalid snapshot fails before restore directory creation', async t => {
  const { root } = await fixture(t)
  const corrupt = path.join(root, 'corrupt.db')
  await fs.writeFile(corrupt, 'broken')
  const destination = path.join(root, 'invalid-restore')
  await assert.rejects(restoreDatabase(corrupt, destination))
  await assert.rejects(fs.stat(destination), /ENOENT/)
})

test('rotation never removes source even if it has an expired backup name', async t => {
  const { root, source } = await fixture(t)
  const directory = path.join(root, 'same-directory')
  await fs.mkdir(directory)
  const namedSource = path.join(directory, 'blog-2000-01-01T00-00-00-000Z-00000000-0000-0000-0000-000000000000.db')
  const original = new Database(source, { readonly: true })
  try { await original.backup(namedSource) } finally { original.close() }
  await backupDatabase({ source: namedSource, directory })
  validateDatabase(namedSource)
})

test('daily worker persists a failed backup record and exits nonzero', async t => {
  const { spawn } = await import('node:child_process')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolg-backup-worker-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const worker = spawn(process.execPath, ['scripts/backup-daemon.js'], {
    env: { ...process.env, BLOG_DATA_DIR: root, BLOG_BACKUP_DIR: path.join(root, 'backups') },
    stdio: 'ignore'
  })
  const code = await new Promise((resolve, reject) => { worker.on('error', reject); worker.on('exit', resolve) })
  assert.equal(code, 1)
  const log = JSON.parse((await fs.readFile(path.join(root, 'logs', 'backup.log'), 'utf8')).trim())
  assert.equal(log.level, 'error')
  assert.match(log.message, /每日备份失败/)
})
