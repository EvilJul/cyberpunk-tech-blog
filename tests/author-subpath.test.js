import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { chromium, expect } from 'playwright/test'
import { startFixture } from './helpers/server.js'

const runFile = promisify(execFile)

// 对应两项 change 的前缀会话、同源 CSRF、共享草稿发布与机器身份隔离约束。
test('真实 /blog/ 作者链路保留部署前缀、会话边界与显式发布', { timeout: 180000 }, /* 在临时构建和数据库上验收完整子路径作者流程。 */ async t => {
  const repository = resolve(import.meta.dirname, '..')
  const temporary = await mkdtemp(join(tmpdir(), 'bolg-author-subpath-'))
  t.after(/* 清理临时构建产物及构建环境目录。 */ () => rm(temporary, { recursive: true, force: true }))
  const dist = join(temporary, 'dist')
  await runFile(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: repository,
    env: { ...process.env, VITE_BASE_PATH: '/blog/', BLOG_DATA_DIR: join(temporary, 'build-data') },
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024
  })
  const { root, base } = await startFixture(t, 'server/index.js', {
    VITE_BASE_PATH: '/blog/', BLOG_DIST_DIR: dist,
    SESSION_COOKIE_SECURE: 'false', NODE_ENV: 'test',
    PUBLIC_ORIGIN: '', SITE_URL: '', PUBLISHING_API_ENABLED: 'false', BLOG_LOG_DIR: ''
  })
  // 密码仅在运行期生成，通过子进程环境传递，不进入参数、日志或证据文件。
  const username = 'subpath-fixture-owner'
  const password = randomBytes(24).toString('hex')
  await runFile(process.execPath, ['scripts/init-admin.js', '--username', username, '--non-interactive'], {
    cwd: repository,
    env: { ...process.env, BLOG_DATA_DIR: root, BLOG_LOG_DIR: join(root, 'logs'), ADMIN_PASSWORD: password, NODE_ENV: 'test' },
    timeout: 20000
  })
  const browser = await chromium.launch({ headless: true })
  t.after(/* 关闭浏览器及其隔离会话。 */ () => browser.close())
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', /* 仅记录浏览器运行时错误，不收集请求凭据。 */ error => errors.push(error.message))
  page.on('dialog', /* 接受显式发布的确认提示。 */ dialog => dialog.accept())

  // 不模拟应用接口；先验证匿名工作台接口确实拒绝访问。
  assert.equal((await context.request.get(base + '/blog/api/studio/articles')).status(), 401)
  await page.goto(base + '/blog/login')
  await page.getByRole('heading', { name: '作者登录', exact: true }).waitFor()
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  const loginResponse = page.waitForResponse(/* 匹配子路径下的真实登录响应。 */ response =>
    new URL(response.url()).pathname === '/blog/api/session/login' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  assert.equal((await loginResponse).status(), 200)
  await expect(page).toHaveURL(new RegExp(`^${base}/blog/studio(?:/articles)?$`))
  const cookies = await context.cookies()
  const cookie = cookies.find(/* 查找浏览器管理会话而不输出其值。 */ value => value.name === 'blog_session')
  assert.ok(cookie, '登录应建立浏览器会话')
  assert.equal(cookie.path, '/blog/')
  assert.equal(cookie.httpOnly, true)
  assert.equal(cookie.sameSite, 'Lax')
  assert.equal(cookie.secure, false)
  assert.equal((await context.cookies(base + '/api/studio/articles')).some(/* 检查浏览器不会向根路径发送作者会话。 */ value => value.name === 'blog_session'), false)
  const identity = await (await context.request.get(base + '/blog/api/session/me')).json()
  assert.equal(identity.user.username, username)
  assert.ok(identity.csrfToken)

  await page.getByRole('navigation', { name: '作者工作区' }).getByRole('link', { name: '新建文章', exact: true }).click()
  await page.getByRole('heading', { name: '新建文章', exact: true }).waitFor()
  await page.getByLabel('标题', { exact: true }).fill('子路径真实作者验收')
  await page.getByLabel('文章地址', { exact: true }).fill('author-subpath-fixture')
  await page.getByLabel('Markdown 正文').fill('# 子路径正文\n\n先保存草稿，再显式发布。')
  const image = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#426a84' } }).png().toBuffer()
  const uploading = page.waitForResponse(/* 匹配编辑器实际发出的带前缀媒体请求。 */ response =>
    new URL(response.url()).pathname === '/blog/api/studio/media' && response.request().method() === 'POST')
  await page.getByLabel('插入图片（上传后可公开访问）').setInputFiles({ name: 'subpath.png', mimeType: 'image/png', buffer: image })
  const upload = await uploading
  assert.equal(upload.status(), 200)
  const uploadHeaders = await upload.request().allHeaders()
  assert.equal(uploadHeaders.origin, base)
  assert.ok(uploadHeaders['x-csrf-token'] === identity.csrfToken, '上传应携带当前会话 CSRF')
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(/!\[图片\]\(\/blog\/uploads\/[^)]+\)/)
  const markdown = await page.getByLabel('Markdown 正文').inputValue()
  const imagePath = markdown.match(/!\[图片\]\((\/blog\/uploads\/[^)]+)\)/)[1]
  const uploadedImage = await context.request.get(base + imagePath)
  assert.equal(uploadedImage.status(), 200)
  assert.match(uploadedImage.headers()['content-type'], /^image\//)
  const decoded = await sharp(await uploadedImage.body()).metadata()
  assert.ok(decoded.width > 0 && decoded.height > 0)

  const saving = page.waitForResponse(/* 匹配子路径草稿创建响应。 */ response =>
    new URL(response.url()).pathname === '/blog/api/studio/articles' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  const savedResponse = await saving
  assert.equal(savedResponse.status(), 201)
  const draft = await savedResponse.json()
  assert.equal(draft.status, 'draft')
  assert.equal(draft.content, markdown)
  await page.waitForURL(`**/blog/studio/editor/${draft.id}`)
  assert.equal((await context.request.get(base + '/blog/api/articles/' + draft.slug)).status(), 404)
  await page.getByRole('heading', { name: '编辑文章', exact: true }).waitFor()
  await page.getByLabel('标题', { exact: true }).fill('子路径编辑后发布')
  const publishing = page.waitForResponse(/* 匹配带版本条件的真实发布响应。 */ response =>
    new URL(response.url()).pathname === `/blog/api/studio/articles/${draft.id}/publish` && response.request().method() === 'POST')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const published = await publishing
  assert.equal(published.status(), 200)
  assert.match(published.request().headers()['if-match'], /^"\d+"$/)
  await page.getByText('发布成功', { exact: true }).waitFor()
  const publicArticle = await (await context.request.get(base + '/blog/api/articles/' + draft.slug)).json()
  assert.equal(publicArticle.title, '子路径编辑后发布')
  assert.equal(publicArticle.content, markdown)

  await page.getByRole('link', { name: '站点设置', exact: true }).click()
  await page.getByLabel('站点名称', { exact: true }).fill('子路径设置已保存')
  const settingsSaved = page.waitForResponse(/* 匹配设置页同源保存响应。 */ response =>
    new URL(response.url()).pathname === '/blog/api/studio/settings' && response.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  const settingsResponse = await settingsSaved
  assert.equal(settingsResponse.status(), 200)
  const settingsHeaders = await settingsResponse.request().allHeaders()
  assert.equal(settingsHeaders.origin, base)
  assert.ok(settingsHeaders['x-csrf-token'] === identity.csrfToken, '设置保存应携带当前会话 CSRF')
  const settings = (await (await context.request.get(base + '/blog/api/settings')).json()).settings
  assert.equal(settings.title, '子路径设置已保存')
  for (const headers of [{ Origin: base }, { Origin: 'https://foreign.example.invalid', 'X-CSRF-Token': identity.csrfToken }]) {
    const denied = await context.request.put(base + '/blog/api/studio/settings', { headers, data: { title: '不应生效' } })
    assert.equal(denied.status(), 403)
  }
  assert.equal((await (await context.request.get(base + '/blog/api/settings')).json()).settings.title, settings.title)

  // 手工附带有效会话和 CSRF，证明根路径拒绝来自服务端路由而非仅依赖 Cookie Path。
  for (const method of ['GET', 'PUT']) {
    const response = await fetch(base + '/api/studio/settings', {
      method,
      headers: { Cookie: `${cookie.name}=${cookie.value}`, Origin: base, 'X-CSRF-Token': identity.csrfToken, 'Content-Type': 'application/json' },
      ...(method === 'PUT' ? { body: JSON.stringify({ title: '无前缀不得写入' }) } : {})
    })
    assert.equal(response.status, 404)
    assert.equal((await response.json()).error.code, 'NOT_FOUND')
  }
  assert.equal((await context.request.get(base + '/blog/api/v1/connection')).status(), 404)
  assert.equal((await (await context.request.get(base + '/blog/api/settings')).json()).settings.title, settings.title)
  await page.goto(base + '/blog/article/' + draft.slug)
  await expect(page.getByRole('heading', { name: '子路径编辑后发布', exact: true })).toBeVisible()
  await expect(page.locator(`.markdown-body img[src="${imagePath}"]`)).toBeVisible()
  assert.deepEqual(errors, [])
  t.diagnostic('真实 /blog/ UI 登录、编辑发布、前缀媒体、设置 CSRF 与根路径隔离均通过；临时产物及数据由 fixture 清理')
})
