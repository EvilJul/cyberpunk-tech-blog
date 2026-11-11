import fs from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import db, { dataDir } from '../db/index.js'
import { articleError } from './articleService.js'

import { studioMediaOwner } from './integrationService.js'
export { studioMediaOwner }

/** 显式登记上传目录中的真实图片；拒绝路径穿越及符号链接，不转移已有媒体归属。 */
export async function registerStudioMedia(filename) {
  if (typeof filename !== 'string' || !/^[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(filename))
    throw articleError(400, 'INVALID_MEDIA', '图片文件名无效')
  const path = join(dataDir, 'uploads', filename)
  let descriptor
  try {
    descriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
      throw articleError(400, 'INVALID_MEDIA', '需为不超过20MiB的普通图片文件')
    const existing = db.prepare('SELECT id,url FROM integration_media WHERE filename=?').get(filename)
    if (existing) return existing
    const buffer = fs.readFileSync(descriptor)
    let metadata
    try {
      const image = sharp(buffer, { limitInputPixels: 40000000, failOn: 'warning' })
      metadata = await image.metadata()
      // 完整解码，避免仅有有效文件头的截断图片被登记。
      await image.stats()
    } catch {
      throw articleError(400, 'INVALID_MEDIA', '图片内容无效或尺寸过大')
    }
    const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[metadata.format]
    if (!mime) throw articleError(400, 'INVALID_MEDIA', '不支持的图片格式')
    return db.transaction(/* 在写锁内去重登记，不修改已有媒体及文件内容。 */ () => {
      const current = db.prepare('SELECT id,url FROM integration_media WHERE filename=?').get(filename)
      if (current) return current
      db.prepare('INSERT OR IGNORE INTO integrations(id,name,enabled,created_at) VALUES(?,?,0,?)')
        .run(studioMediaOwner, '工作台媒体（内部登记）', Date.now())
      const id = randomUUID(), url = `/uploads/${filename}`
      // 文件名参与摘要，允许内容相同但地址不同的历史文件各自保留身份。
      const hash = createHash('sha256').update(filename).update('\0').update(buffer).digest('hex')
      db.prepare('INSERT INTO integration_media(id,integration_id,sha256,filename,url,mime_type,size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, studioMediaOwner, hash, filename, url, mime, stat.size, metadata.width, metadata.height, Date.now())
      return { id, url }
    }).immediate()
  } catch (error) {
    if (error.code === 'ENOENT') throw articleError(404, 'NOT_FOUND', '图片不存在')
    if (error.code === 'ELOOP') throw articleError(400, 'INVALID_MEDIA', '不允许登记符号链接')
    throw error
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}
