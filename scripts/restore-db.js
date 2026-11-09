import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { validateDatabase, syncFile } from './backup-db.js'

// Restore only into a NEW directory; never overwrite a running database/WAL.
export async function restoreDatabase(snapshot, directory) {
  if (!snapshot || !directory) throw new Error('用法: node scripts/restore-db.js <快照文件> <全新恢复目录>')
  validateDatabase(snapshot)
  directory = path.resolve(directory)
  await fs.mkdir(directory, { mode: 0o700 })
  const destination = path.join(directory, 'blog.db')
  const temporary = path.join(directory, `.restore-${randomUUID()}.tmp`)
  try {
    await fs.copyFile(snapshot, temporary, 1)
    await fs.chmod(temporary, 0o600)
    validateDatabase(temporary)
    await syncFile(temporary)
    await fs.rename(temporary, destination)
    await syncFile(directory)
    return destination
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  restoreDatabase(...process.argv.slice(2)).then(filename => console.log(`恢复完成: ${filename}`)).catch(error => {
    console.error(`恢复失败: ${error.message}`)
    process.exitCode = 1
  })
}
