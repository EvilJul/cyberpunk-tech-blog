import { setTimeout } from 'node:timers/promises'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { backupDatabase, dataDir } from './backup-db.js'

async function record(level, message) {
  const directory = path.join(dataDir(), 'logs')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message })
  await fs.appendFile(path.join(directory, 'backup.log'), `${line}\n`, { mode: 0o600 })
  console[level === 'error' ? 'error' : 'log'](line)
}

// Immediate first snapshot, then daily. Exit on failure so the supervisor reports/retries it.
try {
  while (true) {
    await record('info', `备份完成: ${await backupDatabase()}`)
    await setTimeout(86400000)
  }
} catch (error) {
  try { await record('error', `每日备份失败: ${error.message}`) }
  catch (logError) { console.error(`备份失败: ${error.message}; 日志写入失败: ${logError.message}`) }
  process.exitCode = 1
}
