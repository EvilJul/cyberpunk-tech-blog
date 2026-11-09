// 使用：BLOG_DATA_DIR=/path/to/data node scripts/migrate-stats.js [stats.json]
import db from '../server/db/index.js'
import { migrateStats } from '../server/db/migrateStats.js'

try {
  console.log(JSON.stringify(await migrateStats(process.argv[2]), null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db.close()
}
