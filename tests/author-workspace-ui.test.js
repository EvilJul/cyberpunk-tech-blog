import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// No application/database module is imported before temporary data isolation.
const directory = await mkdtemp(join(tmpdir(), 'blog-author-ui-'))
process.env.BLOG_DATA_DIR = directory
const source = (await readFile(new URL('../src/utils/studioApi.js', import.meta.url), 'utf8')).replace("import { apiUrl } from './api'", "const apiUrl = path => '/blog' + path")
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test.after(/* 移除隔离的工作区测试目录。 */ async () => { await rm(directory, { recursive: true, force: true }) })
test('returnTo accepts local routes and rejects encoded, cross-origin and control escapes', /* 验证返回地址仅允许安全本地路径。 */ () => {
  assert.equal(api.safeReturnTo('/studio/editor/7?preview=1'), '/studio/editor/7?preview=1')
  for (const value of ['https://evil.test', '//evil.test', '/%2fevil.test', '/%5cevil.test', '/%252fevil.test', '/a/../admin', '/%00evil', null]) assert.equal(api.safeReturnTo(value), '/studio')
})
test('studio sends cookie, CSRF and strong numeric revision; parses conflict without losing details', /* 验证会话请求头及冲突详情解析。 */ async () => {
  const previous = globalThis.fetch
  try {
    let request
    globalThis.fetch = /* 捕获请求参数并返回模拟保存结果。 */ async (url, options) => { request = { url, ...options }; return new Response(JSON.stringify({ id: 9, revision: 4 })) }
    api.setCsrfToken('csrf-memory')
    assert.equal((await api.studioApi('/api/studio/articles/9/draft', { method: 'PUT', revision: 3, body: { content: '原文\n' } })).revision, 4)
    assert.equal(request.url, '/blog/api/studio/articles/9/draft')
    assert.equal(request.credentials, 'same-origin')
    assert.equal(request.headers.get('If-Match'), '"3"')
    assert.equal(request.headers.get('X-CSRF-Token'), 'csrf-memory')
    assert.equal(JSON.parse(request.body).content, '原文\n')
    globalThis.fetch = /* 返回带详情的模拟版本冲突。 */ async () => new Response(JSON.stringify({ error: { code: 'REVISION_CONFLICT', message: '版本冲突', details: { revision: 5 } }, request_id: 'fixture' }), { status: 412 })
    await assert.rejects(api.studioApi('/api/studio/articles/9'), /* 匹配冲突状态、版本及请求标识。 */ e => e.status === 412 && e.details.revision === 5 && e.requestId === 'fixture')
    assert.throws(/* 触发通配版本标签的拒绝路径。 */ () => api.revisionTag('*'))
  } finally { globalThis.fetch = previous; api.setCsrfToken(null) }
})
test('multipart preserves browser boundary while sending CSRF', /* 验证图片上传保留浏览器生成的请求边界。 */ async () => {
  const previous = globalThis.fetch
  try {
    const body = new FormData(); body.append('file', new Blob(['fixture']), 'fixture.png')
    api.setCsrfToken('csrf')
    globalThis.fetch = /* 检查上传正文与安全请求头并返回成功。 */ async (_, options) => { assert.equal(options.body, body); assert.equal(options.headers.has('Content-Type'), false); assert.equal(options.headers.get('X-CSRF-Token'), 'csrf'); return new Response('{}') }
    await api.studioApi('/api/studio/media', { method: 'POST', body })
  } finally { globalThis.fetch = previous; api.setCsrfToken(null) }
})
test('browser: login entry, protected editor, late saves, conflict recovery and explicit publish', /* 验收登录、迟到保存、冲突保留与显式发布。 */ async () => {
  const { createServer } = await import('node:http')
  const { chromium } = await import('playwright')
  const { existsSync } = await import('node:fs')
  const root = new URL('../dist/', import.meta.url)
  assert.ok(existsSync(new URL('index.html', root)), 'run npm run build first')
  const server = createServer(/* 为浏览器验收提供构建后的静态资源。 */ async (req, res) => {
    const path = new URL(req.url, 'http://local').pathname
    const relative = path.startsWith('/assets/') ? path.slice(1) : 'index.html'
    try { const body = await readFile(new URL(relative, root)); res.setHeader('Content-Type', relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html'); res.end(body) } catch { res.statusCode = 404; res.end() }
  })
  await new Promise(/* 启动仅监听本机的临时资源服务。 */ resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []; page.on('pageerror', /* 收集浏览器运行时错误。 */ e => errors.push(e.message))
    let loggedIn = false, releaseSave, saveStarted, conflict = false, published = 0
    let article = { id: 7, title: '初始标题', slug: 'first', public_slug: null, content: '原始正文', excerpt: '', author: '作者', category: '', tags: [], status: 'draft', revision: 1, published_revision: null }
    const json = /* 向拦截请求返回指定状态的 JSON。 */ (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    await page.route('**/api/**', /* 模拟作者会话与文章工作区接口。 */ async route => {
      const request = route.request(), path = new URL(request.url()).pathname
      if (path === '/api/session/me') return json(route, loggedIn ? { user: { id: 1, username: '作者', role: 'admin' }, csrfToken: 'test-csrf' } : { error: { message: '未登录' } }, loggedIn ? 200 : 401)
      if (path === '/api/session/login') { loggedIn = true; return json(route, { user: { id: 1, username: '作者', role: 'admin' }, csrfToken: 'test-csrf' }) }
      if (path === '/api/studio/articles/7/draft') {
        assert.equal(request.headers()['x-csrf-token'], 'test-csrf')
        assert.equal(request.headers()['if-match'], `"${article.revision}"`)
        if (conflict) return json(route, { error: { code: 'REVISION_CONFLICT', message: '版本已更新' } }, 412)
        const payload = request.postDataJSON()
        if (saveStarted) { saveStarted(); await new Promise(/* 挂起保存响应以模拟继续输入。 */ resolve => { releaseSave = resolve }) }
        article = { ...article, ...payload, revision: article.revision + 1 }
        return json(route, article)
      }
      if (path === '/api/studio/articles/7/publish') { published++; assert.equal(request.headers()['if-match'], `"${article.revision}"`); article = { ...article, status: 'published', published_revision: article.revision + 1, revision: article.revision + 1 }; return json(route, article) }
      if (path === '/api/studio/articles/7') return json(route, article)
      if (path === '/api/settings') return json(route, {})
      return json(route, { data: [], pagination: { total: 0 } })
    })
    const origin = `http://127.0.0.1:${server.address().port}`
    await page.goto(`${origin}/studio/editor/7`)
    await page.getByRole('heading', { name: '作者登录' }).waitFor()
    await page.getByLabel('用户名').fill('作者'); await page.getByLabel('密码', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('heading', { name: '编辑文章' }).waitFor()
    await page.getByLabel('Markdown 正文').fill('第一批修改')
    const started = new Promise(/* 记录保存请求开始的通知函数。 */ resolve => { saveStarted = resolve })
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await started
    await page.getByLabel('Markdown 正文').fill('保存期间继续输入')
    releaseSave(); saveStarted = null
    await page.getByText('草稿已保存，之后输入仍未保存').waitFor()
    assert.equal(await page.getByLabel('Markdown 正文').inputValue(), '保存期间继续输入')
    assert.equal(published, 0)
    conflict = true
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '冲突' }).waitFor()
    assert.equal(await page.getByLabel('Markdown 正文').inputValue(), '保存期间继续输入')
    conflict = false
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.getByText('服务端草稿已保存', { exact: true }).waitFor()
    page.on('dialog', /* 接受发布确认对话框。 */ d => d.accept())
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await page.getByText('发布成功', { exact: true }).waitFor()
    assert.equal(published, 1)
    assert.deepEqual(errors, [])
  } finally { await browser?.close(); await new Promise(/* 等待临时资源服务关闭。 */ resolve => server.close(resolve)) }
})
