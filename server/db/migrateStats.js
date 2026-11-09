import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import db, { dataDir, initDatabase } from './index.js'

const version = 'legacy-stats-json-v1'
const count = value => Number.isSafeInteger(value) && value >= 0

// 显式调用；启动服务绝不读取旧 JSON。
export async function migrateStats(source = path.join(dataDir, 'stats.json')) {
  // 标记是迁移完成的唯一依据；不要求源文件仍存在、有效或未变更。
  const hasMigrations = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()
  if (hasMigrations) {
    const applied = db.prepare('SELECT details FROM schema_migrations WHERE version = ?').get(version)
    if (applied) return { skipped: true, backupDir: JSON.parse(applied.details).backupDir }
  }
  const stamp = Date.now() + '-' + randomUUID()
  const backupDir = path.join(dataDir, 'migration-backups', stamp)
  fs.mkdirSync(backupDir, { recursive: true })
  const sourceBackup = path.join(backupDir, 'stats.json')
  fs.copyFileSync(source, sourceBackup, fs.constants.COPYFILE_EXCL)
  await db.backup(path.join(backupDir, 'blog.db'))
  let data
  const errors = []
  try { data = JSON.parse(fs.readFileSync(sourceBackup, 'utf8')) } catch { errors.push('JSON 无效') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) errors.push('统计必须为对象')
  else {
    if (!count(data.views)) errors.push('views 必须为非负安全整数')
    for (const key of ['likes', 'articleViews']) {
      const map = data[key]
      if (!map || typeof map !== 'object' || Array.isArray(map)) errors.push(key + ' 必须为对象')
      else for (const [id, value] of Object.entries(map)) {
        if (!count(value)) errors.push(key + '.' + id + ' 不是有效计数')
      }
    }
  }
  const fail = () => {
    const report = path.join(backupDir, 'validation-errors.json')
    fs.writeFileSync(report, JSON.stringify({ source, errors }, null, 2))
    throw new Error('统计迁移校验失败；报告：' + report)
  }
  if (errors.length) fail()
  initDatabase()
  const result = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) {
      return { skipped: true, backupDir }
    }
    const ids = new Set([...Object.keys(data.likes), ...Object.keys(data.articleViews)])
    for (const id of ids) {
      if (!db.prepare('SELECT 1 FROM articles WHERE id = ?').get(id)) errors.push('孤立文章：' + id)
    }
    if (errors.length) fail()
    // 防止在线统计与历史快照混合，要求在切换写入前迁移。
    if (db.prepare('SELECT views FROM site_stats WHERE id = 1').get().views ||
        db.prepare('SELECT 1 FROM article_stats WHERE views != 0 OR likes != 0 LIMIT 1').get() ||
        db.prepare('SELECT 1 FROM article_likes LIMIT 1').get()) {
      errors.push('SQLite 已有统计，请先停止写入并核对数据')
      fail()
    }
    db.prepare('UPDATE site_stats SET views = ? WHERE id = 1').run(data.views)
    const insert = db.prepare(`INSERT INTO article_stats(article_id, views, likes) VALUES(?, ?, ?)
      ON CONFLICT(article_id) DO UPDATE SET views = excluded.views, likes = excluded.likes`)
    for (const id of ids) insert.run(id, data.articleViews[id] || 0, data.likes[id] || 0)
    if (db.pragma('foreign_key_check').length) throw new Error('外键校验失败')
    const expectedViews = Object.values(data.articleViews).reduce((a, b) => a + b, 0)
    const expectedLikes = Object.values(data.likes).reduce((a, b) => a + b, 0)
    if (!count(expectedViews) || !count(expectedLikes)) throw new Error('汇总计数超过安全整数范围')
    const totals = db.prepare('SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(likes), 0) AS likes FROM article_stats').get()
    if (totals.views !== expectedViews || totals.likes !== expectedLikes) throw new Error('迁移总数核对失败')
    db.prepare('INSERT INTO schema_migrations(version, applied_at, details) VALUES(?, ?, ?)')
      .run(version, Date.now(), JSON.stringify({ source, backupDir, ...totals }))
    return { skipped: false, backupDir, siteViews: data.views, ...totals }
  }).immediate()
  return result
}
