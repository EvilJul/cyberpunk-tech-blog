import express from 'express'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import db, { dataDir } from '../db/index.js'
import { CategoryDAO, TagDAO, CommentDAO } from '../db/otherDAO.js'
import { requireAdminSession } from '../middleware/auth.js'
import { requireCsrf } from '../middleware/csrf.js'
import * as articleService from '../services/articleService.js'
import { registerStudioMedia } from '../services/studioMediaService.js'
import settingsRouter from './settings.js'
import { parseStudioImage, handleStudioImage } from './upload.js'

const router = express.Router()
router.use(requireAdminSession, requireCsrf)
router.use(/* 设置私有缓存策略并适配管理员主体。 */ (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  // Only this authenticated namespace supplies a legacy-compatible user.
  req.user = req.user || req.principal
  next()
})
/** 抛出工作台输入或资源错误。 */
const fail = (res, status, message) => {
  throw Object.assign(new Error(message), {
    status,
    code: status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT'
  })
}
/** 包装工作台处理器并统一转发错误。 */
const wrap = (fn) => /* 异步执行处理器并捕获失败。 */ (req, res, next) =>
  Promise.resolve()
    .then(/* 调用当前工作台业务处理器。 */ () => fn(req, res))
    .catch(/* 将数据库约束冲突转换为可读错误。 */ (error) => {
      if (error.code?.startsWith('SQLITE_CONSTRAINT'))
        return next(
          Object.assign(new Error('名称或地址已存在'), {
            status: 409,
            code: 'NAME_CONFLICT'
          })
        )
      next(error)
    })
/** 规范化列表条数和偏移量。 */
const paging = (req) => ({
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || 20)),
  offset: Math.max(0, Number(req.query.offset) || 0)
})
/** 返回带修订ETag的文章响应。 */
const articleResponse = (res, data, status = 200) =>
  res.status(status).set('ETag', `"${data.revision}"`).json(data)
router.get(
  '/articles',
  wrap(/* 分页查询文章工作副本。 */ (req, res) =>
    res.json(
      articleService.listWorkingCopies(
        {
          page: req.query.page,
          perPage: req.query.perPage || req.query.per_page,
          search: req.query.search,
          status: req.query.status
        },
        req.principal
      )
    )
  )
)
router.post(
  '/articles',
  wrap(/* 新建文章草稿并返回版本。 */ (req, res) =>
    articleResponse(
      res,
      articleService.createDraft(req.body, req.principal),
      201
    )
  )
)
router.get(
  '/articles/:id',
  wrap(/* 读取指定文章工作副本。 */ (req, res) =>
    articleResponse(
      res,
      articleService.getWorkingCopy(req.params.id, req.principal)
    )
  )
)
router.put(
  '/articles/:id/draft',
  wrap(/* 按条件版本保存文章草稿。 */ (req, res) =>
    articleResponse(
      res,
      articleService.saveDraft(
        req.params.id,
        req.body,
        req.get('If-Match'),
        req.principal
      )
    )
  )
)
router.put(
  '/articles/:id/pin',
  wrap(/* 按共享版本设置首页置顶，沿用会话及CSRF防护。 */ (req, res) =>
    articleResponse(res, articleService.setPinned(
      req.params.id, req.body, req.get('If-Match'), req.principal
    ))
  )
)
for (const action of ['publish', 'unpublish'])
  router.post(
    `/articles/:id/${action}`,
    wrap(/* 执行文章发布或撤回并返回版本。 */ (req, res) =>
      articleResponse(
        res,
        articleService[action](
          req.params.id,
          req.get('If-Match'),
          req.principal
        )
      )
    )
  )
