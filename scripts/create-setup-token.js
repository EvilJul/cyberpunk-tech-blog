#!/usr/bin/env node
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import db, { initDatabase } from '../server/db/index.js'
import { migrateAuthWorkspace } from '../server/db/migrations/authWorkspace.js'
import { createSetupToken } from '../server/services/setupService.js'
import logger from '../server/utils/logger.js'
try {
  initDatabase()
  migrateAuthWorkspace(db)
  const token = createSetupToken()
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 2 || args[0] !== '--output'))
    throw new Error(
      '用法: node scripts/create-setup-token.js [--output 新文件路径]'
    )
  if (args[0] === '--output') {
    writeFileSync(args[1], `${token}\n`, { mode: 0o600, flag: 'wx' })
    console.log('初始化凭据已写入指定文件，30分钟有效。')
  } else console.log(token)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db.close()
  await new Promise(/* 等待日志流结束后退出初始化凭据脚本。 */ (resolve) => logger.end(resolve))
}
