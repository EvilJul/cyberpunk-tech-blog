#!/usr/bin/env node

/**
 * 数据迁移脚本：JSON → SQLite
 * 运行: node scripts/migrate-to-sqlite.js
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import db, { initDatabase } from '../server/db/index.js'
import { ArticleDAO } from '../server/db/articleDAO.js'
import { CommentDAO, UserDAO, CategoryDAO } from '../server/db/otherDAO.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, '..', 'server', 'data')

async function loadJsonFile(filename) {
  try {
    const content = await fs.readFile(path.join(dataDir, filename), 'utf8')
    return JSON.parse(content)
  } catch (error) {
    console.warn(`⚠️  ${filename} 不存在或读取失败，跳过`)
    return null
  }
}

async function migrateUsers() {
  console.log('\n📊 迁移用户数据...')
  const data = await loadJsonFile('users.json')
  if (!data || !data.users) {
    console.log('   无用户数据')
    return
  }

  let count = 0
  for (const user of data.users) {
    try {
      UserDAO.create({
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash || user.password_hash,
        role: user.role || 'user'
      })
      count++
    } catch (error) {
      console.error(`   ❌ 用户 ${user.username} 迁移失败:`, error.message)
    }
  }

  console.log(`   ✅ 成功迁移 ${count} 个用户`)
}

async function migrateCategories() {
  console.log('\n📊 迁移分类数据...')
  const data = await loadJsonFile('categories.json')
  if (!data) {
    console.log('   无分类数据')
    return {}
  }

  const categories = Array.isArray(data) ? data : (data.categories || [])
  const categoryMap = {}
  let count = 0

  for (const cat of categories) {
    try {
      const name = cat.name || cat
      const category = CategoryDAO.create({
        name,
        slug: typeof cat === 'object' ? cat.slug : name.toLowerCase().replace(/\s+/g, '-'),
        description: typeof cat === 'object' ? cat.description : null
      })
      categoryMap[name] = category.id
      count++
    } catch (error) {
      console.error(`   ❌ 分类 ${cat.name || cat} 迁移失败:`, error.message)
    }
  }

  console.log(`   ✅ 成功迁移 ${count} 个分类`)
  return categoryMap
}

async function migrateArticles(categoryMap) {
  console.log('\n📊 迁移文章数据...')
  const data = await loadJsonFile('articles.json')
  if (!data || !data.articles) {
    console.log('   无文章数据')
    return
  }

  let count = 0
  for (const article of data.articles) {
    try {
      ArticleDAO.create({
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content || '',
        excerpt: article.excerpt || '',
        author: article.author || '博主',
        categoryId: categoryMap[article.category] || null,
        publishDate: article.publishDate || article.publish_date,
        updateDate: article.updateDate || article.update_date,
        tags: article.tags || []
      })
      count++
    } catch (error) {
      console.error(`   ❌ 文章 ${article.title} 迁移失败:`, error.message)
    }
  }

  console.log(`   ✅ 成功迁移 ${count} 篇文章`)
}

async function migrateComments() {
  console.log('\n📊 迁移评论数据...')
  const data = await loadJsonFile('comments.json')
  if (!data || !data.comments) {
    console.log('   无评论数据')
    return
  }

  let count = 0
  for (const comment of data.comments) {
    try {
      CommentDAO.create({
        id: comment.id,
        articleId: comment.articleId || comment.article_id,
        parentId: comment.parentId || comment.parent_id || null,
        author: comment.author,
        email: comment.email,
        content: comment.content,
        status: comment.status || 'pending'
      })
      count++
    } catch (error) {
      console.error(`   ❌ 评论 ${comment.id} 迁移失败:`, error.message)
    }
  }

  console.log(`   ✅ 成功迁移 ${count} 条评论`)
}

async function backupJsonFiles() {
  console.log('\n💾 备份 JSON 文件...')
  const backupDir = path.join(dataDir, 'json-backup')
  await fs.mkdir(backupDir, { recursive: true })

  const files = ['users.json', 'articles.json', 'comments.json', 'categories.json', 'tags.json']

  for (const file of files) {
    try {
      const src = path.join(dataDir, file)
      const dest = path.join(backupDir, `${file}.${Date.now()}`)
      await fs.copyFile(src, dest)
      console.log(`   ✅ 备份 ${file}`)
    } catch (error) {
      // 文件可能不存在，忽略
    }
  }
}

async function verify() {
  console.log('\n🔍 验证迁移结果...')

  const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get().count
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count
  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments').get().count
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count
  const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count

  console.log(`   📝 文章: ${articleCount}`)
  console.log(`   👤 用户: ${userCount}`)
  console.log(`   💬 评论: ${commentCount}`)
  console.log(`   📂 分类: ${categoryCount}`)
  console.log(`   🏷️  标签: ${tagCount}`)
}

async function main() {
  console.log('🚀 开始迁移数据：JSON → SQLite\n')

  try {
    // 1. 初始化数据库
    console.log('📦 初始化数据库表结构...')
    initDatabase()
    console.log('   ✅ 数据库初始化完成')

    // 2. 备份原始 JSON 文件
    await backupJsonFiles()

    // 3. 迁移数据
    await migrateUsers()
    const categoryMap = await migrateCategories()
    await migrateArticles(categoryMap)
    await migrateComments()

    // 4. 验证
    await verify()

    console.log('\n✅ 数据迁移完成！\n')
    console.log('📌 后续步骤：')
    console.log('   1. 测试 API 功能')
    console.log('   2. 确认前端正常工作')
    console.log('   3. 如有问题，JSON 备份在 server/data/json-backup/')
    console.log('')

  } catch (error) {
    console.error('\n❌ 迁移失败:', error)
    process.exit(1)
  }
}

main()
