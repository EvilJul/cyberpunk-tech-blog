import test from 'node:test'
import assert from 'node:assert/strict'
import { requireSameOrigin, requireCsrf } from '../server/middleware/csrf.js'

/** 在独立配置下调用中间件并恢复环境，避免用请求数据充当可信配置。 */
function check({ env = 'production', publicOrigin = '', siteUrl = '', origin = 'https://trusted.example', host = 'attacker.example', protocol = 'https', headers = {}, csrf = false } = {}) {
  const saved = { ...process.env }
  try {
    process.env.NODE_ENV = env
    process.env.PUBLIC_ORIGIN = publicOrigin
    process.env.SITE_URL = siteUrl
    const requestHeaders = { host, origin, ...headers }
    const req = {
      method: 'POST', protocol, session: { csrfToken: 'a'.repeat(64) },
      // 模拟 Express 的不区分大小写请求头读取。
      get(name) { return requestHeaders[name.toLowerCase()] }
    }
    const result = { accepted: false, status: undefined, body: undefined }
    const res = {
      // 接收错误响应头，使断言聚焦于安全结果。
      set() { return this },
      // 记录拒绝状态码。
      status(value) { result.status = value; return this },
      // 记录结构化错误体。
      json(value) { result.body = value; return this }
    }
    const middleware = csrf ? requireCsrf : requireSameOrigin
    middleware(req, res, /* 记录通过校验的请求。 */ () => { result.accepted = true })
    return result
  } finally {
    for (const key of ['NODE_ENV', 'PUBLIC_ORIGIN', 'SITE_URL']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

/** 断言来源校验失败且没有继续执行下游。 */
function rejected(options) {
  const result = check(options)
  assert.equal(result.accepted, false)
  assert.equal(result.status, 403)
  assert.equal(result.body.error.code, 'INVALID_ORIGIN')
}

test('生产缺失配置时伪造 Host 和 Origin 也无法通过', /* 覆盖空值和空白配置的拒绝策略。 */ () => {
  rejected({ origin: 'https://attacker.example' })
  rejected({ publicOrigin: ' ', origin: 'https://attacker.example' })
  rejected({ siteUrl: ' ', origin: 'https://attacker.example' })
  rejected({ env: 'staging', origin: 'https://attacker.example' })
  rejected({ env: '', origin: 'https://attacker.example' })
})

test('显式 origin 优先于 SITE_URL 且不受 Host 和代理头影响', /* 验证精确可信来源和协议端口约束。 */ () => {
  const config = { publicOrigin: 'https://trusted.example', siteUrl: 'https://other.example/blog/' }
  assert.equal(check(config).accepted, true)
  rejected({ ...config, origin: 'https://other.example' })
  rejected({ ...config, origin: 'https://attacker.example', headers: { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' } })
  rejected({ ...config, origin: 'http://trusted.example' })
  rejected({ ...config, origin: 'https://trusted.example:444' })
  assert.equal(check({ publicOrigin: 'https://trusted.example:444/', origin: 'https://trusted.example:444' }).accepted, true)
})

test('SITE_URL 子路径仅提取 origin', /* 验证路径部署及固定来源下的 Host 伪造。 */ () => {
  for (const siteUrl of ['https://trusted.example/blog/', 'https://trusted.example/blog/nested']) {
    assert.equal(check({ siteUrl }).accepted, true)
    rejected({ siteUrl, origin: 'https://trusted.example/blog/' })
    rejected({ siteUrl, origin: 'https://attacker.example' })
  }
})

test('无效显式 origin 不得回退到有效站点或开发 Host', /* 拒绝非 HTTP(S)、路径、凭据、查询及片段等配置。 */ () => {
  for (const publicOrigin of [
    'not-a-url', 'ftp://trusted.example', '//trusted.example',
    'https://user:pass@trusted.example', 'https://trusted.example/blog/',
    'https://trusted.example/../', 'https://trusted.example?x=1',
    'https://trusted.example#x', 'https://trusted.example\\path',
    ' https://trusted.example', 'https://trusted.example\n'
  ]) {
    rejected({ publicOrigin, siteUrl: 'https://trusted.example/blog/' })
    rejected({ env: 'development', publicOrigin, host: 'trusted.example' })
  }
})

test('生产无效 SITE_URL 拒绝请求', /* 验证站点配置也执行协议及凭据限制。 */ () => {
  for (const siteUrl of ['bad', 'file:///tmp/blog', 'https://user:pass@trusted.example/blog/', 'https://trusted.example/blog/?x=1', 'https://trusted.example/blog/#x']) {
    rejected({ siteUrl })
  }
})

test('显式开发及测试环境忽略 SITE_URL 并使用 Host', /* 验证开发来源不受 SEO 地址影响且显式配置仍优先。 */ () => {
  for (const env of ['development', 'test']) {
    assert.equal(check({ env, host: 'trusted.example' }).accepted, true)
    rejected({ env, publicOrigin: 'bad', host: 'trusted.example' })
  }
  rejected({ env: 'development', host: 'different.example' })
  assert.equal(check({ env: 'development', siteUrl: 'bad', host: 'trusted.example' }).accepted, true)
  rejected({ env: 'development', publicOrigin: 'https://other.example', host: 'trusted.example' })
})

test('默认 SITE_URL 9098 与 Vite 9099 入口兼容', /* 模拟保留 Host 的 Vite 代理请求并验证生产仍固定来源。 */ () => {
  const config = { protocol: 'http', siteUrl: 'http://localhost:9098', host: 'localhost:9099', origin: 'http://localhost:9099' }
  for (const env of ['development', 'test']) {
    assert.equal(check({ ...config, env }).accepted, true)
    assert.equal(check({ ...config, env, csrf: true, headers: { 'x-csrf-token': 'a'.repeat(64) } }).accepted, true)
    rejected({ ...config, env, origin: 'http://localhost:9098' })
    rejected({ ...config, env, publicOrigin: 'http://localhost:9098' })
    assert.equal(check({ ...config, env, publicOrigin: 'http://localhost:9099' }).accepted, true)
  }
  for (const env of ['production', 'staging', '']) {
    rejected({ ...config, env })
    assert.equal(check({ ...config, env, origin: 'http://localhost:9098' }).accepted, true)
  }
})

test('Referer 回退仍需同源元数据且受固定配置约束', /* 阻止恶意 Referer 及缺失配置绕过。 */ () => {
  const headers = { 'sec-fetch-site': 'same-origin', referer: 'https://trusted.example/blog/studio' }
  assert.equal(check({ publicOrigin: 'https://trusted.example', origin: null, headers }).accepted, true)
  rejected({ origin: null, headers })
  rejected({ publicOrigin: 'https://trusted.example', origin: null, headers: { ...headers, referer: 'https://attacker.example/' } })
  rejected({ publicOrigin: 'https://trusted.example', origin: null, headers: { referer: headers.referer } })
})

test('有效 CSRF 令牌不能绕过生产来源拒绝', /* 验证来源防护在写请求组合中间件内仍生效。 */ () => {
  const headers = { 'x-csrf-token': 'a'.repeat(64) }
  rejected({ csrf: true, origin: 'https://attacker.example', headers })
  assert.equal(check({ csrf: true, publicOrigin: 'https://trusted.example', headers }).accepted, true)
})
