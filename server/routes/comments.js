import express from 'express'
import { CommentDAO } from '../db/otherDAO.js'
import logger from '../utils/logger.js'

const router = express.Router()

router.get('/:articleId', async (req, res, next) => {
  try {
    const comments = CommentDAO.findByArticleId(req.params.articleId)
    res.json(comments)
  } catch (error) {
    next(error)
  }
})

router.post('/:articleId', async (req, res, next) => {
  try {
    const newComment = CommentDAO.create({
      id: `comment-${Date.now()}`,
      articleId: req.params.articleId,
      parentId: req.body.parentId || null,
      author: req.body.author,
      email: req.body.email,
      content: req.body.content,
      status: 'pending'
    })

    logger.info('创建评论', { id: newComment.id, articleId: req.params.articleId })
    res.status(201).json(newComment)
  } catch (error) {
    next(error)
  }
})

export default router