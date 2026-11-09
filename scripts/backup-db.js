import 'dotenv/config'
import Database from 'better-sqlite3'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const defaultData = fileURLToPath(new URL('../server/data/', import.meta.url))
export const dataDir = () => path.resolve(process.env.BLOG_DATA_DIR || defaultData)
const backupPattern = /^blog-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-[0-9a-f-]{36}\.db$/

export function validateDatabase(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const result = db.pragma('integrity_check')
    if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('数据库完整性校验失败')
    if (db.pragma('foreign_key_check').length) throw new Error('数据库外键校验失败')
  } finally { db.close() }
}

export async function syncFile(filename) {
  const handle = await fs.open(filename, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

export async function backupDatabase({ source = path.join(dataDir(), 'blog.db'), directory = process.env.BLOG_BACKUP_DIR || path.join(dataDir(), 'backups'), now = new Date() } = {}) {
  directory = path.resolve(directory)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const stamp = now.toISOString().replaceAll(':', '-').replace('.', '-')
  const destination = path.join(directory, `blog-${stamp}-${randomUUID()}.db`)
  const temporary = `${destination}.tmp`
  const sourceDb = new Database(source, { readonly: true, fileMustExist: true })
  try {
    await sourceDb.backup(temporary)
    await fs.chmod(temporary, 0o600)
    validateDatabase(temporary)
    await syncFile(temporary)
    await fs.rename(temporary, destination)
    await syncFile(directory)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  } finally { sourceDb.close() }

  // Only this tool's regular files in this exact directory are eligible.
  const cutoff = now.getTime() - 7 * 86400000
  const sourcePath = await fs.realpath(source)
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const match = backupPattern.exec(entry.name)
    if (!entry.isFile() || !match) continue
    if (await fs.realpath(path.join(directory, entry.name)) === sourcePath) continue
    const date = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z')
    if (Date.parse(date) < cutoff) await fs.unlink(path.join(directory, entry.name))
  }
  return destination
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backupDatabase().then(filename => console.log(`备份完成: ${filename}`)).catch(error => {
    console.error(`备份失败: ${error.message}`)
    process.exitCode = 1
  })
}
