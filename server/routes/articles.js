import express from 'express'
import { ArticleDAO } from '../db/articleDAO.js'
import logger from '../utils/logger.js'

const router = express.Router()

function generateId() {
  return 'article-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

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

    const result = ArticleDAO.findAll({
      page: parseInt(page),
      perPage: parseInt(per_page),
      category,
      tag,
      search,
      status,
      sort,
      order
    })

    logger.info('查询文章列表', { total: result.pagination.total })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// 高级搜索（使用 FTS5）
router.get('/search/advanced', async (req, res, next) => {
  try {
    const { q, page = 1, per_page = 10 } = req.query

    if (!q || !q.trim()) {
      return res.status(400).json({ error: '搜索关键词不能为空' })
    }

    const result = ArticleDAO.search(q, parseInt(page), parseInt(per_page))

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
    const stats = ArticleDAO.getStats()
    res.json(stats)
  } catch (error) {
    next(error)
  }
})

// 根据 ID 获取文章（必须在 /:slug 之前）
router.get('/by-id/:id', async (req, res, next) => {
  try {
    const article = ArticleDAO.findById(req.params.id)

    if (!article) {
      return res.status(404).json({ error: '文章未找到' })
    }

    logger.info('查询文章详情', { id: req.params.id })
    res.json(article)
  } catch (error) {
    next(error)
  }
})

// 根据 slug 获取文章（仅已发布）
router.get('/:slug', async (req, res, next) => {
  try {
    const article = ArticleDAO.findBySlug(req.params.slug)

    if (!article) {
      return res.status(404).json({ error: '文章未找到' })
    }

    // 公共访问只允许已发布文章
    if (article.status !== 'published') {
      return res.status(404).json({ error: '文章未找到' })
    }

    logger.info('查询文章详情', { slug: req.params.slug })
    res.json(article)
  } catch (error) {
    next(error)
  }
})

// 创建文章
router.post('/', async (req, res, next) => {
  try {
    const { title, slug, content, category, tags, excerpt, author, status } = req.body

    if (!title) {
      return res.status(400).json({ error: '文章标题不能为空' })
    }

    // 查找或创建分类
    let categoryId = null
    if (category) {
      const { CategoryDAO } = await import('../db/otherDAO.js')
      let cat = CategoryDAO.findByName(category)
      if (!cat) {
        cat = CategoryDAO.create({ name: category })
      }
      categoryId = cat.id
    }

    const article = ArticleDAO.create({
      id: generateId(),
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      content: content || '',
      excerpt: excerpt || (content ? content.substring(0, 100) + '...' : ''),
      author: author || '博主',
      categoryId,
      tags: tags || [],
      status: status || 'draft',
      publishDate: status === 'published' ? new Date().toISOString().split('T')[0] : null,
      updateDate: new Date().toISOString().split('T')[0]
    })

    logger.info('创建文章', { id: article.id, title: article.title, status: article.status })
    res.status(201).json(article)
  } catch (error) {
    next(error)
  }
})

// 更新文章
router.put('/:id', async (req, res, next) => {
  try {
    const { title, slug, content, category, tags, excerpt, author, status } = req.body

    // 查找或创建分类
    let categoryId = undefined
    if (category !== undefined) {
      const { CategoryDAO } = await import('../db/otherDAO.js')
      if (category) {
        let cat = CategoryDAO.findByName(category)
        if (!cat) {
          cat = CategoryDAO.create({ name: category })
        }
        categoryId = cat.id
      } else {
        categoryId = null
      }
    }

    const updates = {}
    if (title !== undefined) updates.title = title
    if (slug !== undefined) updates.slug = slug
    if (content !== undefined) updates.content = content
    if (excerpt !== undefined) updates.excerpt = excerpt
    if (author !== undefined) updates.author = author
    if (categoryId !== undefined) updates.categoryId = categoryId
    if (tags !== undefined) updates.tags = tags
    if (status !== undefined) {
      updates.status = status
      // 状态变为published时设置publishDate
      if (status === 'published') {
        const existing = ArticleDAO.findById(req.params.id)
        if (existing && !existing.publish_date) {
          updates.publishDate = new Date().toISOString().split('T')[0]
        }
      }
    }

    updates.updateDate = new Date().toISOString().split('T')[0]

    const article = ArticleDAO.update(req.params.id, updates)

    if (!article) {
      return res.status(404).json({ error: '文章未找到' })
    }

    logger.info('更新文章', { id: req.params.id, status: updates.status })
    res.json(article)
  } catch (error) {
    next(error)
  }
})

// 删除文章
router.delete('/:id', async (req, res, next) => {
  try {
    const success = ArticleDAO.delete(req.params.id)

    if (!success) {
      return res.status(404).json({ error: '文章未找到' })
    }

    logger.info('删除文章', { id: req.params.id })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
