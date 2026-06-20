#!/usr/bin/env node

/**
 * 初始化脚本 - 创建第一个管理员账号
 * 运行: node scripts/init-admin.js
 */

import readline from 'readline'
import bcrypt from 'bcrypt'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  console.log('\n🚀 博客系统初始化 - 创建管理员账号\n')

  const username = await question('请输入管理员用户名: ')
  const password = await question('请输入管理员密码: ')
  const confirmPassword = await question('请确认密码: ')

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

  console.log('\n正在创建管理员账号...')

  // 加密密码
  const passwordHash = await bcrypt.hash(password, 10)

  // 创建用户数据
  const user = {
    id: `user-${Date.now()}`,
    username,
    passwordHash,
    role: 'admin',
    createdAt: new Date().toISOString()
  }

  // 保存到文件
  const dataDir = path.join(__dirname, '..', 'server', 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const usersFile = path.join(dataDir, 'users.json')
  const users = { users: [user] }

  await fs.writeFile(usersFile, JSON.stringify(users, null, 2))

  console.log('\n✅ 管理员账号创建成功！')
  console.log(`   用户名: ${username}`)
  console.log(`   角色: 管理员`)
  console.log('\n📝 登录方式:')
  console.log('   POST /api/auth/login')
  console.log('   Body: { "username": "' + username + '", "password": "你的密码" }')
  console.log('\n🔑 登录后会获得 JWT Token，在后续请求中携带：')
  console.log('   Authorization: Bearer <token>')
  console.log('')

  rl.close()
}

main().catch(err => {
  console.error('❌ 错误:', err.message)
  process.exit(1)
})
