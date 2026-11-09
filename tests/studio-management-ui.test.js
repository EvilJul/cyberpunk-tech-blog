import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'
import sharp from 'sharp'
import { chromium, expect } from 'playwright/test'
import { startFixture } from './helpers/server.js'

// npm run build && node --test tests/studio-management-ui.test.js
// Actual production bundle + public server; all records/uploads live in a disposable fixture.
test('real browser management acceptance against isolated backend', { timeout: 180000 }, /* 使用隔离后端验收各管理页面真实交互。 */ async t => {
  const repo = resolve(import.meta.dirname, '..')
  await access(join(repo, 'dist/index.html'))
  const artifacts = join(repo, 'test-results', 'studio-management-ui')
  await mkdir(artifacts, { recursive: true })
  const evidence = { isolated: true, startedAt: new Date().toISOString(), checks: [], browserErrors: [] }
  const { root, base } = await startFixture(t, 'server/index.js', { NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false', BLOG_DIST_DIR: join(repo, 'dist'), VITE_BASE_PATH: '/', PUBLIC_ORIGIN: '', PUBLISHING_API_ENABLED: 'false', BLOG_LOG_DIR: join(artifacts, 'server-logs') })
  const db = new Database(join(root, 'blog.db'))
  t.after(/* 关闭验收数据库连接。 */ () => db.close())
  const hash = await bcrypt.hash('fixture-password-123', 4)
  db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('ui-owner', 'ui-owner', hash, 'admin', 1, 1)
  db.prepare('INSERT INTO categories(id,name,slug,created_at) VALUES(1,?,?,1)').run('公开分类', 'public-category')
  db.prepare('INSERT INTO tags(id,name,slug,created_at) VALUES(1,?,?,1)').run('公开标签', 'public-tag')
  db.prepare("INSERT INTO articles(id,title,slug,content,excerpt,author,category_id,status,publish_date,update_date,created_at,updated_at,revision,published_revision) VALUES(?,?,?,?,?,?,1,'published',?,?,1,1,1,1)")
    .run('ui-post', '发布快照标题', 'ui-public-post', '# 发布快照正文', '发布快照摘要', '快照作者', '2026-11-01', '2026-11-01')
  db.prepare('INSERT INTO article_tags(article_id,tag_id) VALUES(?,1)').run('ui-post')
  for (const [id, parent, author, status] of [['pending-root', null, '待审根作者', 'pending'], ['approved-child', 'pending-root', '子评论作者', 'approved'], ['approved-grandchild', 'approved-child', '孙评论作者', 'approved']]) {
    db.prepare('INSERT INTO comments(id,article_id,parent_id,author,email,content,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, 'ui-post', parent, author, 'private@example.test', `${author}的评论`, status, 1)
  }
  await writeFile(join(root, 'settings.json'), JSON.stringify({ title: '管理验收站点', showSidebar: true, theme: { effects: { pixelSnow: false, sideRays: false, splashCursor: false, gridOverlay: false, animations: false } } }))
  const image = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#436899' } }).png().toBuffer()
  const browser = await chromium.launch({ headless: true })
  t.after(/* 关闭验收浏览器。 */ () => browser.close())
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  await page.route('https://fonts.googleapis.com/**', /* 返回空字体样式以避免外部字体影响验收。 */ route => route.fulfill({ contentType: 'text/css', body: '' }))
  page.on('pageerror', /* 收集管理页面的运行时错误。 */ error => evidence.browserErrors.push(error.message))
  page.on('dialog', /* 接受管理操作的确认对话框。 */ dialog => dialog.accept())
  t.after(/* 将管理验收结果写入证据文件。 */ async () => { await writeFile(join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2)) })
  const check = /* 运行管理子测试并记录截图与结果。 */ async (name, fn) => t.test(name, /* 记录子测试成功或失败的证据。 */ async () => {
    try { await fn(); evidence.checks.push({ name, status: 'passed' }); await page.screenshot({ path: join(artifacts, `${evidence.checks.length}.png`), fullPage: true }) }
    catch (error) { evidence.checks.push({ name, status: 'failed', error: error.message }); await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(/* 忽略截图失败以保留原始测试异常。 */ () => {}); throw error }
  })
  const goto = /* 跳转管理页面并等待标题可见。 */ async path => { await page.goto(base + path); await expect(page.locator('.studio section h1')).toBeVisible() }
  const json = /* 读取真实接口并检查成功状态。 */ async path => { const response = await context.request.get(base + path); assert.equal(response.status(), 200, path); return response.json() }
  const settings = /* 取得当前持久化站点设置。 */ async () => (await json('/api/settings')).settings
  const saveSettings = /* 保存设置并等待成功反馈。 */ async () => { await page.getByRole('button', { name: '保存设置', exact: true }).click(); await expect(page.getByRole('status')).toContainText('操作成功') }
  const importJson = /* 导入配置文件并等待待保存提示。 */ async value => { await page.getByLabel('导入 JSON').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await expect(page.getByRole('status')).toContainText('已导入待保存配置') }
  const exportJson = /* 捕获配置下载并解析导出的 JSON。 */ async () => { const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON', exact: true }).click(); const download = await downloaded; return JSON.parse(await readFile(await download.path(), 'utf8')) }
  const login = /* 使用给定密码登录并等待工作台。 */ async password => { await page.goto(base + '/login'); await page.getByLabel('用户名', { exact: true }).fill('ui-owner'); await page.getByLabel('密码', { exact: true }).fill(password); await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page).toHaveURL(/\/studio(?:\/articles)?$/) }

  await check('browser login and category/tag create rename delete persist through actual APIs', /* 验证分类标签创建、改名、别名修改与删除。 */ async () => {
    await login('fixture-password-123')
    for (const [path, title] of [['categories', '分类'], ['tags', '标签']]) {
      await goto(`/studio/${path}`)
      await page.getByLabel('名称', { exact: true }).fill(`UI新增${title}`)
      await page.getByLabel('URL 别名', { exact: true }).fill(`ui-${path}-custom`)
      if (path === 'categories') await page.getByLabel('说明', { exact: true }).fill('UI 分类说明')
      await page.getByRole('button', { name: `新增${title}`, exact: true }).click()
      let row = page.locator('section li').filter({ hasText: `UI新增${title}` }); await expect(row).toBeVisible()
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      await page.getByLabel('名称', { exact: true }).fill(`UI重命名${title}`)
      await page.getByRole('button', { name: '保存修改', exact: true }).click()
      row = page.locator('section li').filter({ hasText: `UI重命名${title}` }); await expect(row).toBeVisible()
      assert.ok((await json(`/api/studio/${path}`)).some(/* 匹配改名后仍保留别名和说明的记录。 */ item => item.name === `UI重命名${title}` && item.slug === `ui-${path}-custom` && (path !== 'categories' || item.description === 'UI 分类说明')))
      await row.getByRole('button', { name: '编辑', exact: true }).click(); await page.getByLabel('URL 别名', { exact: true }).fill(`ui-${path}-changed`); await page.getByRole('button', { name: '保存修改', exact: true }).click(); await expect(row.locator('code')).toHaveText(`ui-${path}-changed`)
      await row.getByRole('button', { name: '删除', exact: true }).click(); await expect(row).toHaveCount(0)
    }
  })
  await check('pending approval exposes subtree; rejected ancestor hides descendants without changing their state', /* 验证审核祖先对子树可见性的影响及级联删除。 */ async () => {
    assert.equal((await json('/api/comments/ui-post')).length, 0)
    await goto('/studio/comments')
    const rootRow = page.locator('section article').filter({ has: page.getByRole('heading', { name: '待审根作者', exact: true }) })
    await rootRow.getByRole('button', { name: '通过', exact: true }).click(); await expect(rootRow).toHaveCount(0)
    let rows = await json('/api/comments/ui-post'); assert.equal(rows.length, 3); assert.ok(rows.every(/* 确认公开评论不泄露邮箱。 */ row => !('email' in row)))
    await page.getByLabel('审核状态').selectOption('approved')
    await rootRow.getByRole('button', { name: '拒绝', exact: true }).click(); await expect(rootRow).toHaveCount(0)
    assert.equal((await json('/api/comments/ui-post')).length, 0)
    assert.equal(db.prepare('SELECT status FROM comments WHERE id=?').get('approved-child').status, 'approved')
    await page.getByLabel('审核状态').selectOption('rejected'); await rootRow.getByRole('button', { name: '通过', exact: true }).click(); await expect(rootRow).toHaveCount(0)
    assert.equal((await json('/api/comments/ui-post')).length, 3)
    await page.getByLabel('审核状态').selectOption('approved'); await rootRow.getByRole('button', { name: '删除整棵回复' }).click(); await expect(rootRow).toHaveCount(0)
    assert.equal((await json('/api/comments/ui-post')).length, 0)
  })
  await check('media upload displays actual decoded image and copies URL/Markdown without delete actions', /* 验证媒体解码显示及地址和 Markdown 复制。 */ async () => {
    await goto('/studio/media')
    await page.getByLabel('上传图片', { exact: true }).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image })
    await expect(page.locator('section article img')).toHaveCount(1)
    assert.equal(await page.locator('section article img').evaluate(/* 检查媒体图片已成功解码。 */ img => img.complete && img.naturalWidth > 0), true)
    await page.getByRole('button', { name: '复制地址', exact: true }).click(); assert.match(await page.evaluate(/* 读取复制地址后的剪贴板内容。 */ () => navigator.clipboard.readText()), /^\/uploads\/.*\.jpg$/)
    await page.getByRole('button', { name: '复制 Markdown', exact: true }).click(); assert.match(await page.evaluate(/* 读取复制 Markdown 后的剪贴板内容。 */ () => navigator.clipboard.readText()), /^!\[图片\]\(\/uploads\/.+\)$/)
    assert.equal(await page.getByRole('button', { name: /删除/ }).count(), 0)
  })
  await check('avatar crop previews off-centre subject, cancels without writes, and uploads a selected 512px JPEG', /* 验证非居中主体裁剪、取消隔离、错误处理与保存边界。 */ async () => {
    await goto('/studio/settings')
    const before = await settings()
    const uploadInput = page.getByLabel('上传头像（选择区域裁剪）', { exact: true })
    const dialog = page.getByRole('dialog', { name: '裁剪头像' })
    const preview = page.getByRole('img', { name: '头像方形预览', exact: true })
    const source = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#0000ff' } }).composite([{ input: await sharp({ create: { width: 200, height: 400, channels: 3, background: '#ff0000' } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer()
    let uploads = 0, uploadedJpeg
    const trackUpload = /* 记录真实上传次数和 multipart 内的 JPEG，验证客户端输出。 */ request => {
      if (request.method() !== 'POST' || !request.url().endsWith('/api/studio/media')) return
      uploads++
      const body = request.postDataBuffer(), start = body.indexOf(Buffer.from([255, 216])), end = body.lastIndexOf(Buffer.from([255, 217]))
      if (start >= 0 && end > start) uploadedJpeg = body.subarray(start, end + 2)
    }
    page.on('request', trackUpload)
    const select = /* 重复选入同一测试图片，验证取消后可再次选择。 */ async () => { await uploadInput.setInputFiles({ name: 'off-centre.png', mimeType: 'image/png', buffer: source }); await expect(preview).toBeVisible() }
    const pixel = /* 读取实时预览中心像素以检查选区内容。 */ async () => preview.evaluate(/* 从 Canvas 获取选区中心 RGB。 */ canvas => [...canvas.getContext('2d').getImageData(48, 48, 1, 1).data].slice(0, 3))
    await select()
    assert.deepEqual(await pixel(), [0, 0, 255])
    await expect(page.getByRole('img', { name: '头像圆形预览', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '取消裁剪', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    assert.equal(uploads, 0); assert.deepEqual(await settings(), before)
    await expect(page.getByLabel('头像地址', { exact: true })).toHaveValue(before.avatar)
    for (const [name, buffer, message] of [['oversized.png', Buffer.alloc(5 * 1024 * 1024 + 1), '图片不能超过 5MB'], ['broken.png', Buffer.from('not an image'), '图片无法解码']]) {
      await uploadInput.setInputFiles({ name, mimeType: 'image/png', buffer })
      await expect(dialog.getByRole('alert')).toContainText(message)
      await expect(page.getByRole('button', { name: '确认裁剪并上传', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: '取消裁剪', exact: true }).click()
    }
    assert.equal(uploads, 0)
    // 5MB 恰好允许进入解码与预览；填充 PNG 尾部不改变有效图像。
    await uploadInput.setInputFiles({ name: 'boundary.png', mimeType: 'image/png', buffer: Buffer.concat([source, Buffer.alloc(5 * 1024 * 1024 - source.length)]) })
    await expect(preview).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
    await select()
    const originalBox = await page.getByRole('group', { name: '头像方形选区' }).boundingBox()
    await page.getByLabel('头像缩放（1–4倍）', { exact: true }).fill('2')
    const selection = page.getByRole('group', { name: '头像方形选区' })
    const box = await selection.boundingBox()
    assert.ok(Math.abs(box.width * 2 - originalBox.width) < 2, 'zoom halves source selection')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, { steps: 12 }); await page.mouse.up()
    await expect.poll(pixel).toEqual([255, 0, 0])
    await page.screenshot({ path: join(artifacts, 'avatar-crop-selection.png'), fullPage: true })
    await page.route('**/api/studio/media', /* 模拟一次上传失败，确认旧头像与选区保留可重试。 */ route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试上传暂不可用' } }) }), { times: 1 })
    await page.getByRole('button', { name: '确认裁剪并上传', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('测试上传暂不可用')
    assert.deepEqual(await settings(), before)
    await expect(page.getByLabel('头像地址', { exact: true })).toHaveValue(before.avatar)
    assert.deepEqual(await pixel(), [255, 0, 0])
    await page.getByRole('button', { name: '确认裁剪并上传', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('图片已上传')
    const draftUrl = await page.getByLabel('头像地址', { exact: true }).inputValue()
    assert.notEqual(draftUrl, before.avatar); assert.deepEqual(await settings(), before)
    const sent = await sharp(uploadedJpeg).metadata()
    assert.equal(sent.format, 'jpeg'); assert.equal(sent.width, 512); assert.equal(sent.height, 512)
    await saveSettings()
    const saved = await settings(); assert.equal(saved.avatar, draftUrl)
    const actual = await readFile(join(root, saved.avatar)), metadata = await sharp(actual).metadata()
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512)
    const center = await sharp(actual).extract({ left: 256, top: 256, width: 1, height: 1 }).raw().toBuffer()
    assert.ok(center[0] > 240 && center[1] < 15 && center[2] < 15, 'selected left red subject replaces default blue centre')
    await page.reload(); await expect(page.getByLabel('头像地址', { exact: true })).toHaveValue(saved.avatar)
    page.off('request', trackUpload)
  })
  await check('Markdown toolbar inserts strike, inline code and three heading levels into the selected text', /* 验证五项辅助工具保留选区外正文并正确渲染预览。 */ async () => {
    await goto('/studio/editor/new')
    const body = page.getByLabel('Markdown 正文', { exact: true })
    for (const [name, before, after, selector] of [['H1', '# ', '', 'h1'], ['H2', '## ', '', 'h2'], ['H3', '### ', '', 'h3'], ['删除线', '~~', '~~', 'del'], ['行内代码', '`', '`', 'code']]) {
      await body.fill('前\n主体\n后')
      await body.evaluate(/* 明确选中第二行，检查工具只作用于当前选区。 */ element => { element.focus(); element.setSelectionRange(2, 4) })
      await page.getByRole('toolbar', { name: 'Markdown 工具栏' }).getByRole('button', { name, exact: true }).click()
      await expect(body).toHaveValue(`前\n${before}主体${after}\n后`)
      await page.getByRole('button', { name: '预览', exact: true }).click()
      await expect(page.locator(`.studio-preview ${selector}`).filter({ hasText: '主体' })).toBeVisible()
      await page.getByRole('button', { name: '关闭预览', exact: true }).click()
    }
    await body.fill('前\n主体\n后')
    await body.evaluate(/* 将光标置于行中，验证标题前缀仍插入行首。 */ element => { element.focus(); element.setSelectionRange(3, 3) })
    await page.getByRole('toolbar', { name: 'Markdown 工具栏' }).getByRole('button', { name: 'H3', exact: true }).click()
    await expect(body).toHaveValue('前\n### 主体\n后')
  })
  await check('full settings normal fields, avatar upload and JSON import/export roundtrip', /* 验证设置字段、头像上传及 JSON 往返。 */ async () => {
    await goto('/studio/settings')
    const strings = { 站点名称: 'UI修改站点', 站点描述: 'UI站点描述', 强调色: 'blue', 侧栏位置: 'left', 作者名称: 'UI作者', 作者简介: 'UI简介', 'GitHub 地址': 'https://github.com/example', 联系邮箱: 'ui@example.test' }
    for (const [label, value] of Object.entries(strings)) await page.getByLabel(label, { exact: true }).fill(value)
    await page.getByLabel('摘要字数', { exact: true }).fill('88'); await page.getByLabel('每页文章数', { exact: true }).fill('7')
    for (const label of ['网格布局', '显示页脚', '显示侧栏']) await page.getByLabel(label, { exact: true }).uncheck()
    await page.getByLabel('上传头像（选择区域裁剪）', { exact: true }).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image })
    await expect(page.getByRole('img', { name: '头像方形预览', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '确认裁剪并上传', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('图片已上传'); await saveSettings()
    const saved = await settings(); assert.equal(saved.perpage, 7); assert.equal(saved.author, 'UI作者'); assert.equal(saved.showSidebar, false); assert.match(saved.avatar, /^\/uploads\//)
    const avatar = await sharp(await readFile(join(root, saved.avatar))).metadata(); assert.equal(avatar.width, avatar.height)
    const exported = await exportJson(); assert.deepEqual(exported, saved)
    await importJson({ ...exported, bio: 'JSON 导入简介', title: 'JSON导入站点' }); await saveSettings()
    assert.equal((await settings()).bio, 'JSON 导入简介')
    await page.reload(); await expect(page.getByLabel('站点名称', { exact: true })).toHaveValue('JSON导入站点')
  })
  await check('legacy theme import validates nested groups, restores defaults, and preserves custom extension keys', /* 验证旧主题兼容、原子导入及扩展键保存导出往返。 */ async () => {
    await goto('/studio/appearance')
    const persistedBefore = await settings()
    const defaults = (await json('/api/studio/settings/default-theme')).theme
    await page.getByLabel('主色', { exact: true }).fill('#112233')
    const draftBefore = await exportJson()
    const editableValues = /* 读取全部非文件控件的值与选中状态，逐个确认非法导入未改草稿。 */ async () => page.locator('section input:not([type="file"]), section select, section textarea').evaluateAll(/* 按显示顺序提取设置控件状态，不依赖重复下载。 */ elements => elements.map(/* 记录控件类型、值和布尔选中状态。 */ element => ({ type: element.type, value: element.value, checked: element.checked })))
    const controlsBefore = await editableValues()
    const legacy = { colors: { primary: '#456789' }, fonts: { body: 'Georgia, serif' }, effects: { animations: false }, borderRadius: { lg: '2rem' } }
    const invalid = [[], 'theme', { ...legacy, effects: undefined }]
    for (const group of ['colors', 'fonts', 'effects', 'borderRadius', 'background', 'spacing']) {
      for (const value of [[], 'damaged', null]) invalid.push({ ...legacy, [group]: value })
    }
    invalid.push(
      { ...legacy, colors: { primary: {} } },
      { ...legacy, fonts: { body: [] } },
      { ...legacy, effects: { animations: 'false' } },
      { ...legacy, borderRadius: { lg: {} } },
      { ...legacy, background: { overlay: '0.2' } },
      { ...legacy, spacing: { unit: [] } }
    )
    for (const value of invalid) {
      await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({ name: 'invalid-theme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })
      await expect(page.getByRole('status')).toContainText(/JSON 必须是对象|主题 .+必须是对象|主题 .+类型无效/)
      assert.deepEqual(await editableValues(), controlsBefore, 'invalid import preserves every editable draft field')
    }
    assert.deepEqual(await exportJson(), draftBefore, 'all rejected imports preserve the complete draft')
    await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"colors":') })
    await expect(page.getByRole('status')).not.toContainText('已导入待保存配置')
    assert.deepEqual(await exportJson(), draftBefore)
    assert.deepEqual(await settings(), persistedBefore, 'rejected imports never save settings')
    const imported = { ...legacy, preset: 'dark', spacing: { unit: 12, gutter: '1.5rem' }, customExtension: { variant: { accent: 'amber', enabled: false }, revision: 3 } }
    await importJson(imported)
    const normalized = await exportJson()
    assert.equal(normalized.name, '导入的主题'); assert.equal(normalized.preset, 'custom')
    await expect(page.getByLabel('套用主题预设', { exact: true })).toHaveValue('custom')
    for (const group of ['colors', 'fonts', 'effects', 'borderRadius', 'background']) assert.deepEqual(normalized[group], { ...defaults[group], ...imported[group] }, group)
    assert.equal(normalized.effects.animations, false)
    assert.deepEqual(normalized.spacing, imported.spacing); assert.deepEqual(normalized.customExtension, imported.customExtension)
    assert.deepEqual(await settings(), persistedBefore, 'valid import remains a draft until explicit save')
    await saveSettings()
    const saved = (await settings()).theme
    assert.deepEqual(saved, normalized)
    await page.reload(); await expect(page.getByLabel('套用主题预设', { exact: true })).toHaveValue('custom')
    assert.deepEqual(await exportJson(), normalized, 'reload and export preserve all extension keys')
    await importJson(normalized); assert.deepEqual(await exportJson(), normalized, 'exported custom theme remains importable')
  })
  await check('appearance colors/fonts/radii/effects/background upload and theme JSON/reset preserve site fields', /* 验证主题字段、背景上传、导入导出与恢复范围。 */ async () => {
    await goto('/studio/appearance')
    await page.getByLabel('主色', { exact: true }).fill('#234567')
    await page.getByLabel('正文字体', { exact: true }).fill('Arial, sans-serif')
    await page.getByLabel('大圆角', { exact: true }).fill('1.25rem')
    await page.getByLabel('背景遮罩透明度', { exact: true }).fill('0.45')
    await page.getByLabel('背景尺寸', { exact: true }).fill('contain')
    await page.getByLabel('背景位置', { exact: true }).fill('top center')
    await page.getByLabel('背景重复', { exact: true }).fill('repeat-x')
    await page.getByLabel('玻璃效果', { exact: true }).uncheck()
    await page.getByLabel('上传背景', { exact: true }).setInputFiles({ name: 'background.png', mimeType: 'image/png', buffer: image })
    await expect(page.getByRole('status')).toContainText('图片已上传'); await saveSettings()
    let saved = await settings(); assert.equal(saved.theme.background.overlay, 0.45); assert.equal(saved.theme.background.size, 'contain'); assert.equal(saved.theme.colors.primary, '#234567'); assert.equal(saved.theme.fonts.body, 'Arial, sans-serif'); assert.equal(saved.theme.borderRadius.lg, '1.25rem'); assert.equal(saved.theme.effects.glassEffect, false)
    const exported = await exportJson(); assert.deepEqual(exported, saved.theme)
    await importJson({ ...exported, name: '导入验收主题', colors: { ...exported.colors, primary: '#345678' } }); await saveSettings()
    await page.reload(); await expect(page.getByLabel('主题名称', { exact: true })).toHaveValue('导入验收主题')
    const reader = await context.newPage(); await reader.goto(base); await expect.poll(/* 轮询读者页面的主题主色。 */ () => reader.evaluate(/* 读取读者页面应用的主色变量。 */ () => document.documentElement.style.getPropertyValue('--theme-primary'))).toBe('#345678'); assert.match(await reader.evaluate(/* 读取读者页面应用的背景变量。 */ () => document.documentElement.style.getPropertyValue('--bg-image')), /\/uploads\//); await reader.close()
    await page.getByRole('button', { name: '恢复默认', exact: true }).click(); await expect(page.getByRole('status')).toContainText('操作成功')
    saved = await settings(); assert.equal(saved.title, 'JSON导入站点'); assert.equal(saved.theme.colors.primary, '#6366f1')
    await goto('/studio/settings'); await page.getByRole('button', { name: '恢复默认', exact: true }).click(); await expect(page.getByRole('status')).toContainText('操作成功'); assert.equal((await settings()).title, 'TechBlog')
  })
  await check('saving working copy preserves public article, taxonomy, RSS/sitemap and server metadata', /* 验证保存工作副本不改变公开内容与发现元数据。 */ async () => {
    const publicBefore = await json('/api/articles/ui-public-post')
    const before = {}; for (const path of ['/rss.xml', '/sitemap.xml', '/article/ui-public-post']) before[path] = await (await context.request.get(base + path)).text()
    const me = await json('/api/session/me')
    const response = await context.request.put(base + '/api/studio/articles/ui-post/draft', { headers: { Origin: base, 'X-CSRF-Token': me.csrfToken, 'If-Match': '"1"' }, data: { title: '未发布私密标题', content: '# 未发布私密正文', excerpt: '未发布私密摘要', slug: 'private-future-slug', category: '未发布分类', tags: ['未发布标签'] } })
    assert.equal(response.status(), 200, await response.text())
    const publicAfter = await json('/api/articles/ui-public-post'); for (const field of ['title', 'content', 'excerpt', 'slug', 'category', 'tags', 'publish_date', 'update_date', 'updated_at', 'published_revision']) assert.deepEqual(publicAfter[field], publicBefore[field], field)
    for (const path of Object.keys(before)) assert.equal(await (await context.request.get(base + path)).text(), before[path], path)
    assert.ok(!(await json('/api/categories')).some(/* 查找不应公开的草稿分类。 */ item => item.name === '未发布分类')); assert.ok(!(await json('/api/tags')).some(/* 查找不应公开的草稿标签。 */ item => item.name === '未发布标签'))
    await page.goto(base + '/article/ui-public-post'); await expect(page.getByRole('heading', { name: '发布快照标题', exact: true })).toBeVisible(); await expect(page).toHaveTitle('发布快照标题 - TechBlog'); await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', '发布快照摘要')
  })
  await check('logs filtering and clearing redact secrets; account password revokes session and can login/logout', /* 验证日志脱敏及密码变更、重新登录与退出。 */ async () => {
    await writeFile(join(root, 'app.log'), JSON.stringify({ timestamp: '2026-11-09', level: 'ERROR', message: 'SECRET_NEVER_RENDER', data: { key: 'SECRET_NEVER_RENDER' } }) + '\n')
    await goto('/studio/logs'); await expect(page.locator('section li')).toHaveCount(1); assert.ok(!(await page.locator('section').innerText()).includes('SECRET_NEVER_RENDER'))
    await page.getByLabel('日志等级', { exact: true }).selectOption('INFO'); await expect(page.locator('section li')).toHaveCount(0)
    await page.getByLabel('日志等级', { exact: true }).selectOption('ERROR'); await expect(page.locator('section li')).toHaveCount(1)
    await page.getByRole('button', { name: '清空日志', exact: true }).click(); await expect(page.locator('section li')).toHaveCount(0)
    await goto('/studio/account'); await expect(page.getByRole('link', { name: '查看系统日志', exact: true })).toBeVisible()
    await page.getByLabel('旧密码', { exact: true }).fill('wrong-password'); await page.getByLabel('新密码', { exact: true }).fill('fixture-new-password-456'); await page.getByRole('button', { name: '修改密码并撤销所有会话' }).click(); await expect(page.getByRole('status')).toContainText('旧密码错误')
    await page.getByLabel('旧密码', { exact: true }).fill('fixture-password-123'); await page.getByRole('button', { name: '修改密码并撤销所有会话' }).click(); await expect(page).toHaveURL(/\/login\?/)
    assert.equal((await json('/api/session/me')).user, null); assert.equal((await context.request.get(base + '/api/studio/categories')).status(), 401)
    await login('fixture-new-password-456'); await goto('/studio/account'); await page.locator('section').getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page).toHaveURL(/\/login\?/)
    assert.equal((await json('/api/session/me')).user, null); assert.equal((await context.request.get(base + '/api/studio/categories')).status(), 401)
  })
  assert.deepEqual(evidence.browserErrors, [])
})
