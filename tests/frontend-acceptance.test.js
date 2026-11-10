import test from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm, access, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { chromium, expect } from 'playwright/test'

// Run after npm run build and npx playwright install chromium:
// node --test tests/frontend-acceptance.test.js
// No existing service, business database, or mocked frontend is used.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(repo, 'test-results', 'frontend-acceptance')
const code = 'const answer = 42;\nconsole.log(answer);'
const content = `# 阅读验收\n\n## 重复 *标题*\n\n正文 **加粗** 与 [安全链接](https://example.com)。\n\n| 功能 | 状态 |\n| --- | --- |\n| GFM 表格 | 可读 |\n\n> 引用内容\n\n- 第一项\n  - 嵌套项目\n\n\`\`\`javascript\n${code}\n\`\`\`\n\n![验收示意图](/uploads/acceptance.svg)\n\n### 三级标题\n\n${'长文阅读内容用于滚动测试。'.repeat(90)}\n\n## 重复 *标题*\n\n![第二张示意图](/uploads/acceptance.svg)\n\n<script>window.__acceptanceXss = true</script>\n<img src=x onerror="window.__acceptanceXss=true">\n\n[危险链接](javascript:window.__acceptanceXss=true)\n`

test('production browser acceptance: navigation, reading, moderation and request budget', { timeout: 180000 }, /* 使用隔离生产服务验证读者交互与公开数据隔离。 */ async t => {
  await access(join(repo, 'dist/index.html'))
  await mkdir(artifacts, { recursive: true })
  const root = await mkdtemp(join(tmpdir(), 'blog-browser-'))
  let browser, child, db
  const evidence = { startedAt: new Date().toISOString(), dist: join(repo, 'dist'), isolated: true, checks: [], screenshots: [], browserErrors: [] }
  t.after(async () => {
    await browser?.close()
    db?.close()
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
      await exited
      clearTimeout(timer)
    }
    evidence.serverLog = await readFile(join(root, 'logs/error.log'), 'utf8').catch(() => '')
    await writeFile(join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2))
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(join(root, 'uploads'))
  await writeFile(join(root, 'uploads/acceptance.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240"><rect width="720" height="240" fill="#243555"/><circle cx="120" cy="120" r="70" fill="#f0b34d"/><path d="M250 70h360v100H250z" fill="#79b8ad"/></svg>')
  await writeFile(join(root, 'settings.json'), JSON.stringify({ title: '浏览器验收博客', perpage: 10, sidebar: 'right', footer: true, author: '验收作者' }))
  const reservation = createServer()
  await new Promise(resolvePort => reservation.listen(0, '127.0.0.1', resolvePort))
  const reservedPort = reservation.address().port
  await new Promise(resolveClose => reservation.close(resolveClose))
  child = fork(join(repo, 'server/index.js'), [], { cwd: repo, env: {
    ...process.env, NODE_ENV: 'production', PUBLIC_HOST: '127.0.0.1', PUBLIC_PORT: String(reservedPort),
    BLOG_DATA_DIR: root, BLOG_LOG_DIR: join(root, 'logs'), BLOG_DIST_DIR: join(repo, 'dist'),
    JWT_SECRET: 'browser-acceptance-isolated-secret-1234567890', VITE_BASE_PATH: '/',
    PUBLIC_ORIGIN: `http://127.0.0.1:${reservedPort}`, CORS_ORIGIN: `http://127.0.0.1:${reservedPort}`, SITE_URL: 'http://127.0.0.1'
  }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(Error(`Startup timeout: ${output}`)), 15000)
    child.once('message', message => { clearTimeout(timer); resolvePort(message.port) })
    child.once('exit', status => { clearTimeout(timer); reject(Error(`Server exited ${status}: ${output}`)) })
  })
  const base = `http://127.0.0.1:${port}`
  db = new Database(join(root, 'blog.db'))
  db.transaction(() => {
    db.prepare('INSERT INTO categories(id,name,slug,created_at) VALUES(1,?,?,?)').run('阅读分类', 'reading', 1)
    db.prepare('INSERT INTO tags(id,name,slug,created_at) VALUES(1,?,?,?)').run('验收标签', 'acceptance', 1)
    const insert = db.prepare('INSERT INTO articles(id,title,slug,content,excerpt,author,category_id,status,publish_date,created_at,updated_at) VALUES(?,?,?,?,?,?,1,\'published\',?,?,?)')
    for (let i = 0; i < 12; i++) {
      insert.run(`acceptance-${i}`, i === 0 ? '完整阅读验收文章' : `验收列表文章 ${i}`, `acceptance-${i}`, content, '安全 Markdown、评论审核与导航验收。', '验收作者', `2026-11-${String(20 - i).padStart(2, '0')}`, Date.now(), Date.now())
      db.prepare('INSERT INTO article_tags(article_id,tag_id) VALUES(?,1)').run(`acceptance-${i}`)
      db.prepare('INSERT INTO article_stats(article_id,views,likes) VALUES(?,42,7)').run(`acceptance-${i}`)
    }
    const comment = db.prepare('INSERT INTO comments(id,article_id,parent_id,author,content,status,created_at) VALUES(?,\'acceptance-0\',?,?,?,?,?)')
    comment.run('approved-parent', null, '已审作者', '已审根评论', 'approved', Date.now())
    comment.run('approved-child', 'approved-parent', '已审回复者', '已审嵌套回复', 'approved', Date.now())
    comment.run('hidden-pending', null, '待审作者', '数据库待审核隐私内容', 'pending', Date.now())
  })()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
  // 隔离验收不依赖外部字体 CDN，统一使用系统回退字体并保留全部布局断言。
  await context.route('https://fonts.googleapis.com/**', /* 返回空字体表，避免外网字体阻塞本地页面 load。 */ route => route.fulfill({ contentType: 'text/css', body: '' }))
  evidence.externalFontFixture = 'system fallback; remote stylesheet isolated'
  const page = await context.newPage()
  page.on('pageerror', error => evidence.browserErrors.push({ kind: 'pageerror', message: error.message }))
  page.on('console', message => { if (message.type() === 'error' || /CORS|Content Security Policy|violates.*directive/i.test(message.text())) evidence.browserErrors.push({ kind: message.type(), message: message.text() }) })
  page.setDefaultTimeout(10000)
  const requests = []
  page.on('request', request => { if (request.url().startsWith(base)) requests.push({ method: request.method(), path: new URL(request.url()).pathname, query: new URL(request.url()).search }) })
  const check = async (name, fn) => t.test(name, async () => { const start = Date.now(); try { await fn(); evidence.checks.push({ name, status: 'passed', durationMs: Date.now() - start }) } catch (error) { evidence.checks.push({ name, status: 'failed', error: error.message }); await writeFile(join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2)); await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {}); throw error } })

  await check('ten cards use paginated list statistics; one settings refresh per interval and visibility event', async () => {
    await page.clock.install()
    await page.goto(base)
    await expect(page.locator('main').getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    await expect(page.locator('main a[href^="/article/"]')).toHaveCount(10)
    assert.equal(requests.filter(r => r.path.startsWith('/api/stats/article/')).length, 0)
    const lists = requests.filter(r => r.path === '/api/articles')
    assert.equal(lists.length, 1, 'sidebar must not fetch a second full article list')
    assert.match(lists[0].query, /per_page=10/)
    const settingsCount = () => requests.filter(r => r.path === '/api/settings').length
    assert.equal(settingsCount(), 1)
    await page.clock.runFor(30050)
    await expect.poll(settingsCount).toBe(2)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(settingsCount).toBe(3)
    evidence.requests = [...requests]
    await page.clock.resume()
  })
  await check('article refresh, browser back/forward, category and tag deep links', async () => {
    await page.getByRole('link', { name: '完整阅读验收文章', exact: true }).click()
    await expect(page).toHaveURL(`${base}/article/acceptance-0`)
    await expect(page.getByRole('heading', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.locator('.markdown-body table')).toBeVisible()
    await page.getByRole('link', { name: '返回文章列表' }).click()
    await page.waitForLoadState('networkidle')
    await page.goBack()
    await expect(page).toHaveURL(`${base}/article/acceptance-0`)
    await page.goForward()
    await expect(page).toHaveURL(`${base}/`)
    await page.waitForLoadState('networkidle')
    for (const path of ['/category/阅读分类', '/tag/验收标签']) {
      await page.goto(`${base}${path}`)
      await expect(page.getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await page.reload()
      await expect(page.getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    }
    await page.waitForLoadState('networkidle')
    await page.goto(`${base}/article/acceptance-0`)
  })
  await check('GFM, highlight, line numbers, clipboard, unique TOC IDs and XSS nonexecution', async () => {
    const body = page.locator('.markdown-body')
    await expect(body.locator('table td').first()).toHaveText('GFM 表格')
    await expect(body.locator('blockquote')).toContainText('引用内容')
    await expect(body.locator('ul ul')).toContainText('嵌套项目')
    assert.ok(await body.locator('pre code [class*="hljs-"]').count() > 0)
    await expect(body.locator('.code-line')).toHaveCount(2)
    assert.notEqual(await body.locator('.code-line').first().evaluate(el => getComputedStyle(el, '::before').content), 'none')
    await page.getByRole('button', { name: '复制代码', exact: true }).click()
    await expect(page.getByRole('button', { name: '已复制', exact: true })).toBeVisible()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code)
    const headings = await body.locator('h1,h2,h3').evaluateAll(nodes => nodes.map(n => ({ id: n.id, text: n.textContent })))
    assert.equal(headings.length, 4)
    assert.equal(new Set(headings.map(h => h.id)).size, 4)
    for (const heading of headings) assert.ok(heading.id)
    assert.deepEqual(await page.getByRole('navigation', { name: '文章目录' }).locator('a').evaluateAll(nodes => nodes.map(n => decodeURIComponent(n.hash.slice(1)))), headings.map(h => h.id))
    await page.getByRole('navigation', { name: '文章目录' }).locator('a').last().click()
    await expect(page).toHaveURL(new RegExp(`#${encodeURI(headings.at(-1).id)}$`))
    assert.equal(await body.locator('script,[onerror],a[href^="javascript:"]').count(), 0)
    const dangerous = body.locator('a').filter({ hasText: '危险链接' })
    await expect(dangerous).toHaveCount(1)
    assert.ok(!/^javascript:/i.test(await dangerous.getAttribute('href') || ''))
    await dangerous.click()
    assert.equal(await page.evaluate(() => window.__acceptanceXss), undefined)
    await expect(page.locator('article > header')).toContainText(/约 \d+ 分钟/)
    await expect(body.locator('img').nth(1)).toHaveAttribute('loading', 'lazy')
    await expect(body.locator('img').nth(1)).toHaveAttribute('decoding', 'async')
  })
  await check('article title and Open Graph survive settings visibility refresh', async () => {
    const expectedTitle = '完整阅读验收文章 - 浏览器验收博客'
    await expect(page).toHaveTitle(expectedTitle)
    await page.waitForLoadState('networkidle')
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings')
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await refreshed
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(expectedTitle)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', expectedTitle)
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', '安全 Markdown、评论审核与导航验收。')
  })
  await check('image preview closes with Escape and restores trigger focus', async () => {
    const trigger = page.getByRole('button', { name: '放大图片：验收示意图', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
    await page.screenshot({ path: join(artifacts, 'image-preview.png') })
    evidence.screenshots.push('image-preview.png')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })
  await check('approved reply tree; submitted reply remains pending and invisible after refresh', async () => {
    await expect(page.locator('.comments > ul > li > ul')).toContainText('已审嵌套回复')
    await expect(page.locator('.comments')).not.toContainText('数据库待审核隐私内容')
    await page.getByRole('button', { name: '回复 已审作者', exact: true }).click()
    await expect(page.getByLabel('评论内容')).toBeFocused()
    await expect(page.getByLabel('昵称')).toHaveAttribute('maxlength', '50')
    await page.getByLabel('昵称').fill('访'.repeat(51))
    await expect(page.getByLabel('昵称')).toHaveValue('访'.repeat(50))
    await expect(page.getByLabel('评论内容', { exact: true })).toHaveAttribute('maxlength', '2000')
    await expect(page.getByLabel('邮箱（不公开）', { exact: true })).toHaveAttribute('maxlength', '254')
    await page.getByLabel('昵称').fill('浏览器访客')
    await page.getByLabel('评论内容').fill('浏览器提交待审核内容')
    await page.getByRole('button', { name: '发表评论', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('审核通过后公开显示')
    assert.equal(db.prepare('SELECT status FROM comments WHERE content = ?').get('浏览器提交待审核内容').status, 'pending')
    await expect(page.locator('.comments > ul')).not.toContainText('浏览器提交待审核内容')
    await page.reload()
    await expect(page.locator('.comments')).toContainText('已审根评论')
    await expect(page.locator('.comments')).not.toContainText('浏览器提交待审核内容')
    const publicComments = await (await fetch(`${base}/api/comments/acceptance-0`)).json()
    assert.ok(publicComments.every(c => c.status === 'approved'))
  })
  await check('opaque reading surface isolates bright backgrounds and disables article effects', /* 验证复杂背景下正文稳定不透明，并在离开文章后恢复首页效果容器。 */ async () => {
    await page.route('**/reading-background.svg', /* 提供高对比色块模拟复杂背景，不使用真实站点数据。 */ route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#ffff00"/><path fill="#ff00ff" d="M0 0h80v80H0zM80 80h80v80H80z"/></svg>' }))
    await page.route('**/api/settings', /* 仅在隔离浏览器中使用极端主题，核对阅读区不继承低对比配色。 */ async route => {
      const response = await route.fetch()
      const data = await response.json()
      data.settings.theme = { ...data.settings.theme, background: { image: '/reading-background.svg', size: '160px', repeat: 'repeat', overlay: 0 }, colors: { ...data.settings.theme.colors, surface: 'transparent', textPrimary: '#ffff00', textSecondary: '#ffff00' } }
      await route.fulfill({ response, json: data })
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(base)
    await expect(page.locator('[data-reader-effects]')).toHaveCount(1)
    await expect(page.getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    await page.goto(`${base}/article/acceptance-0`)
    await expect(page.locator('.article-reading .markdown-body')).toBeVisible()
    await expect(page.locator('[data-reader-effects]')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('.article-reading')).toHaveCSS('background-color', 'rgb(18, 23, 31)')
    await expect(page.locator('.markdown-body')).toHaveCSS('color', 'rgb(232, 237, 244)')
    await expect(page.locator('.comments')).toHaveCSS('color', 'rgb(232, 237, 244)')
    for (const [size, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height })
      const textWidth = await page.locator('.markdown-body').evaluate(/* 正文宽度保持在合理阅读范围。 */ element => element.getBoundingClientRect().width)
      assert.ok(textWidth <= 808)
      assert.equal(await page.evaluate(/* 页面不得出现横向溢出。 */ () => document.documentElement.scrollWidth > innerWidth), false)
      await page.locator('.markdown-body blockquote').scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(artifacts, `reading-panel-${size}.png`), animations: 'disabled' })
    }
    await page.goto(base)
    // 手机布局不再挂载装饰效果，桌面效果已在本检查开头覆盖。
    await expect(page.locator('[data-reader-effects]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    await page.unroute('**/api/settings')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${base}/article/acceptance-0`)
  })
  await check('desktop/mobile configured theme reading screenshots and horizontal overflow', /* 验证阅读底板的实际对比度与窄屏布局。 */ async () => {
    await expect(page.locator('.article-reading .markdown-body')).toBeVisible()
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height })
      for (const theme of ['configured']) {
        await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '深色', exact: true })).toHaveCount(0)
        await expect(page.locator(size === 'mobile' ? '.reader-mobile-nav' : '.reader-dock')).toBeVisible()
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.evaluate(() => document.fonts.ready)
        const filename = `${size}-${theme}.png`
        await page.screenshot({ path: join(artifacts, filename), fullPage: true, animations: 'disabled' })
        evidence.screenshots.push(filename)
        const contrast = await page.evaluate(/* 以实际阅读底板测量文字对比度，避免误用外围图片底色。 */ () => {
          const channels = color => (color.match(/[\d.]+/g) || []).map(Number)
          const body = getComputedStyle(document.querySelector('.article-reading')), html = getComputedStyle(document.documentElement)
          const bodyBackground = channels(body.backgroundColor)
          const background = bodyBackground.length === 4 && bodyBackground[3] === 0 ? channels(html.backgroundColor) : bodyBackground
          const foreground = channels(getComputedStyle(document.querySelector('.comments')).color)
          const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
          const opaque = background.length === 3 || background[3] === 1
          const a = luminance(background), b = luminance(foreground)
          return { opaque, background: body.backgroundColor, rootBackground: html.backgroundColor, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
        })
        evidence.contrast ||= []
        evidence.contrast.push({ size, theme, ...contrast })
        assert.ok(contrast.opaque, 'reading surface must remain opaque above the decorative background')
        assert.ok(contrast.ratio >= 4.5, `bottom reading contrast ${contrast.ratio} must meet 4.5:1`)

        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${size}/${theme} must not overflow horizontally`)
      }
    }
  })
  await check('article search stays in place and restores reading position', /* 验证详情页模态搜索、键盘关闭及结果跳转。 */ async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${base}/article/acceptance-0`)
    await expect(page.locator('.markdown-body')).toBeVisible()
    await page.evaluate(/* 设置阅读位置以验证打开关闭搜索不滚动正文。 */ () => window.scrollTo(0, 300))
    const position = await page.evaluate(/* 记录弹层打开前的阅读位置。 */ () => window.scrollY)
    const trigger = page.locator('.dock-tools').getByRole('button', { name: '搜索', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '搜索文章', exact: true })
    const input = dialog.getByPlaceholder('搜索文章... (按 / 聚焦)')
    await expect(input).toBeFocused()
    await expect(page).toHaveURL(`${base}/article/acceptance-0`)
    const searched = page.waitForResponse(/* 等待实际搜索响应，避免关闭时中断请求。 */ (response) => new URL(response.url()).searchParams.get('search') === '验收列表文章 1')
    await input.fill('验收列表文章 1')
    assert.equal((await searched).status(), 200)
    await expect(dialog.getByRole('link', { name: '验收列表文章 1', exact: true })).toBeVisible()
    await page.screenshot({ path: join(artifacts, 'article-search.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: '关闭搜索', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    assert.equal(await page.evaluate(/* 核对关闭搜索后的阅读位置。 */ () => window.scrollY), position)
    await trigger.click()
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(dialog).toHaveCount(0)
    await trigger.click()
    await expect(dialog.getByRole('link', { name: '验收列表文章 1', exact: true })).toBeVisible()
    await dialog.getByRole('link', { name: '验收列表文章 1', exact: true }).click()
    await expect(page).toHaveURL(`${base}/article/acceptance-1`)
    await expect(dialog).toHaveCount(0)
  })
  await check('unified explore filters, legacy URLs and responsive results', /* 验证统一入口、组合筛选及浏览历史中的状态恢复。 */ async () => {
    for (const legacy of ['categories', 'tags']) {
      await page.goto(`${base}/${legacy}`, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(`${base}/explore`)
      await expect(page.getByRole('heading', { name: '探索文章', exact: true })).toBeVisible()
      await expect(page.locator('.explore-results').getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    }
    const categories = page.getByRole('group', { name: '分类', exact: true })
    const tags = page.getByRole('group', { name: '标签', exact: true })
    await categories.getByRole('link', { name: /阅读分类\s*12/, exact: true }).click()
    const combinedResponse = page.waitForResponse(/* 等待实际双条件请求，避免误读上一轮分类结果。 */ (response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/articles' && url.searchParams.has('category') && url.searchParams.has('tag')
    })
    await tags.getByRole('link', { name: /# 验收标签\s*12/, exact: true }).click()
    assert.equal((await combinedResponse).status(), 200)
    await expect(page).toHaveURL(/category=.*&tag=/)
    await expect(page.locator('.explore-results').getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    const request = requests.filter(/* 取最新的文章请求以核对双重筛选参数。 */ (r) => r.path === '/api/articles').at(-1)
    assert.match(request.query, /category=/)
    assert.match(request.query, /tag=/)
    const search = page.getByPlaceholder('搜索文章... (按 / 聚焦)')
    const searchedResponse = page.waitForResponse(/* 等待防抖搜索完成后再刷新，避免页面卸载中断请求。 */ (response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/articles' && url.searchParams.get('search') === '完整阅读'
    })
    await search.fill('完整阅读')
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('.dock-tools').getByRole('link', { name: '搜索', exact: true }).click()
      await expect(search).toBeFocused()
      await expect(search).toHaveValue('完整阅读')
      const current = new URL(page.url())
      assert.equal(current.pathname, '/explore')
      assert.equal(current.searchParams.get('category'), '阅读分类')
      assert.equal(current.searchParams.get('tag'), '验收标签')
      assert.equal(current.searchParams.has('focus'), false)
    }
    assert.equal((await searchedResponse).status(), 200)
    await expect(page.locator('.explore-results').getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
    await page.reload()
    await expect(search).toHaveValue('完整阅读')
    await expect(categories.locator('[aria-current="true"]')).toContainText('阅读分类')
    await expect(tags.locator('[aria-current="true"]')).toContainText('验收标签')
    await page.getByRole('link', { name: '清除筛选', exact: true }).click()
    await expect(page).toHaveURL(`${base}/explore?q=${encodeURIComponent('完整阅读')}`)
    await page.goBack()
    await expect(tags.locator('[aria-current="true"]')).toContainText('验收标签')
    await page.goForward()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.locator('.explore-results').getByRole('link', { name: '完整阅读验收文章', exact: true })).toBeVisible()
      const overflow = await page.evaluate(/* 确认窄屏筛选项和文章卡片没有横向溢出。 */ () => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      await page.screenshot({ path: join(artifacts, `explore-${width}.png`), fullPage: true, animations: 'disabled' })
    }
  })
  await check('no runtime, console, CORS or CSP errors during normal flows', async () => {
    assert.deepEqual(evidence.browserErrors, [])
  })
  evidence.completedAt = new Date().toISOString()
})
