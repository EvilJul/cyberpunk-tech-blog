import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authLimiter, loginIpLimiter } from '../server/middleware/rateLimit.js'

const paths = ['/api/session/login', '/api/auth/login']

/** 启动真实 HTTP 服务并在测试结束时关闭，返回可发送登录请求的辅助对象。 */
async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise(/* 等待随机端口就绪。 */ (resolve) => server.once('listening', resolve))
  t.after(/* 关闭测试监听及连接。 */ () => new Promise((/* 确认服务完全关闭。 */ resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    /** 发送并消费响应，确保成功请求的 finish 退款在下一请求前完成。 */
    async login(ip, username = 'admin', route = paths[0], success = false) {
      const response = await fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base, 'X-Forwarded-For': ip },
        body: JSON.stringify({ username, password: 'invalid-password', success })
      })
      await response.text()
      return response
    }
  }
}

/** 用明确可信的本机代理模拟不同客户端，计数器验证拒绝发生在 handler 之前。 */
async function fixture(t, trustProxy = 'loopback') {
  const app = express()
  app.set('trust proxy', trustProxy)
  app.use(express.json())
  const counts = { handler: 0, general: 0 }
  app.post(paths, loginIpLimiter, authLimiter, /* 模拟凭据校验结果并记录业务处理次数。 */ (req, res) => {
    counts.handler++
    res.sendStatus(req.body.success ? 200 : 401)
  })
  app.use(/* 登录应在通用限流之前结束，不能依赖其提供保护。 */ (req, res) => {
    counts.general++
    res.sendStatus(404)
  })
  return { ...await serve(t, app), counts }
}

test('轮换用户名仍共享 IP 50 次额度，两个入口共用且拒绝不进入 handler', /* 验证第 50 次放行、第 51 次起拦截。 */ async (t) => {
  const { login, counts } = await fixture(t)
  for (let i = 0; i < 50; i++) {
    assert.equal((await login('192.0.2.10', `user-${i}`, paths[i % 2])).status, 401)
  }
  for (const route of paths) {
    const blocked = await login('192.0.2.10', 'fresh-user', route)
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
  }
  assert.deepEqual(counts, { handler: 50, general: 0 })
})

test('trim 后的用户名共享组合桶和两个入口额度，同账号跨 IP 不锁定', /* 验证组合第六次拒绝以及跨 IP 隔离。 */ async (t) => {
  const { login, counts } = await fixture(t)
  for (let i = 0; i < 5; i++) {
    assert.equal((await login('192.0.2.20', i % 2 ? ' \tadmin\n' : 'admin', paths[i % 2])).status, 401)
  }
  assert.equal((await login('192.0.2.20', ' admin ', paths[1])).status, 429)
  assert.equal(counts.handler, 5)
  assert.equal((await login('192.0.2.21', 'admin')).status, 401)
  assert.equal((await login('192.0.2.20', 'other')).status, 401)
  assert.equal(counts.handler, 7)
})

test('成功登录归还组合额度，但仍计入 IP 总量且不清除历史失败', /* 验证退款语义不会重置已有失败计数。 */ async (t) => {
  const { login, counts } = await fixture(t)
  for (let i = 0; i < 4; i++) assert.equal((await login('192.0.2.30')).status, 401)
  for (let i = 0; i < 10; i++) assert.equal((await login('192.0.2.30', 'admin', paths[i % 2], true)).status, 200)
  assert.equal((await login('192.0.2.30')).status, 401)
  assert.equal((await login('192.0.2.30')).status, 429)
  assert.equal(counts.handler, 15)
  // 前 16 次已消耗 IP 额度，包括组合限流拒绝的请求。
  for (let i = 0; i < 34; i++) assert.equal((await login('192.0.2.30', `other-${i}`, paths[1], true)).status, 200)
  assert.equal((await login('192.0.2.30', 'fresh', paths[0], true)).status, 429)
  assert.equal(counts.handler, 49)
})

test('未配置可信代理时轮换 XFF 无法更换客户端 IP', /* 验证客户端伪造头不会改变组合桶。 */ async (t) => {
  const { login, counts } = await fixture(t, false)
  for (let i = 0; i < 5; i++) assert.equal((await login(`198.51.100.${i + 1}`, 'spoof-target')).status, 401)
  assert.equal((await login('203.0.113.99', 'spoof-target')).status, 429)
  assert.equal(counts.handler, 5)
})

test('IPv6 等价表示及同 /56 地址共享额度，其他网段独立，映射 IPv4 合并', /* 验证 IPv6 标准化和网段聚合。 */ async (t) => {
  const { login, counts } = await fixture(t)
  for (let i = 0; i < 5; i++) assert.equal((await login('2001:db8:1234:5600::1')).status, 401)
  assert.equal((await login('2001:0db8:1234:5600:0000:0000:0000:0001')).status, 429)
  assert.equal((await login('2001:db8:1234:56ff::2')).status, 429)
  assert.equal(counts.handler, 5)
  assert.equal((await login('2001:db8:1234:5700::1')).status, 401)
  for (let i = 0; i < 5; i++) assert.equal((await login('::ffff:192.0.2.40')).status, 401)
  assert.equal((await login('192.0.2.40')).status, 429)
  assert.equal(counts.handler, 11)
})

test('超长原始用户名和非字符串共享固定无效桶，合法用户名独立', /* 验证 trim 前检查长度，且无效输入不会生成独立大键。 */ async (t) => {
  const { login, counts } = await fixture(t)
  const invalidNames = [' '.repeat(100) + 'a', 'x'.repeat(8192), null, 123, { name: 'admin' }]
  for (const username of invalidNames) assert.equal((await login('192.0.2.60', username)).status, 401)
  assert.equal((await login('192.0.2.60', ['admin'], paths[1])).status, 429)
  assert.equal((await login('192.0.2.60', 'y'.repeat(9000))).status, 429)
  assert.equal(counts.handler, 5)
  assert.equal((await login('192.0.2.60', 'a')).status, 401)
  assert.equal((await login('192.0.2.60', 'invalid')).status, 401)
  assert.equal((await login('192.0.2.60', 'n'.repeat(100))).status, 401)
  assert.equal(counts.handler, 8)
})

test('实际 app 两个登录入口在通用限流之前共享 IP 额度', /* 使用隔离数据库核验真实路由装配。 */ async (t) => {
  process.env.BLOG_DATA_DIR = await mkdtemp(join(tmpdir(), 'login-rate-limit-'))
  process.env.JWT_SECRET = 'login-rate-limit-test-only-secret'
  process.env.LEGACY_JWT_ENABLED = 'true'
  delete process.env.TRUST_PROXY
  delete process.env.VITE_BASE_PATH
  const { app } = await import('../server/index.js')
  const { default: db } = await import('../server/db/index.js')
  t.after(/* 关闭隔离数据库，不接触项目业务数据。 */ () => db.close())
  // 前面的未信任代理用例也使用本机来源，清除其共享 IP 测试额度。
  loginIpLimiter.resetKey('127.0.0.1')
  const { login } = await serve(t, app)
  for (let i = 0; i < 50; i++) {
    assert.equal((await login(`203.0.113.${i + 1}`, `missing-${i}`, paths[i % 2])).status, 401)
  }
  for (const route of paths) assert.equal((await login('203.0.113.200', 'fresh', route)).status, 429)
})
