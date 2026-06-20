import express from 'express'
import { CategoryDAO } from '../db/otherDAO.js'

const router = express.Router()

router.get('/', (req, res, next) => {
  try {
    const categories = CategoryDAO.findAll()
    res.json(categories)
  } catch (error) {
    next(error)
  }
})

router.post('/', (req, res, next) => {
  try {
    const { name, description } = req.body
    if (!name) {
      return res.status(400).json({ error: '分类名称不能为空' })
    }

    const category = CategoryDAO.create({ name, description })
    res.status(201).json(category)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', (req, res, next) => {
  try {
    const success = CategoryDAO.delete(req.params.id)
    if (!success) {
      return res.status(404).json({ error: '分类未找到' })
    }
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
