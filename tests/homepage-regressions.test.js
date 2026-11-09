import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { startFixture } from './helpers/server.js'

test('configured homepage background and complete card interaction', { timeout: 30000 }, async t => {
  const { root, base } = await startFixture(t, 'server/index.js', { BLOG_DIST_DIR: resolve('dist') })
  const db = new Database(join(root, 'blog.db'))
  t.after(() => db.close())
  db.prepare("INSERT INTO categories(id,name,slug,created_at) VALUES(1,'卡片分类','card-category',1)").run()
  db.prepare("INSERT INTO articles(id,title,slug,content,excerpt,category_id,status,created_at,updated_at) VALUES('card','卡片跳转验收','card-target','# 正文','点击这段摘要应进入文章',1,'published',1,1)").run()
  await writeFile(join(root, 'uploads', 'background.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#16843e"/></svg>')
  await writeFile(join(root, 'settings.json'), JSON.stringify({ title: '首页回归', sidebar: 'hidden', theme: { preset: 'cyberpunk', background: { image: '/uploads/background.svg', size: 'cover', overlay: 0 }, effects: { pixelSnow: false, splashCursor: false, gridOverlay: false } } }))
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(4000)
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  const openHome = async () => {
    await page.goto(base)
    await page.getByRole('link', { name: '卡片跳转验收', exact: true }).waitFor()
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--bg-image').includes('background.svg'))
    await page.evaluate(() => new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = '/uploads/background.svg' }))
  }
  await t.test('saved image is visibly painted above document background and survives scrolling', async () => {
    await openHome()
    const pixel = await page.screenshot({ clip: { x: 2, y: 200, width: 1, height: 1 } })
    const rgb = await sharp(pixel).removeAlpha().raw().toBuffer()
    assert.deepEqual([...rgb], [22, 132, 62], 'configured green background must actually be visible')
    await page.evaluate(() => { document.getElementById('root').style.minHeight = '2500px'; window.scrollTo(0, 1300) })
    const afterScroll = await sharp(await page.screenshot({ clip: { x: 2, y: 200, width: 1, height: 1 } })).removeAlpha().raw().toBuffer()
    assert.deepEqual([...afterScroll], [22, 132, 62])
  })
  await t.test('excerpt and card padding navigate; likes and category keep their own actions', async () => {
    await openHome()
    // Click the visible excerpt coordinates: the native stretched link owns this hit area.
    const excerpt = await page.getByText('点击这段摘要应进入文章', { exact: true }).boundingBox()
    await page.mouse.click(excerpt.x + excerpt.width / 2, excerpt.y + excerpt.height / 2)
    await page.waitForURL(`${base}/article/card-target`)
    await openHome()
    const card = page.locator('main article.glass-card').first()
    await card.click({ position: { x: 5, y: 5 } })
    await page.waitForURL(`${base}/article/card-target`)
    await openHome()
    await page.getByRole('button', { name: '0 喜欢', exact: true }).click()
    assert.equal(new URL(page.url()).pathname, '/')
    await page.getByRole('button', { name: '1 喜欢', exact: true }).waitFor()
    await page.locator('main article.glass-card').getByRole('link', { name: '卡片分类', exact: true }).click()
    assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/category/卡片分类')
  })
})
