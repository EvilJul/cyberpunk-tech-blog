import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'
import sharp from 'sharp'
import { chromium, webkit, expect } from 'playwright/test'
import { startFixture } from './helpers/server.js'

// node --test tests/mobile-reader.test.js；独立构建、服务、数据库，不读取真实账户或文章。
const artifacts = resolve('test-results/mobile-reader')
const title = '手机阅读验收长标题：中文与ContinuousEnglishWithoutSpaces用于验证两行标题和元信息不会挤出视口'
const markdown = '# 重复标题\n\n' + '稳定阅读正文。'.repeat(120) + '\n\n## 重复标题\n\n```js\n' + 'const longValue = "' + 'x'.repeat(180) + '"\n```\n\n| 第一列 | 第二列 |\n| --- | --- |\n| 长表格 | 测试内容 |\n\n## 最后一节\n\n末尾正文。'

/** 构造无真实数据依赖的手机读者验收环境，逐项保留失败证据。 */
test('mobile-reader-experience 隔离浏览器验收（非真机）', { timeout: 300000 }, async t => {
  await mkdir(artifacts, { recursive: true })
  const build = await mkdtemp(join(tmpdir(), 'mobile-reader-build-'))
  t.after(/* 清理本轮临时构建。 */ () => rm(build, { recursive: true, force: true }))
  execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', build], {
    cwd: resolve('.'), env: { ...process.env, VITE_BASE_PATH: '/' }, stdio: 'pipe'
  })
  const { root, base } = await startFixture(t, 'server/index.js', {
    NODE_ENV: 'test', BLOG_DIST_DIR: build, VITE_BASE_PATH: '/', SESSION_COOKIE_SECURE: 'false',
    PUBLISHING_API_ENABLED: 'false', BLOG_LOG_DIR: join(build, 'logs')
  })
  const db = new Database(join(root, 'blog.db'))
  t.after(/* 关闭隔离数据连接。 */ () => db.close())
  const password = 'mobile-fixture-password-123'
  const hash = await bcrypt.hash(password, 4)
  for (const role of ['admin', 'user']) db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,1,1)').run(role, `mobile-${role}`, hash, role)
  db.transaction(/* 一次性写入大目录与至少六页长内容文章。 */ () => {
    for (let i = 1; i <= 30; i++) db.prepare('INSERT INTO categories(id,name,slug,created_at) VALUES(?,?,?,1)').run(i, `分类${i}长名称`, `category-${i}`)
    for (let i = 1; i <= 100; i++) db.prepare('INSERT INTO tags(id,name,slug,created_at) VALUES(?,?,?,1)').run(i, `标签${i}LongContinuousName`, `tag-${i}`)
    for (let i = 1; i <= 120; i++) {
      db.prepare("INSERT INTO articles(id,title,slug,content,excerpt,category_id,status,publish_date,created_at,updated_at,revision,published_revision) VALUES(?,?,?,?,?,?,'published','2026-11-10',?,?,1,1)")
        .run(`mobile-${i}`, `${title} ${i}`, `mobile-${i}`, i === 120 ? '没有任何 Markdown 标题的普通正文。' : markdown, '![摘要图片](/uploads/not-requested.png) [摘要链接](https://example.invalid) **可读摘要**', (i - 1) % 30 + 1, i, i)
      db.prepare('INSERT INTO article_tags(article_id,tag_id) VALUES(?,?)').run(`mobile-${i}`, (i - 1) % 100 + 1)
    }
  })()
  const settings = { title: '手机读者验收站点', author: '长作者名称', bio: '长作者简介'.repeat(40), sidebar: 'right', perpage: 10, github: 'https://github.com/example', email: 'reader@example.invalid', wechatName: '验收公众号'.repeat(12), wechatId: 'reader-fixture-account', wechatQr: '/uploads/missing-qr.png', theme: { effects: { pixelSnow: true, splashCursor: true, gridOverlay: true } } }
  await writeFile(join(root, 'settings.json'), JSON.stringify(settings))
  await writeFile(join(root, 'uploads', 'contrast-background.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="white"/><path d="M0 0L40 40M40 0L0 40" stroke="black" stroke-width="12"/></svg>')
  assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n, 120)
  const webkitMode = process.env.MOBILE_READER_ENGINE === 'webkit'
  const browser = await (webkitMode ? webkit : chromium).launch({ headless: true, ...(webkitMode && process.env.MOBILE_READER_WEBKIT_PATH ? { executablePath: process.env.MOBILE_READER_WEBKIT_PATH } : {}) })
  t.after(/* 关闭本轮浏览器。 */ () => browser.close())
  const evidence = { simulation: `${webkitMode ? 'WebKit' : 'Chromium'} CSS viewport；不代表 iOS/Android 真机、软键盘、扫码或系统安全区通过`, checks: [] }
  t.after(/* 输出逐项结果，定向与全量运行分别保留，避免诊断覆盖完整验收。 */ async () => {
    const content = JSON.stringify(evidence, null, 2)
    await writeFile(join(artifacts, 'evidence.json'), content)
    await writeFile(join(artifacts, webkitMode ? 'evidence-webkit.json' : process.env.MOBILE_READER_CASE ? 'evidence-focused.json' : 'evidence-full.json'), content)
  })

  /** 每项使用独立浏览器上下文，失败也截图且不阻止后续子测试。 */
  async function check(name, run, { width = 390, role = 'guest', height = 844 } = {}) {
    if (process.env.MOBILE_READER_CASE && !new RegExp(process.env.MOBILE_READER_CASE).test(name)) return
    await t.test(name, /* 执行独立交互并记录该项截图和错误。 */ async () => {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference' })
      const page = await context.newPage()
      page.setDefaultTimeout(3500)
      const errors = []
      page.on('pageerror', /* 收集未处理浏览器异常。 */ error => errors.push(error.message))
      await page.route('https://fonts.googleapis.com/**', /* 禁止外部字体影响确定性。 */ route => route.fulfill({ contentType: 'text/css', body: '' }))
      const record = { name, width, height, role, status: 'failed' }
      evidence.checks.push(record)
      try {
        if (role !== 'guest') {
          const login = await context.request.post(`${base}/api/session/login`, { headers: { Origin: base }, data: { username: `mobile-${role}`, password } })
          assert.equal(login.status(), 200)
          assert.equal((await (await context.request.get(`${base}/api/session/me`)).json()).user.role, role)
        }
        await run(page, context, record)
        assert.deepEqual(errors, [], '浏览器不得有未处理异常')
        record.status = 'passed'
      } catch (error) { record.error = error.message; throw error }
      finally {
        record.actualViewport = await page.evaluate(/* 截图前量取真实 CSS 视口。 */ () => ({ width: innerWidth, height: innerHeight, scale: visualViewport?.scale }))
        await page.screenshot({ path: join(artifacts, `${name}.png`) })
        await page.screenshot({ path: join(artifacts, `${name}-full.png`), fullPage: true })
        await context.close()
      }
    })
  }
  /** 等待真实文章卡片并确认 CSS 视口未漂移。 */
  async function home(page, path = '/') {
    await page.goto(base + path)
    await page.locator('main article h2').first().waitFor()
    assert.equal(await page.evaluate(/* 读取实际布局宽度。 */ () => innerWidth), page.viewportSize().width)
  }
  /** 检查整页没有通过隐藏溢出来掩盖超宽内容。 */
  async function noOverflow(page) {
    assert.ok(await page.evaluate(/* 比较文档真实滚动宽度。 */ () => document.documentElement.scrollWidth <= innerWidth + 1), '整页不应横向溢出')
  }

  for (const width of [360, 375, 390, 430]) for (const role of ['guest', 'user', 'admin']) {
    await check(`home-${width}-${role}`, /* 验证角色无关的首屏与固定四项导航。 */ async page => {
      await home(page)
      const heading = page.locator('main article h2').first()
      const box = await heading.boundingBox()
      const nav = page.getByRole('navigation', { name: '手机导航', exact: true })
      await expect(nav).toBeVisible()
      const items = nav.locator('a,button')
      await expect(items).toHaveCount(4)
      for (const label of ['首页', '探索']) await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
      for (const label of ['搜索', '更多']) await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
      const boxes = await items.evaluateAll(/* 读取实际命中尺寸而非 CSS 声明。 */ nodes => nodes.map(/* 提取各导航项几何信息。 */ node => { const b = node.getBoundingClientRect(); return { width: b.width, height: b.height, bottom: b.bottom } }))
      for (const b of boxes) { assert.ok(b.width >= 44 && b.height >= 44); assert.ok(Math.abs(b.width - boxes[0].width) <= 1) }
      const fixed = await nav.evaluate(/* 允许固定定位由导航祖先容器提供。 */ node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false })
      assert.ok(fixed, '手机导航固定在可见视口')
      assert.ok(Math.max(...boxes.map(/* 取得最下方导航命中边界。 */ b => b.bottom)) <= page.viewportSize().height + 1)
      await expect(nav.getByText(/写文章|工作台/)).toHaveCount(0)
      await expect(page.locator('[data-reader-effects], canvas')).toHaveCount(0)
      await expect(page.locator('main aside:visible')).toHaveCount(0)
      await expect(page.locator('main .reader-contacts')).toHaveCount(0)
      await expect(page.getByRole('link', { name: '关于我', exact: true })).toBeInViewport()
      await expect(page.locator('.reader-identity--home p')).toHaveCSS('-webkit-line-clamp', '2')
      assert.doesNotMatch(await page.locator('main article').first().innerText(), /!\[|\]\(https?:|\*\*可读/)
      await noOverflow(page)
      assert.ok(box.y >= 0 && box.y <= 280, `首标题 y=${box.y}`)
    }, { width, role, height: width === 360 ? 800 : 844 })
  }

  await check('navigation-opaque-without-inline-palette', /* 配色变量未继承时仍要有实色底板，避免正文与底栏混叠。 */ async (page, context, record) => {
    await home(page)
    await page.evaluate(/* 模拟页面已显示但动态配色样式丢失的退化状态。 */ () => document.querySelector('.reader-shell').removeAttribute('style'))
    const nav = page.getByRole('navigation', { name: '手机导航', exact: true })
    await expect(nav).toHaveCSS('background-color', 'rgb(20, 24, 55)')
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(20, 24, 55)')
    await page.locator('main article h2 a').first().click()
    await page.locator('[data-reading-ready="true"]').waitFor()
    await page.evaluate(/* 在长文中部对照实际阅读层级，不只看首屏。 */ () => scrollTo({ top: 650, behavior: 'instant' }))
    const box = await nav.boundingBox()
    record.nav = await nav.evaluate(/* 记录渲染时的底色、层级和命中尺寸。 */ node => ({ color: getComputedStyle(node).backgroundColor, zIndex: getComputedStyle(node).zIndex, height: node.getBoundingClientRect().height }))
    await expect(nav).toHaveCSS('background-color', 'rgb(18, 23, 31)')
    const samples = []
    for (const color of ['#ff00ff', '#00ff00']) {
      await page.evaluate(/* 将强对比底板放在导航下方，检验最终像素是否透出下层。 */ ({ color, y, height }) => {
        let probe = document.getElementById('navigation-paint-probe')
        if (!probe) { probe = document.createElement('div'); probe.id = 'navigation-paint-probe'; document.querySelector('.reader-shell').append(probe) }
        Object.assign(probe.style, { position: 'fixed', left: '0', right: '0', top: `${y}px`, height: `${height}px`, zIndex: '39', pointerEvents: 'none', backgroundColor: color })
      }, { color, y: box.y, height: box.height })
      samples.push([...await sharp(await page.screenshot({ clip: { x: 8, y: Math.floor(box.y + 20), width: 1, height: 1 } })).removeAlpha().raw().toBuffer()])
    }
    record.paintSamples = samples
    assert.deepEqual(samples[0], [18, 23, 31], '底栏应绘制独立、不透明的阅读底色')
    assert.deepEqual(samples[0], samples[1], '下层颜色变化不应影响底栏像素')
    await page.evaluate(/* 移除测试探针，截图只保存真实阅读布局。 */ () => document.getElementById('navigation-paint-probe').remove())
    await page.screenshot({ path: join(artifacts, 'mobile-navigation-opaque-reading.png') })
    await page.getByRole('link', { name: '返回文章列表', exact: true }).click()
    await page.locator('[data-list-ready="true"]').waitFor()
    await expect(nav).toHaveCSS('background-color', 'rgb(20, 24, 55)')
  })

  await check('mobile-author-banner', /* 手机横幅使用既有背景、简介两行，联系收进更多，桌面仍保留完整侧栏。 */ async (page, context, record) => {
    const bio = '关注 AI 应用落地与自动化工程，持续分享智能体、RAG、工作流自动化与实践经验。' + 'LongContinuousBiography'.repeat(8)
    await page.route('**/api/settings', /* 仅替换隔离响应，验证亮图遮罩与真实作者资料布局。 */ async route => {
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({ json: { ...data, settings: { ...data.settings, author: '浮生', bio, theme: { background: { image: '/uploads/contrast-background.svg', position: 'center' }, effects: { pixelSnow: false, gridOverlay: false, splashCursor: false } } } } })
    })
    await home(page)
    const banner = page.getByRole('region', { name: '作者信息', exact: true })
    await expect(banner.locator('p')).toHaveCSS('-webkit-line-clamp', '2')
    await expect.poll(/* 等待主题背景同步到局部横幅。 */ () => banner.evaluate(/* 获取实际伪元素背景而非只读源码。 */ node => getComputedStyle(node, '::before').backgroundImage)).toContain('/uploads/contrast-background.svg')
    record.banner = await banner.evaluate(/* 读取简介实际行高与可用宽度，防止连续英文撑出页面。 */ node => { const p = node.querySelector('p'), box = p.getBoundingClientRect(); return { height: node.getBoundingClientRect().height, bioHeight: box.height, bioWidth: box.width, bioRight: box.right, scrollWidth: p.scrollWidth, clientWidth: p.clientWidth, backdrop: getComputedStyle(node, '::before').backgroundImage } })
    assert.ok(record.banner.bioHeight > 20 && record.banner.bioHeight <= 40)
    assert.ok(record.banner.scrollWidth <= record.banner.clientWidth + 1)
    assert.ok(record.banner.bioRight <= 390 - 16)
    const bioNode = banner.locator('p')
    const ink = await bioNode.evaluate(/* 读取简介实际文字颜色。 */ node => getComputedStyle(node).color.match(/[\d.]+/g).slice(0, 3).map(Number))
    const bioBox = await bioNode.boundingBox()
    await bioNode.evaluate(/* 暂时隐藏字形以独立量取其后实际背景像素，保留布局。 */ node => { node.style.visibility = 'hidden' })
    const pixels = await sharp(await page.screenshot({ clip: { x: Math.ceil(bioBox.x), y: Math.ceil(bioBox.y), width: Math.floor(bioBox.width - 1), height: Math.floor(bioBox.height - 1) } })).removeAlpha().raw().toBuffer()
    await bioNode.evaluate(/* 恢复文字后再保存正常界面截图。 */ node => node.style.removeProperty('visibility'))
    /** 按 WCAG 计算实际截图与文字的线性亮度。 */
    function brightness(rgb) {
      const values = rgb.map(/* 将 sRGB 通道转为线性值。 */ value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 })
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
    }
    const foreground = brightness(ink)
    let minimum = Infinity
    for (let i = 0; i < pixels.length; i += 3) {
      const background = brightness([pixels[i], pixels[i + 1], pixels[i + 2]])
      minimum = Math.min(minimum, (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05))
    }
    record.banner.minimumBioContrast = minimum
    assert.ok(minimum >= 4.5, `简介与亮图的最小实际对比度 ${minimum}`)
    await expect(banner.locator('.reader-contacts')).toHaveCount(0)
    const about = banner.getByRole('link', { name: '关于我', exact: true })
    const target = await about.boundingBox()
    assert.ok(target.width >= 44 && target.height >= 44)
    assert.ok((await page.locator('main article h2').first().boundingBox()).y <= 280)
    await noOverflow(page)
    await page.screenshot({ path: join(artifacts, 'mobile-author-home.png') })
    await page.getByRole('navigation', { name: '手机导航' }).getByRole('button', { name: '更多', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '更多', exact: true }).getByRole('link', { name: 'GitHub', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await about.click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { name: '关于 浮生', exact: true })).toBeVisible()
    await expect(page.locator('.reader-about p')).toHaveText(bio)
    await noOverflow(page)
    await page.getByRole('navigation', { name: '手机导航' }).getByRole('link', { name: '首页', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 900 })
    // 桌面使用原有隔离资料确认布局未改，不把手机长英文场景扩为桌面改造。
    await page.unroute('**/api/settings')
    await page.reload()
    await expect(page.locator('.reader-identity--home')).toHaveCount(0)
    await expect(page.locator('main aside').getByRole('link', { name: 'GitHub', exact: true })).toBeVisible()
    await noOverflow(page)
  })

  await check('empty-search-stable-input', /* 空结果后慢请求不卸载输入或丢失焦点。 */ async page => {
    await home(page)
    const input = page.getByLabel('搜索文章', { exact: true })
    await input.fill('no-match-fixture')
    await expect(page.locator('main article')).toHaveCount(0)
    const handle = await input.elementHandle()
    await page.route('**/api/articles?*', /* 延迟后续列表响应以观察更新期间输入。 */ async route => { await new Promise(/* 模拟慢网。 */ done => setTimeout(done, 900)); await route.continue() })
    await input.fill('手机')
    await page.waitForTimeout(650)
    assert.ok(await handle.evaluate(/* 确认同一 DOM 输入仍挂载且保持焦点。 */ node => node.isConnected && document.activeElement === node))
    await expect(input).toHaveValue('手机')
    await expect(page.locator('main article').first()).toBeVisible()
  })

  for (const staleStatus of [200, 500]) await check(`stale-response-${staleStatus}-and-retry`, /* 旧成功或旧失败均不能覆盖最新搜索，500 保留条件重试。 */ async page => {
    await home(page)
    const input = page.getByLabel('搜索文章', { exact: true })
    let release
    let seen
    const started = new Promise(/* 标记旧请求确实已经发出。 */ done => { seen = done })
    const gate = new Promise(/* 人工控制旧请求返回时机。 */ done => { release = done })
    page.once('close', /* 失败清理时释放旧响应等待。 */ () => release())
    let fail = false
    let retries = 0
    await page.route('**/api/articles?*', /* 注入可控乱序与单次服务错误。 */ async route => {
      const url = new URL(route.request().url())
      const q = url.searchParams.get('search') || url.searchParams.get('q')
      if (q === '旧请求') { seen(); await gate; await route.fulfill({ status: staleStatus, json: staleStatus === 500 ? { error: '过期失败' } : { data: [], pagination: { total: 0, total_pages: 0, page: 1 } } }); return }
      if (fail) { retries++; await route.fulfill({ status: 500, json: { error: '验收故障' } }); return }
      await route.continue()
    })
    await input.fill('旧请求')
    await Promise.race([started, new Promise(/* 防止未发请求导致测试无限等待。 */ (_, reject) => setTimeout(/* 报告请求未发出。 */ () => reject(Error('旧请求未发出')), 3500))])
    await input.fill('手机')
    await expect(page.locator('main article').first()).toBeVisible()
    await expect(page.locator('.reader-list-results')).toHaveAttribute('aria-busy', 'false')
    await expect(page).toHaveURL(/q=/)
    release()
    await page.waitForTimeout(400)
    await expect(page.getByRole('button', { name: '重试', exact: true })).toHaveCount(0)
    await expect(input).toHaveValue('手机')
    fail = true
    await input.fill('阅读')
    await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
    const failedAttempts = retries
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await expect.poll(/* 等待重试请求真实发出。 */ () => retries).toBeGreaterThan(failedAttempts)
    fail = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await expect(page.getByRole('button', { name: '重试', exact: true })).toHaveCount(0)
    await expect(input).toHaveValue('阅读')
    await expect(page.locator('main article').first()).toBeVisible()
  })

  for (const raw of ['0', '-2', 'abc', '1.5', '2&page=3']) await check(`normalize-page-${encodeURIComponent(raw)}`, /* 校验异常页码与重复参数首次值语义。 */ async page => {
    await home(page, `/?page=${raw}`)
    const expected = raw.startsWith('2&') ? '2' : '1'
    await expect.poll(/* 等待 replace 规范化地址而非只检查初始 URL。 */ () => { const values = new URL(page.url()).searchParams.getAll('page'); return values.length <= 1 ? values[0] || '1' : 'duplicate' }).toBe(expected)
  })

  await check('list-return-context', /* 第二页查询进入文章后页内返回与浏览器返回恢复地址及位置。 */ async page => {
    const path = '/?q=' + encodeURIComponent('手机') + '&page=2'
    await home(page, path)
    await expect(page.getByLabel('搜索文章', { exact: true })).toHaveValue('手机')
    const link = page.locator('main article h2 a').nth(2)
    await link.scrollIntoViewIfNeeded()
    const y = await page.evaluate(/* 保存进入文章前的阅读位置。 */ () => scrollY)
    const before = new URL(page.url()).search
    await link.click()
    await page.getByRole('link', { name: '返回文章列表', exact: true }).click()
    await expect.poll(/* 等待原列表地址恢复。 */ () => new URL(page.url()).search).toBe(before)
    await expect.poll(/* 等待文章加载后恢复原位置。 */ () => page.evaluate(/* 获取滚动位置。 */ saved => Math.abs(scrollY - saved), y)).toBeLessThan(100)
    await page.locator('main article h2 a').first().click()
    await page.goBack()
    await expect.poll(/* 检查浏览器返回同样保留搜索和页码。 */ () => new URL(page.url()).search).toBe(before)
  })


  await check('page-failure-and-correction', /* 失败不得重置第六页，成功确认缩减后只补一次第三页请求。 */ async page => {
    let fail = true
    const requested = []
    await page.route('**/api/articles?*', /* 控制总页数缩减与服务失败。 */ async route => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'))
      requested.push(pageNumber)
      if (fail) { await route.fulfill({ status: 500, json: { error: '测试服务失败' } }); return }
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({ json: { ...data, pagination: { ...data.pagination, total: 30, total_pages: 3 } } })
    })
    await page.goto(base + '/?page=6')
    const retry = page.getByRole('button', { name: '重试', exact: true })
    await expect(retry).toBeVisible()
    assert.equal(new URL(page.url()).searchParams.get('page'), '6')
    fail = false
    await retry.click()
    await expect.poll(/* 等待成功响应纠正至最后有效页。 */ () => new URL(page.url()).searchParams.get('page')).toBe('3')
    await expect(page.locator('.reader-list-results')).toHaveAttribute('aria-busy', 'false')
    assert.deepEqual(requested, [6, 6, 3], '失败、原条件重试、一次纠正请求')
  })

  await check('article-search-return', /* 连续两次从同一坐标搜索往返，加载前关闭弹层仍恢复原阅读位置。 */ async (page, context, record) => {
    record.scrollStages = []
    /** 保存滚动、标题绝对位置与历史快照，区分布局变化和滚动竞争。 */
    async function snapshot(stage) {
      const values = await page.evaluate(/* 读取原文和弹层几何信息。 */ () => ({ y: scrollY, height: document.documentElement.scrollHeight, behavior: getComputedStyle(document.documentElement).scrollBehavior, path: location.pathname, readingReady: document.querySelector('.markdown-body')?.getAttribute('data-reading-ready'), active: document.activeElement?.outerHTML.slice(0, 200), history: history.state, headings: [...document.querySelectorAll('.article-reading h1,.article-reading h2,.article-reading-header')].map(/* 标记标题布局是否变化。 */ node => { const b = node.getBoundingClientRect(); return { text: node.textContent.slice(0, 60), top: b.top + scrollY, height: b.height } }) }))
      record.scrollStages.push({ stage, ...values })
    }
    let articleReads = 0
    let releaseArticle
    page.once('close', /* 失败清理时释放等待中的文章响应。 */ () => releaseArticle?.())
    await page.route('**/api/articles/mobile-1', /* 返回 A 时延迟详情，稳定暴露弹层已就绪而正文未就绪的竞争。 */ async route => {
      articleReads++
      if (articleReads > 1) await new Promise(/* 返回 A 的详情必须等待弹层关闭，避免靠固定延时碰巧覆盖竞争。 */ done => { releaseArticle = done })
      await route.continue()
    })
    await page.goto(base + '/article/mobile-1')
    await page.locator('.markdown-body').waitFor()
    await snapshot('loaded')
    for (const cycle of [1, 2]) {
      await page.evaluate(/* 模拟读到原文中部。 */ () => scrollTo({ top: 500, behavior: 'instant' }))
      await snapshot('y-requested')
      const y = await page.evaluate(/* 保存搜索前阅读位置。 */ () => scrollY)
      assert.equal(y, 500, '两轮必须使用完全相同的原文坐标')
      await snapshot(`cycle-${cycle}-y-saved`)
      await page.getByRole('navigation', { name: '手机导航', exact: true }).getByRole('button', { name: '搜索', exact: true }).click()
      await snapshot('open')
      const dialog = page.getByRole('dialog', { name: '搜索文章', exact: true })
      await dialog.getByLabel('搜索文章', { exact: true }).fill('手机')
      await expect(dialog.locator('.reader-list-results')).toHaveAttribute('aria-busy', 'false')
      await expect(dialog.getByRole('status')).toContainText('手机')
      const nextResults = page.waitForResponse(/* 明确等待第二页响应，避免页码先更新、旧卡片尚未替换的瞬态。 */ response => { const url = new URL(response.url()); return url.pathname === '/api/articles' && url.searchParams.get('page') === '2' && url.searchParams.get('search') === '手机' })
      await dialog.getByRole('button', { name: '下一页', exact: true }).click()
      await nextResults
      await expect(dialog.getByRole('navigation', { name: '文章分页' })).toContainText('2 /')
      await expect(dialog.locator('.reader-list-results')).toHaveAttribute('aria-busy', 'false')
      await expect(dialog.getByLabel('搜索文章', { exact: true })).toBeInViewport()
      await snapshot('before-navigateB')
      await page.screenshot({ path: join(artifacts, `mobile-search-page-2-cycle-${cycle}.png`) })
      const destination = await dialog.locator('article h2 a').first().getAttribute('href')
      await dialog.locator('article h2 a').first().click()
      await page.waitForURL(base + destination)
      await expect(page.locator('.article-reading-header h1')).toHaveText(`${title} ${destination.split('-').at(-1)}`)
      await snapshot('navigateB')
      await page.getByRole('link', { name: '返回搜索结果', exact: true }).click()
      await expect(page).toHaveURL(/\/article\/mobile-1$/)
      await expect(dialog).toBeVisible()
      await snapshot(`cycle-${cycle}-back`)
      await expect.poll(/* 保证返回文章请求已进入受控延迟。 */ () => articleReads).toBe(cycle + 1)
      await expect(dialog.getByLabel('搜索文章', { exact: true })).toHaveValue('手机')
      await expect(dialog.getByRole('navigation', { name: '文章分页' })).toContainText('2 /')
      await expect(page.locator('.markdown-body[data-reading-ready="true"]')).toHaveCount(0)
      await dialog.getByRole('button', { name: '关闭搜索', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await snapshot(`cycle-${cycle}-close-before-article-ready`)
      releaseArticle()
      await expect(page.locator('.markdown-body')).toHaveAttribute('data-reading-ready', 'true')
      try { await expect.poll(/* 关闭恢复的搜索后应回到原文位置。 */ () => page.evaluate(/* 检查滚动差值。 */ saved => Math.abs(scrollY - saved), y)).toBeLessThan(100) }
      catch (error) { await snapshot(`cycle-${cycle}-close-failed-after-ready`); throw error }
      await snapshot(`cycle-${cycle}-restored-after-ready`)
    }
  })

  await check('explore-large-catalog', /* 默认不堆满目录，展开后末项仍可达。 */ async page => {
    await home(page, '/explore')
    const more = page.getByRole('button', { name: /全部标签.*100/ })
    await expect(more).toBeVisible()
    await expect(page.getByRole('button', { name: /^筛选/ })).toBeVisible()
    const filters = page.getByRole('region', { name: '文章筛选', exact: true })
    await expect(filters.getByRole('group', { name: '标签', exact: true }).getByRole('link')).toHaveCount(9)
    assert.ok((await filters.boundingBox()).height <= 240, '默认筛选区域不超过 240px')
    await more.click()
    await expect(page.getByRole('dialog', { name: '筛选文章', exact: true })).toBeVisible()
    await page.screenshot({ path: join(artifacts, 'mobile-explore-expanded.png') })
    const last = page.getByRole('dialog', { name: '筛选文章', exact: true }).getByRole('link', { name: /标签100LongContinuousName/ })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeVisible()
    await last.click()
    await page.getByRole('button', { name: '查看文章结果', exact: true }).click()
    await expect.poll(/* 检查选择末尾标签后保留真实条件。 */ () => new URL(page.url()).searchParams.get('tag')).toBe('标签100LongContinuousName')
    await noOverflow(page)
  })

  await check('article-toc-input', /* 有标题默认折叠，重复标题锚点唯一，评论输入至少 16px。 */ async page => {
    await page.goto(base + '/article/mobile-1')
    await page.locator('.markdown-body').waitFor()
    const toggle = page.getByRole('button', { name: /目录.*3/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    const links = page.getByRole('navigation', { name: '文章目录', exact: true }).getByRole('link')
    await expect(links).toHaveCount(3)
    const hrefs = await links.evaluateAll(/* 提取唯一目录目标。 */ nodes => nodes.map(/* 读取锚点。 */ node => node.getAttribute('href')))
    assert.equal(new Set(hrefs).size, 3)
    for (const label of ['昵称', '邮箱（不公开）', '评论内容']) {
      const input = page.getByLabel(label, { exact: true })
      assert.ok(await input.evaluate(/* 检查实际输入字号。 */ node => parseFloat(getComputedStyle(node).fontSize) >= 16))
    }
    await expect(page.locator('[data-reader-effects],canvas')).toHaveCount(0)
    await page.screenshot({ path: join(artifacts, 'mobile-article-long.png'), fullPage: true })
    await page.getByLabel('评论内容', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(artifacts, 'mobile-comments.png') })
    await noOverflow(page)
  })
  await check('article-no-toc', /* 无 Markdown 标题时不渲染空目录。 */ async page => {
    await page.goto(base + '/article/mobile-120')
    await page.locator('.markdown-body').waitFor()
    await expect(page.getByRole('navigation', { name: '文章目录', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /目录/ })).toHaveCount(0)
  })


  for (const role of ['guest', 'user', 'admin']) await check(`more-role-${role}`, /* 更多中的身份入口遵循权限，路由跳转关闭面板。 */ async page => {
    await home(page)
    await page.getByRole('navigation', { name: '手机导航', exact: true }).getByRole('button', { name: '更多', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '更多', exact: true })
    await expect(dialog.getByRole('link', { name: /工作台/ })).toHaveCount(role === 'admin' ? 1 : 0)
    await expect(dialog.getByRole('link', { name: '登录', exact: true })).toHaveCount(role === 'guest' ? 1 : 0)
    await page.screenshot({ path: join(artifacts, `mobile-more-${role}.png`) })
    await dialog.getByRole('link', { name: /关于/ }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(dialog).toHaveCount(0)
  }, { role })

  await check('hidden-sidebar-contacts', /* 隐藏完整侧栏后，更多中的真实联系入口仍然可达。 */ async page => {
    await page.route('**/api/settings', /* 只覆盖隔离页面读到的设置，不写共享设置。 */ async route => {
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({ json: { ...data, settings: { ...data.settings, sidebar: 'hidden' } } })
    })
    await home(page)
    await page.getByRole('navigation', { name: '手机导航' }).getByRole('button', { name: '更多', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '更多', exact: true }).getByRole('link', { name: 'GitHub', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: '微信公众号', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: '微信公众号', exact: true })).toBeVisible()
  })

  await check('keyboard-visualviewport-simulation', /* 模拟可视视口缩小及缩放，不声称系统软键盘通过。 */ async page => {
    await home(page)
    const nav = page.getByRole('navigation', { name: '手机导航', exact: true })
    await page.getByLabel('搜索文章', { exact: true }).focus()
    await page.evaluate(/* 注入只用于测试的可视高度差并触发监听。 */ () => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: innerHeight - 320 })
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await expect(nav).not.toBeInViewport()
    await page.evaluate(/* 恢复可见视口并模拟关闭键盘。 */ () => {
      delete visualViewport.height
      document.activeElement.blur()
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await expect(nav).toBeInViewport()
    await page.evaluate(/* 捏合缩放场景不应误判为键盘。 */ () => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: innerHeight - 320 })
      Object.defineProperty(visualViewport, 'scale', { configurable: true, value: 2 })
      document.querySelector('input').focus()
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await expect(nav).toBeInViewport()
  })

  for (const [width, height] of [[320, 800], [760, 844], [761, 844], [768, 844], [1023, 844], [1024, 844], [1440, 900], [844, 390], [667, 375], [390, 320]]) {
    await check(`boundary-${width}x${height}`, /* 验证手机、过渡、桌面及横屏低高度没有双导航或整页溢出。 */ async page => {
      await home(page)
      const mobileNav = page.getByRole('navigation', { name: '手机导航', exact: true })
      const desktopNav = page.getByRole('complementary', { name: '站点导航', exact: true })
      if (width <= 760) {
        await expect(mobileNav).toBeVisible()
        await expect(mobileNav.locator('a,button')).toHaveCount(4)
        await expect(desktopNav).toHaveCount(0)
      } else {
        await expect(mobileNav).toHaveCount(0)
        await expect(desktopNav).toBeVisible()
      }
      await noOverflow(page)
      const input = page.getByLabel('搜索文章', { exact: true })
      await input.scrollIntoViewIfNeeded()
      await expect(input).toBeInViewport()
      await input.fill('手机')
      await expect(input).toHaveValue('手机')
      await noOverflow(page)
    }, { width, height })
  }

  for (const count of [0, 1, 10]) {
    try {
      db.prepare("UPDATE articles SET status=CASE WHEN created_at<=? THEN 'published' ELSE 'draft' END").run(count)
      await check(`fixture-${count}-articles`, /* 使用真实隔离数据库验证空、一篇和一页数据，不伪造列表响应。 */ async page => {
        const response = await page.request.get(base + '/api/articles?per_page=10')
        assert.equal((await response.json()).pagination.total, count)
        await page.goto(base)
        await expect(page.getByLabel('搜索文章', { exact: true })).toBeVisible()
        await expect(page.locator('.reader-list-results')).toHaveAttribute('aria-busy', 'false')
        await expect(page.locator('main article')).toHaveCount(count)
        if (!count) await expect(page.getByText('暂无文章', { exact: true })).toBeVisible()
        await expect(page.getByRole('navigation', { name: '手机导航', exact: true }).locator('a,button')).toHaveCount(4)
        await expect(page.getByRole('link', { name: '关于我', exact: true })).toBeInViewport()
        await noOverflow(page)
      })
    } finally { db.prepare("UPDATE articles SET status='published'").run() }
  }

  for (const [variant, theme] of [
    ['dark', { preset: 'cyberpunk' }],
    ['light', { preset: 'minimal' }],
    ['transparent-low-contrast', { preset: 'minimal', colors: { background: '#ffffff', surface: 'rgba(255,255,255,0)', textPrimary: '#fafafa', textSecondary: '#fafafa', primary: '#fefefe' } }]
  ]) for (const path of ['/', '/explore']) {
    await check(`contrast-${variant}-${path === '/' ? 'home' : 'explore'}`, /* 从实际绘制的背景像素与 computed 前景色计算对比度，保留原始设置。 */ async (page, context, record) => {
      await page.route('**/api/settings', /* 仅将当前浏览器设置响应替换成目标主题。 */ async route => {
        const response = await route.fetch()
        const data = await response.json()
        await route.fulfill({ json: { ...data, settings: { ...data.settings, theme: { ...theme, background: { image: '/uploads/contrast-background.svg', overlay: 0, repeat: 'repeat', size: '40px 40px' }, effects: { pixelSnow: false, splashCursor: false, gridOverlay: false } } } } })
      })
      await home(page, path)
      const card = page.locator('main article').first()
      const box = await card.boundingBox()
      const pixel = await sharp(await page.screenshot({ clip: { x: Math.floor(box.x + 8), y: Math.floor(box.y + 40), width: 1, height: 1 } })).removeAlpha().raw().toBuffer()
      const background = [...pixel]
      /** 计算 sRGB 相对亮度，与实现函数独立。 */
      function luminance(rgb) {
        return rgb.map(/* 将通道转换为线性值。 */ v => v / 255).map(/* 应用 WCAG 传递曲线。 */ v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce(/* 加权求和。 */ (sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
      }
      record.contrast = []
      for (const selector of ['.article-card-title', '.article-card-excerpt', '.article-card-meta time']) {
        const painted = await card.locator(selector).evaluate(/* 取得实际计算后的前景与局部表面颜色。 */ node => ({ foreground: getComputedStyle(node).color, surface: getComputedStyle(node.closest('article')).backgroundColor }))
        const fg = painted.foreground.match(/[\d.]+/g).map(Number)
        const alpha = fg[3] ?? 1
        const composite = fg.slice(0, 3).map(/* 合成可能透明的文字颜色。 */ (v, i) => v * alpha + background[i] * (1 - alpha))
        const a = luminance(composite), b = luminance(background)
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        record.contrast.push({ selector, ...painted, sampledBackground: background, ratio })
        assert.ok(ratio >= 4.5, `${variant} ${selector} 实际 ratio=${ratio.toFixed(2)}`)
        assert.ok(!painted.surface.startsWith('rgba') || Number(painted.surface.match(/[\d.]+/g)[3]) === 1, '文章卡片表面必须不透明')
      }
      const controls = await page.locator('.reader-list-search .glass-card').evaluate(/* 搜索框边界必须与不透明表面保持可辨识的对比度。 */ node => ({ border: getComputedStyle(node).borderTopColor, surface: getComputedStyle(node).backgroundColor }))
      const borderChannels = controls.border.match(/[\d.]+/g).map(Number)
      const surfaceChannels = controls.surface.match(/[\d.]+/g).map(Number)
      const borderAlpha = borderChannels[3] ?? 1
      const borderPaint = borderChannels.slice(0, 3).map(/* 合成边框透明度后计算实际边界亮度。 */ (value, i) => value * borderAlpha + surfaceChannels[i] * (1 - borderAlpha))
      const borderLight = luminance(borderPaint), surfaceLight = luminance(surfaceChannels.slice(0, 3))
      record.controlContrast = { ...controls, ratio: (Math.max(borderLight, surfaceLight) + .05) / (Math.min(borderLight, surfaceLight) + .05) }
      assert.ok(record.controlContrast.ratio >= 3, `${variant} 搜索边框对比度不足：${record.controlContrast.ratio}`)
      const original = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))
      assert.deepEqual(original, settings, '呈现降级不得写回设置文件')
    })
  }

  for (const target of ['//evil.example', '/category/../../studio', '/category/%2e%2e/%2e%2e/login', '/tag/%252e%252e/%252e%252e/studio', 'https://evil.example/']) {
    await check(`unsafe-return-${encodeURIComponent(target)}`, /* 直接注入不可信历史状态，页内返回必须落到首页。 */ async page => {
      await page.addInitScript(/* 在路由初始化前模拟外部构造的返回上下文。 */ url => {
        history.replaceState({ usr: { readerReturn: { url } }, key: 'untrusted-fixture', idx: 0 }, '')
      }, target)
      await page.goto(base + '/article/mobile-1')
      const back = page.getByRole('link', { name: '返回文章列表', exact: true })
      await expect(back).toHaveAttribute('href', '/')
      await back.click()
      await expect.poll(/* 验证真正落点，不能只依赖链接文本。 */ () => new URL(page.url()).pathname).toBe('/')
      assert.equal(new URL(page.url()).origin, base)
      await expect(page.locator('main article').first()).toBeVisible()
    })
  }
  await check('lost-source-search-fallback', /* 来源标识不存在时回到合法独立探索结果，不盲目退出本站。 */ async page => {
    await page.addInitScript(/* 构造失去同会话来源但仍有合法公开 q/page 的历史上下文。 */ () => {
      history.replaceState({ usr: { readerReturn: { sourceId: 'missing-source-fixture', url: '/explore?q=%E6%89%8B%E6%9C%BA&page=2' } }, key: 'lost-source', idx: 0 }, '')
    })
    await page.goto(base + '/article/mobile-1')
    await page.getByRole('link', { name: '返回搜索结果', exact: true }).click()
    await expect(page).toHaveURL(/\/explore\?q=.*page=2/)
    await expect(page.getByLabel('搜索文章', { exact: true })).toHaveValue('手机')
    await expect(page.getByRole('navigation', { name: '文章分页' })).toContainText('2 /')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  await check('wechat-qr-only-retry', /* 仅二维码配置失败后可重试，不虚构不存在的名称或账号。 */ async (page, context, record) => {
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).png().toBuffer()
    let imageRequests = 0
    await page.route('**/api/settings', /* 只覆盖当前浏览器的公众号配置，不写数据库或设置文件。 */ async route => {
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({ json: { ...data, settings: { ...data.settings, wechatName: '', wechatId: '', wechatQr: '/uploads/qr-only-fixture.png' } } })
    })
    await page.route('**/uploads/qr-only-fixture.png', /* 第一次返回失败，第二次返回有效图片，验证真实图片重建请求。 */ async route => {
      imageRequests++
      await route.fulfill(imageRequests === 1
        ? { status: 404, body: '', headers: { 'Cache-Control': 'no-store' } }
        : { status: 200, contentType: 'image/png', body: image, headers: { 'Cache-Control': 'no-store' } })
    })
    await home(page)
    const more = page.getByRole('navigation', { name: '手机导航' }).getByRole('button', { name: '更多', exact: true })
    await more.click()
    await page.getByRole('button', { name: '微信公众号', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: '微信公众号', exact: true })
    await expect(dialog.getByRole('alert')).toContainText('没有其他可用的公众号资料')
    assert.doesNotMatch(await dialog.innerText(), /搜索|微信号：|复制微信号/)
    await expect(dialog.getByRole('button', { name: '关闭公众号', exact: true })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: '复制微信号', exact: true })).toHaveCount(0)
    await page.screenshot({ path: join(artifacts, 'mobile-wechat-error.png') })
    await dialog.getByRole('button', { name: '重试二维码', exact: true }).click()
    const qr = dialog.getByRole('img', { name: '微信公众号二维码', exact: true })
    await expect.poll(/* 验证图片确实成功解码，不仅是 DOM 中存在 img。 */ () => qr.evaluate(/* 读取图像加载状态。 */ node => node.complete && node.naturalWidth > 0)).toBe(true)
    assert.equal(imageRequests, 2)
    record.qrImageRequests = imageRequests
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await dialog.getByRole('button', { name: '关闭公众号', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: '更多', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭更多', exact: true }).click()
    await expect(more).toBeFocused()
    assert.notEqual(await page.evaluate(/* 关闭后释放正文滚动锁。 */ () => getComputedStyle(document.body).overflow), 'hidden')
  })

  await check('wechat-account-only-clipboard-failure', /* 仅长账号配置且复制失败时保留手工复制，更多往返遵守单模态及焦点锁。 */ async (page, context, record) => {
    const account = 'reader-account-' + 'LongContinuousAccount'.repeat(12)
    await page.addInitScript(/* 模拟浏览器剪贴板权限拒绝并记录实际尝试复制的文字。 */ () => {
      window.__clipboardAttempts = []
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: /* 拒绝复制并保留测试调用证据。 */ async value => { window.__clipboardAttempts.push(value); throw new DOMException('fixture denied', 'NotAllowedError') }
      } })
    })
    await page.route('**/api/settings', /* 仅替换读取到的账号字段，不改隔离数据库。 */ async route => {
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({ json: { ...data, settings: { ...data.settings, wechatName: '', wechatId: account, wechatQr: '' } } })
    })
    await home(page)
    const more = page.getByRole('navigation', { name: '手机导航', exact: true }).getByRole('button', { name: '更多', exact: true })
    await more.click()
    const moreDialog = page.getByRole('dialog', { name: '更多', exact: true })
    await moreDialog.getByRole('button', { name: '微信公众号', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '微信公众号', exact: true })
    await expect(dialog).toBeVisible()
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    await expect(dialog.getByRole('img')).toHaveCount(0)
    await expect(dialog.getByText(account, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '复制微信号', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('复制失败，请手动复制上方微信号')
    await page.screenshot({ path: join(artifacts, 'mobile-wechat-copy-error.png') })
    await expect(dialog.getByText(account, { exact: true })).toBeVisible()
    record.clipboardAttempts = await page.evaluate(/* 读取被拒绝的剪贴板操作参数。 */ () => window.__clipboardAttempts)
    assert.deepEqual(record.clipboardAttempts, [account])
    assert.ok(await dialog.evaluate(/* 长连续账号不得撑出弹层内部宽度。 */ node => node.scrollWidth <= node.clientWidth + 1))
    await noOverflow(page)
    record.tabFocus = []
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const focus = await dialog.evaluate(/* 区分页面内焦点与浏览器工具栏；原生 dialog 不拦截浏览器工具栏。 */ node => ({ inside: node.contains(document.activeElement), documentFocused: document.hasFocus(), bodyActive: document.activeElement === document.body, active: document.activeElement?.outerHTML.slice(0, 160) }))
      record.tabFocus.push(focus)
      assert.ok(focus.inside || (!focus.documentFocused && focus.bodyActive), `焦点不得泄漏至背景页面控件：${JSON.stringify(focus)}`)
    }
    await dialog.getByRole('button', { name: '关闭公众号', exact: true }).click()
    await expect(moreDialog).toBeVisible()
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    assert.ok(await moreDialog.evaluate(/* 恢复更多时焦点必须指向其有效子节点。 */ node => node.contains(document.activeElement)))
    assert.equal(await page.evaluate(/* 更多仍开启时正文应保持锁定。 */ () => getComputedStyle(document.body).overflow), 'hidden')
    await moreDialog.getByRole('button', { name: '关闭更多', exact: true }).click()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(more).toBeFocused()
    assert.notEqual(await page.evaluate(/* 全部关闭后解除滚动锁。 */ () => getComputedStyle(document.body).overflow), 'hidden')
  })

  await check('more-wechat-low-viewport-simulation', /* 模拟低高度与安全区令牌，验证弹层关闭及焦点恢复，不代表真机。 */ async page => {
    await home(page)
    const more = page.getByRole('navigation', { name: '手机导航', exact: true }).getByRole('button', { name: '更多', exact: true })
    await more.click()
    const dialog = page.getByRole('dialog', { name: '更多', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '微信公众号', exact: true }).click()
    const wechat = page.getByRole('dialog', { name: '微信公众号', exact: true })
    await expect(wechat).toBeVisible()
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    await page.setViewportSize({ width: 390, height: 420 })
    await page.evaluate(/* 仅模拟站内安全区变量，不能模拟系统手势区。 */ () => document.documentElement.style.setProperty('--mobile-safe-bottom', '34px'))
    await expect(wechat.getByRole('button', { name: '关闭公众号' })).toBeInViewport()
    await expect(wechat.getByText('reader-fixture-account', { exact: true })).toBeVisible()
    await wechat.getByRole('button', { name: '关闭公众号' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(more).toBeFocused()
    assert.notEqual(await page.evaluate(/* 关闭后正文不得遗留滚动锁。 */ () => getComputedStyle(document.body).overflow), 'hidden')
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    assert.match(viewport, /viewport-fit=cover/)
    assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale=1(?:\D|$)/)
  })
})
