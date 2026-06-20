import express from 'express'
import { TagDAO } from '../db/otherDAO.js'

const router = express.Router()

router.get('/', (req, res, next) => {
  try {
    const tags = TagDAO.findAll()
    res.json(tags)
  } catch (error) {
    next(error)
  }
})

export default router
