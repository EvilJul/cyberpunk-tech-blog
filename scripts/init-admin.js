#!/usr/bin/env node

/**
 * 初始化脚本 - 创建第一个管理员账号
 * 交互式: node scripts/init-admin.js
 * 非交互式: node scripts/init-admin.js --username admin --password 123456 --non-interactive
 */

import 'dotenv/config'
import readline from 'readline'
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

/** 收集并校验凭据，通过共享首装服务创建本地管理员。 */
async function main() {
  const args = parseArgs()
  let username = args.username
  let password = args.password

  if (args.nonInteractive) {
    // 非交互式模式
    // 优先使用环境变量，其次命令行参数
    if (!password) password = process.env.ADMIN_PASSWORD
    if (!password) {
      console.error('❌ 需要提供 --password 参数或 ADMIN_PASSWORD 环境变量')
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

    const question = (prompt) =>
      new Promise((resolve) => {
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

  username = username?.trim()
  if (
    !username ||
    username.length > 100 ||
    typeof password !== 'string' ||
    password.length > 1024
  ) {
    throw new Error('用户名需为 1–100 字符，密码不得超过 1024 字符')
  }
  console.log('\n正在创建管理员账号...')

  // Use exactly the service schema and path resolution, including BLOG_DATA_DIR.
  const { default: db, initDatabase } = await import('../server/db/index.js')
  const { initializeLocalAdmin } =
    await import('../server/services/setupService.js')
  const { migrateAuthWorkspace } =
    await import('../server/db/migrations/authWorkspace.js')
  const { default: logger } = await import('../server/utils/logger.js')
  try {
    initDatabase()
    migrateAuthWorkspace(db)
    await initializeLocalAdmin({ username, password })
  } finally {
    if (db.open) db.close()
    await new Promise(/* 等待日志流结束以完整释放初始化资源。 */ (resolve) => logger.end(resolve))
  }

  console.log('\n✅ 管理员账号创建成功！')
  console.log(`   用户名: ${username}`)
  console.log(`   角色: 管理员`)

  if (!args.nonInteractive) {
    console.log('\n📝 登录方式:')
    console.log('   打开站点 /login，使用管理员账号登录工作台')
    console.log('')
  }
}

main().catch(/* 报告初始化失败并设置退出状态。 */ (err) => {
  console.error('❌ 错误:', err.message)
  process.exitCode = 1
})
