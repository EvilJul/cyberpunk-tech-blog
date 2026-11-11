import express from 'express'
import db from '../db/index.js'
import {
  legacyCreate,
  legacyUpdate,
  deleteArticle,
  getWorkingCopy,
  listWorkingCopies,
  articleError
} from '../services/articleService.js'
import { authMiddleware, adminOnly, optionalAuth } from '../middleware/auth.js'
import { ArticleDAO } from '../db/articleDAO.js'
import logger from '../utils/logger.js'

const router = express.Router()

router.use(optionalAuth)
/** 将分页参数限制为指定范围内的正整数。 */
const positiveInt = (value, fallback, max) =>
  Math.min(max, Math.max(1, parseInt(value) || fallback))

// 获取文章列表（支持分页、搜索、排序、筛选）
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      per_page = 10,
      category,
      tag,
      search,
      status,
      sort = 'publish_date',
      order = 'desc'
    } = req.query

    const query = {
      page: positiveInt(page, 1, 1000000),
      perPage: positiveInt(per_page, 10, 100),
      category,
      tag,
      search,
      includeDrafts: req.user?.role === 'admin',
      status: req.user?.role === 'admin' ? status : 'published',
      sort,
      order
    }
    const result =
      req.user?.role === 'admin'
        ? listWorkingCopies(query, { kind: 'user', ...req.user })
        : ArticleDAO.findAll(query)

    logger.info('查询文章列表', { total: result.pagination.total })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.get('/featured/list', /* 仅读取已发布置顶快照，忽略管理身份和客户端筛选。 */ (req, res, next) => {
  try {
    res.json({ data: ArticleDAO.findAll({ featured: true, perPage: 20 }).data })
  } catch (error) {
    next(error)
  }
})

// 高级搜索（使用 FTS5）
router.get('/search/advanced', async (req, res, next) => {
  try {
    const { q, page = 1, per_page = 10 } = req.query

    if (typeof q !== 'string' || !q.trim() || q.length > 500) {
      return res.status(400).json({ error: '搜索关键词不能为空' })
    }

    const result = ArticleDAO.findAll({
      search: q,
      status: 'published',
      page: positiveInt(page, 1, 1000000),
      perPage: positiveInt(per_page, 10, 100)
    })

    logger.info('全文搜索', { keyword: q, total: result.pagination.total })
    res.json({
      ...result,
      query: {
        keyword: q,
        search_time: Date.now()
      }
    })
  } catch (error) {
    next(error)
  }
})

// 获取文章统计
router.get('/stats/summary', async (req, res, next) => {
  try {
    const stats = ArticleDAO.getStats({
      includeDrafts: req.user?.role === 'admin'
    })
    res.json(stats)
  } catch (error) {
    next(error)
  }
})

// 根据 ID 获取文章（必须在 /:slug 之前）
router.get('/by-id/:id', async (req, res, next) => {
  try {
    const article = ArticleDAO.findById(req.params.id)

    if (
      !article ||
      (article.status !== 'published' && req.user?.role !== 'admin')
    ) {
      return res.status(404).json({ error: '文章未找到' })
    }

    logger.info('查询文章详情', { id: req.params.id })
    res.json(
      req.user?.role === 'admin'
        ? getWorkingCopy(article.id, { kind: 'user', ...req.user })
        : article
    )
  } catch (error) {
    next(error)
  }
})

// 根据 slug 获取文章（仅已发布）
router.get('/:slug', /* 按原有单段slug读取文章，与两段推荐路径互不占用。 */ async (req, res, next) => {
  try {
    const article = ArticleDAO.findBySlug(req.params.slug)

    if (
      !article ||
      (article.status !== 'published' && req.user?.role !== 'admin')
    ) {
      return res.status(404).json({ error: '文章未找到' })
    }

    // 公共访问只允许已发布文章
    if (article.status !== 'published' && req.user?.role !== 'admin') {
      return res.status(404).json({ error: '文章未找到' })
    }

    logger.info('查询文章详情', { slug: req.params.slug })
    res.json(
      req.user?.role === 'admin'
        ? getWorkingCopy(article.id, { kind: 'user', ...req.user })
        : article
    )
  } catch (error) {
    next(error)
  }
})

// Legacy JWT adapters remain isolated from browser sessions and integration keys.
/** 仅提取旧接口允许写入且明确提供的文章字段。 */
const legacyFields = (body) =>
  Object.fromEntries(
    ['title', 'slug', 'content', 'category', 'tags', 'excerpt', 'author']
      .filter(/* 筛选请求中已提供的文章字段。 */ (key) => body[key] !== undefined)
      .map(/* 将字段名和请求值组装为白名单键值对。 */ (key) => [key, body[key]])
  )
/** 为旧JWT写入构造用户访问主体。 */
const actor = (req) => ({ kind: 'user', ...req.user, authMethod: 'legacy-jwt' })
/** 校验旧接口的草稿或发布状态。 */
const legacyStatus = (body) => {
  if (
    body.status !== undefined &&
    !['draft', 'published'].includes(body.status)
  )
    throw articleError(400, 'INVALID_STATUS', '文章状态无效')
  return body.status
}
router.post('/', authMiddleware, adminOnly, /* 通过共享服务适配旧接口创建文章，并记录兼容写入。 */ (req, res, next) => {
  try {
    const body = req.body || {}
    const result = legacyCreate(
      legacyFields(body),
      legacyStatus(body) || 'draft',
      actor(req)
    )
    logger.warn('legacy-unconditional-create', {
      userId: req.user.id,
      articleId: result.id
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})
router.put('/:id', authMiddleware, adminOnly, /* 通过共享服务适配旧接口更新文章及条件版本。 */ (req, res, next) => {
  try {
    const body = req.body || {}
    const result = legacyUpdate(
      req.params.id,
      legacyFields(body),
      legacyStatus(body),
      req.get('If-Match'),
      actor(req)
    )
    if (!req.get('If-Match'))
      logger.warn('legacy-unconditional-update', {
        userId: req.user.id,
        articleId: result.id
      })
    res.json(result)
  } catch (error) {
    next(error)
  }
})
router.delete('/:id', authMiddleware, adminOnly, /* 通过共享服务适配旧接口删除文章，并兼容缺省版本。 */ (req, res, next) => {
  try {
    const current = db
      .prepare('SELECT revision FROM articles WHERE id=?')
      .get(req.params.id)
    if (!current) throw articleError(404, 'NOT_FOUND', '文章未找到')
    if (!req.get('If-Match'))
      logger.warn('legacy-unconditional-delete', {
        userId: req.user.id,
        articleId: req.params.id
      })
    res.json(
      deleteArticle(
        req.params.id,
        req.get('If-Match') || current.revision,
        actor(req)
      )
    )
  } catch (error) {
    next(error)
  }
})
export default router
