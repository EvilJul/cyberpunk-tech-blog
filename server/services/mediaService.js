import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import db, { dataDir } from '../db/index.js'
import { digest, fail } from './integrationService.js'
export const uploadDir = path.join(dataDir, 'uploads')
/** 校验并解码上传图片，转为受限尺寸的JPEG。 */
export async function prepareMedia(file) {
  if (!file) fail(422, 'INVALID_FIELDS', '需要上传文件')
  if (file.size > 5 * 1024 * 1024)
    fail(413, 'PAYLOAD_TOO_LARGE', '文件超过5MiB')
  const formats = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif'
  }
  try {
    const image = sharp(file.buffer, {
        limitInputPixels: 40000000,
        failOn: 'warning'
      }),
      meta = await image.metadata()
    if (!formats[meta.format] || formats[meta.format] !== file.mimetype)
      fail(415, 'UNSUPPORTED_MEDIA_TYPE', '图片类型不符')
    const { data, info } = await image
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
    return {
      data,
      width: info.width,
      height: info.height,
      sha256: digest(file.buffer)
    }
  } catch (error) {
    if (error.status) throw error
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', '图片无法解码或像素超限')
  }
}
/** 按集成去重并登记媒体文件。 */
export function storeMedia(actor, prepared) {
  const existing = db
    .prepare(
      'SELECT * FROM integration_media WHERE integration_id=? AND sha256=?'
    )
    .get(actor.integrationId, prepared.sha256)
  if (existing && fs.existsSync(path.join(uploadDir, existing.filename)))
    return publicMedia(existing)
  if (existing) fail(500, 'MEDIA_UNAVAILABLE', '媒体文件暂不可用')
  fs.mkdirSync(uploadDir, { recursive: true })
  const id = randomUUID(),
    filename = `publishing-${id}.jpg`,
    tmp = path.join(uploadDir, `${filename}.tmp`),
    dest = path.join(uploadDir, filename)
  try {
    fs.writeFileSync(tmp, prepared.data, { flag: 'wx', mode: 0o600 })
    fs.renameSync(tmp, dest)
    const row = {
      id,
      integration_id: actor.integrationId,
      sha256: prepared.sha256,
      filename,
      url: `${(process.env.VITE_BASE_PATH || '/').replace(/\/$/, '')}/uploads/${filename}`,
      mime_type: 'image/jpeg',
      size: prepared.data.length,
      width: prepared.width,
      height: prepared.height,
      created_at: Date.now()
    }
    db.prepare(
      'INSERT INTO integration_media VALUES(@id,@integration_id,@sha256,@filename,@url,@mime_type,@size,@width,@height,@created_at)'
    ).run(row)
    return publicMedia(row)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}
/** 提取可公开返回的媒体元信息。 */
function publicMedia({ id, url, mime_type, size, width, height, sha256 }) {
  return { id, url, mime_type, size, width, height, sha256 }
}
// Check durable content, not response caches/audit. Filename matching also protects
// absolute URLs, deployment prefixes and orphan files whose registration rolled back.
/** 检查持久化内容是否引用媒体文件或编号。 */
function mediaReferenced(filename, id = null) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('articles','article_drafts','settings','site_settings','themes')"
    )
    .all()
  for (const { name } of tables) {
    for (const row of db.prepare(`SELECT * FROM "${name}"`).iterate()) {
      const text = JSON.stringify(row)
      if (text.includes(filename) || (id && text.includes(id))) return true
    }
  }
  // Settings are currently persisted as JSON, outside SQLite. Fail closed on I/O
  // or invalid JSON rather than treating unavailable settings as unreferenced.
  const settings = path.join(dataDir, 'settings.json')
  try {
    const text = JSON.stringify(JSON.parse(fs.readFileSync(settings, 'utf8')))
    if (text.includes(filename) || (id && text.includes(id))) return true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return false
}
/** 清理过期幂等记录、审计及未引用媒体。 */
export function cleanupPublishing(now = Date.now()) {
  if (db.inTransaction) throw new Error('媒体维护必须在独立事务外运行')
  let files = 0,
    media = 0
  fs.mkdirSync(uploadDir, { recursive: true })
  // Database changes commit before any unlink. A rollback can never restore a
  // registration whose file was already removed. Failed unlinks remain retryable.
  db.transaction(/* 先提交媒体登记清理及过期记录删除。 */ () => {
    for (const row of db
      .prepare('SELECT * FROM integration_media WHERE created_at<?')
      .all(now - 7 * 86400000)) {
      if (!mediaReferenced(row.filename, row.id)) {
        db.prepare('DELETE FROM integration_media WHERE id=?').run(row.id)
        media++
      }
    }
    db.prepare('DELETE FROM publishing_idempotency WHERE created_at<?').run(
      now - 86400000
    )
    db.prepare('DELETE FROM integration_audit WHERE created_at<?').run(
      now - 90 * 86400000
    )
  }).immediate()
  // Recheck references and registration under the writer lock for each unlink:
  // another process may have referenced the URL after registration retirement.
  for (const filename of fs.readdirSync(uploadDir)) {
    if (!/^publishing-[a-f0-9-]+\.jpg(?:\.tmp)?$/.test(filename)) continue
    db.transaction(/* 在写锁内复核引用后清除孤立文件。 */ () => {
      const target = path.join(uploadDir, filename)
      let stat
      try {
        stat = fs.lstatSync(target)
      } catch (error) {
        if (error.code === 'ENOENT') return
        throw error
      }
      if (!stat.isFile() || stat.mtimeMs > now - 3600000) return
      const original = filename.replace(/\.tmp$/, '')
      if (
        db
          .prepare('SELECT 1 FROM integration_media WHERE filename=?')
          .get(original)
      )
        return
      if (
        mediaReferenced(
          original,
          original.slice('publishing-'.length, -'.jpg'.length)
        )
      )
        return
      fs.unlinkSync(target)
      files++
    }).immediate()
  }
  return { orphan_files_removed: files, unreferenced_media_removed: media }
}