router.delete(
  '/articles/:id',
  wrap(/* 按条件版本删除文章。 */ (req, res) => {
    articleService.deleteArticle(
      req.params.id,
      req.get('If-Match'),
      req.principal
    )
    res.json({ success: true })
  })
)
/** 校验或生成分类标签的URL别名。 */
function taxonomySlug(input, name) {
  if (input !== undefined && (typeof input !== 'string' || input.length > 200))
    throw Object.assign(new Error('URL 别名无效'), {
      status: 400,
      code: 'INVALID_INPUT'
    })
  const slug = input?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-')
  if (!slug || /[\s/\\?#\u0000-\u001f]/u.test(slug))
    throw Object.assign(new Error('URL 别名不能包含空格、斜线或查询字符'), {
      status: 400,
      code: 'INVALID_INPUT'
    })
  return slug
}
for (const [path, dao] of [
  ['categories', CategoryDAO],
  ['tags', TagDAO]
]) {
  router.get(
    `/${path}`,
    wrap(/* 读取包含草稿关联的分类或标签。 */ (req, res) => res.json(dao.findAll({ includeDrafts: true })))
  )
  router.post(
    `/${path}`,
    wrap(/* 校验并创建分类或标签。 */ (req, res) => {
      const name = req.body?.name
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
        return fail(res, 400, '名称需为 1–100 字符')
      const slug = taxonomySlug(req.body.slug, name)
      if (path === 'categories')
        return res
          .status(201)
          .json(
            dao.create({
              name: name.trim(),
              slug,
              description: String(req.body.description || '').slice(0, 2000)
            })
          )
      const result = db
        .prepare('INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)')
        .run(name.trim(), slug, Date.now())
      res
        .status(201)
        .json(
          db
            .prepare('SELECT * FROM tags WHERE id = ?')
            .get(result.lastInsertRowid)
        )
    })
  )
  router.put(
    `/${path}/:id`,
    wrap(/* 校验并更新分类或标签。 */ (req, res) => {
      const name = req.body?.name
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
        return fail(res, 400, '名称需为 1–100 字符')
      const item = db
        .transaction(/* 原子更新名称及别名并保留未修改字段。 */ () => {
          const previous = db
            .prepare(`SELECT * FROM ${path} WHERE id = ?`)
            .get(req.params.id)
          if (!previous) return null
          // Renaming alone retains the previously chosen URL alias.
          const slug = taxonomySlug(
            req.body.slug === undefined ? previous.slug : req.body.slug,
            name
          )
          db.prepare(`UPDATE ${path} SET name = ?, slug = ? WHERE id = ?`).run(
            name.trim(),
            slug,
            req.params.id
          )
          if (path === 'categories' && req.body.description !== undefined)
            db.prepare(
              'UPDATE categories SET description = ? WHERE id = ?'
            ).run(String(req.body.description).slice(0, 2000), req.params.id)
          return db
            .prepare(`SELECT * FROM ${path} WHERE id = ?`)
            .get(req.params.id)
        })
        .immediate()
      return item ? res.json(item) : fail(res, 404, '未找到')
    })
  )
  router.delete(
    `/${path}/:id`,
    wrap(/* 删除分类或标签并返回结果。 */ (req, res) =>
      dao.delete(req.params.id)
        ? res.json({ success: true })
        : fail(res, 404, '未找到')
    )
  )
}
router.get(
  '/comments',
  wrap(/* 按审核状态分页读取评论。 */ (req, res) => {
    const { limit, offset } = paging(req)
    const status = req.query.status
    if (status && !['pending', 'approved', 'rejected'].includes(status))
      return fail(res, 400, '审核状态无效')
    const where = status ? ' WHERE status = ?' : ''
    const params = status ? [status] : []
    res.json({
      items: db
        .prepare(
          `SELECT * FROM comments${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset),
      total: db
        .prepare(`SELECT count(*) AS n FROM comments${where}`)
        .get(...params).n,
      limit,
      offset
    })
  })
)
router.patch(
  '/comments/:id',
  wrap(/* 更新评论审核状态。 */ (req, res) => {
    if (!['pending', 'approved', 'rejected'].includes(req.body?.status))
      return fail(res, 400, '审核状态无效')
    if (!CommentDAO.updateStatus(req.params.id, req.body.status))
      return fail(res, 404, '评论不存在')
    res.json(CommentDAO.findById(req.params.id))
  })
)
router.delete(
  '/comments/:id',
  wrap(/* 删除评论树并返回影响数量。 */ (req, res) => {
    const affectedCount = db
      .transaction(/* 原子统计评论子树并删除评论。 */ () => {
        const count = db
          .prepare(
            'WITH RECURSIVE tree(id) AS (SELECT id FROM comments WHERE id = ? UNION SELECT c.id FROM comments c JOIN tree t ON c.parent_id = t.id) SELECT count(*) AS n FROM tree'
          )
          .get(req.params.id).n
        if (count) CommentDAO.delete(req.params.id)
        return count
      })
      .immediate()
    return affectedCount
      ? res.json({ success: true, affectedCount })
      : fail(res, 404, '评论不存在')
  })
)
router.post('/media', parseStudioImage, handleStudioImage)
router.post('/media/register', wrap(/* 显式登记历史图片，沿用管理员会话和CSRF。 */ async (req, res) => {
  if (!req.body || Object.keys(req.body).length !== 1)
    throw articleService.articleError(400, 'INVALID_MEDIA', '请仅提供 filename')
  res.json(await registerStudioMedia(req.body.filename))
}))
router.get(
  '/media',
  wrap(/* 只读列出媒体及已有登记编号，历史文件由显式接口登记。 */ async (req, res) => {
    const dir = join(dataDir, 'uploads')
    const names = await fs.readdir(dir).catch(/* 目录不存在时返回空列表，其他读取错误继续抛出。 */ (error) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const items = (
      await Promise.all(
        names
          .filter(/* 筛选允许展示的图片文件名。 */ (name) => /^[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(name))
          .map(/* 读取普通图片元信息并关联登记编号，排除符号链接。 */ async (name) => {
            const stat = await fs.lstat(join(dir, name))
            return stat.isFile()
              ? {
                  name,
                  id: db.prepare('SELECT id FROM integration_media WHERE filename=?').get(name)?.id ?? null,
                  url: `/uploads/${name}`,
                  size: stat.size,
                  created_at: stat.mtimeMs
                }
              : null
          })
      )
    )
      .filter(Boolean)
      .sort(/* 按媒体创建时间倒序排列。 */ (a, b) => b.created_at - a.created_at)
    const { limit, offset } = paging(req)
    res.json({
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset
    })
  })
)
// Existing settings response envelopes and merging/default logic remain authoritative.
router.use('/settings', settingsRouter)
router.get(
  '/logs',
  wrap(/* 分页返回脱敏日志记录。 */ async (req, res) => {
    const raw = await fs
      .readFile(join(dataDir, 'app.log'), 'utf8')
      .catch(/* 日志文件不存在时返回空文本，其他错误继续抛出。 */ (error) => {
        if (error.code === 'ENOENT') return ''
        throw error
      })
    // Free-text messages and payloads may contain credentials supplied by clients.
    const items = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .reverse()
      .map(/* 解析日志行并仅保留安全展示字段。 */ (line) => {
        try {
          const entry = JSON.parse(line)
          return {
            timestamp: entry.timestamp,
            level: ['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(entry.level)
              ? entry.level
              : 'INFO',
            message: '系统事件（敏感内容已隐藏）'
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .filter(/* 按请求级别筛选日志记录。 */ (entry) => !req.query.level || entry.level === req.query.level)
    const { limit, offset } = paging(req)
    res.json({
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset
    })
  })
)
router.post(
  '/logs/clear',
  wrap(/* 清空当前日志及轮转日志文件。 */ async (req, res) => {
    await fs.writeFile(join(dataDir, 'app.log'), '')
    await fs.rm(join(dataDir, 'app.log.1'), { force: true })
    res.json({ success: true })
  })
)
export default router
