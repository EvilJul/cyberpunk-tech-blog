import express from 'express'
import { randomUUID } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { CommentDAO } from '../db/otherDAO.js'
import { ArticleDAO } from '../db/articleDAO.js'
import logger from '../utils/logger.js'

const router = express.Router()
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '评论过于频繁，请稍后再试' }
})

router.get('/:articleId', /* 仅返回已发布文章中自身及全部祖先均已审核通过的脱敏评论。 */ (req, res, next) => {
  try {
    if (ArticleDAO.findById(req.params.articleId)?.status !== 'published') {
      return res.status(404).json({ error: '文章未找到' })
    }
    // Email addresses and pending moderation content are never public.
    const all = CommentDAO.findByArticleId(req.params.articleId)
    const byId = new Map(all.map(/* 按评论编号构建祖先链查询索引。 */ (comment) => [comment.id, comment]))
    /** 检查评论及完整祖先链均已通过审核，并拒绝循环或缺失的祖先。 */
    const visible = (comment) => {
      const seen = new Set()
      while (comment) {
        if (comment.status !== 'approved' || seen.has(comment.id)) return false
        seen.add(comment.id)
        if (!comment.parent_id) return true
        comment = byId.get(comment.parent_id)
      }
      return false
    }
    const comments = all.filter(visible).map(/* 移除公开评论中的邮箱字段。 */ ({ email, ...comment }) => comment)
    res.json(comments)
  } catch (error) {
    next(error)
  }
})

router.post('/:articleId', limiter, /* 校验评论字段、文章及回复目标后创建待审核评论。 */ (req, res, next) => {
  try {
    const { author, content, email, parentId } = req.body || {}
    if (
      typeof author !== 'string' ||
      !author.trim() ||
      author.trim().length > 50 ||
      typeof content !== 'string' ||
      !content.trim() ||
      content.trim().length > 2000 ||
      (email !== undefined &&
        (typeof email !== 'string' ||
          email.length > 254 ||
          (email.trim() &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))) ||
      (parentId !== undefined &&
        parentId !== null &&
        typeof parentId !== 'string')
    ) {
      return res.status(400).json({ error: '评论字段无效' })
    }
    if (ArticleDAO.findById(req.params.articleId)?.status !== 'published') {
      return res.status(404).json({ error: '文章未找到' })
    }
    if (parentId) {
      const parent = CommentDAO.findById(parentId)
      if (
        !parent ||
        parent.article_id !== req.params.articleId ||
        parent.status !== 'approved'
      ) {
        return res.status(400).json({ error: '回复目标无效' })
      }
    }
    const comment = CommentDAO.create({
      id: randomUUID(),
      articleId: req.params.articleId,
      parentId: parentId || null,
      author: author.trim(),
      email: email?.trim() || null,
      content: content.trim(),
      status: 'pending'
    })
    logger.info('创建评论', { id: comment.id, articleId: req.params.articleId })
    res.status(201).json(comment)
  } catch (error) {
    next(error)
  }
})

export default router
