#!/usr/bin/env node

/**
 * 初始化脚本 - 创建第一个管理员账号
 * 交互式: node scripts/init-admin.js
 * 非交互式: node scripts/init-admin.js --username admin --password 123456 --non-interactive
 */

import readline from 'readline'
import bcrypt from 'bcrypt'
import Database from 'better-sqlite3'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) {
      parsed.username = args[++i]
    } else if (args[i] === '--password' && args[i + 1]) {
      parsed.password = args[++i]
    } else if (args[i] === '--non-interactive') {
      parsed.nonInteractive = true
    }
  }
  
  return parsed
}

async function main() {
  const args = parseArgs()
  let username = args.username
  let password = args.password
  
  if (args.nonInteractive) {
    // 非交互式模式
    if (!username || !password) {
      console.error('❌ 非交互式模式需要提供 --username 和 --password 参数')
      process.exit(1)
    }
    
    if (password.length < 6) {
      console.error('❌ 密码长度至少6位')
      process.exit(1)
    }
  } else {
    // 交互式模式
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const question = (prompt) => new Promise((resolve) => {
      rl.question(prompt, resolve)
    })

    console.log('\n🚀 博客系统初始化 - 创建管理员账号\n')

    username = await question('请输入管理员用户名: ')
    password = await question('请输入管理员密码: ')
    const confirmPassword = await question('请确认密码: ')

    rl.close()

    if (!username || !password) {
      console.error('❌ 用户名和密码不能为空')
      process.exit(1)
    }

    if (password !== confirmPassword) {
      console.error('❌ 两次密码输入不一致')
      process.exit(1)
    }

    if (password.length < 6) {
      console.error('❌ 密码长度至少6位')
      process.exit(1)
    }
  }

  console.log('\n正在创建管理员账号...')

  // 加密密码
  const passwordHash = await bcrypt.hash(password, 10)

  // 数据库路径
  const dataDir = path.join(__dirname, '..', 'server', 'data')
  const dbPath = path.join(dataDir, 'blog.db')

  // 确保目录存在
  await fs.mkdir(dataDir, { recursive: true })

  // 连接数据库
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 创建用户表（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // 检查用户是否已存在
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existingUser) {
    console.error(`❌ 用户 "${username}" 已存在`)
    db.close()
    process.exit(1)
  }

  // 创建用户
  const userId = `user-${Date.now()}`
  const now = Date.now()
  
  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, 'admin', ?, ?)
  `).run(userId, username, passwordHash, now, now)

  db.close()

  console.log('\n✅ 管理员账号创建成功！')
  console.log(`   用户名: ${username}`)
  console.log(`   角色: 管理员`)
  
  if (!args.nonInteractive) {
    console.log('\n📝 登录方式:')
    console.log('   POST /api/auth/login')
    console.log('   Body: { "username": "' + username + '", "password": "你的密码" }')
    console.log('\n🔑 登录后会获得 JWT Token，在后续请求中携带：')
    console.log('   Authorization: Bearer <token>')
    console.log('')
  }
}

main().catch(err => {
  console.error('❌ 错误:', err.message)
  process.exit(1)
})
