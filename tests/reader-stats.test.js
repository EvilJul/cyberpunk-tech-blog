import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { chromium, expect } from 'playwright/test'
import { startFixture } from './helpers/server.js'

/** 验证桌面、手机的真实访问记录、点赞汇总与统计故障提示，并在新服务进程中复查持久化。 */
test('reader stats count navigation, show persisted likes and survive service restart', { timeout: 60000 }, async t => {
  const options = { BLOG_DIST_DIR: resolve('dist'), VITE_BASE_PATH: '/', NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' }
  const { root, base, child } = await startFixture(t, 'server/index.js', options)
  const db = new Database(join(root, 'blog.db'))
  t.after(/* 关闭本次只用于准备和检查数据的数据库连接。 */ () => db.close())
  for (const status of ['published', 'draft']) {
    db.prepare('INSERT INTO articles(id,title,slug,content,status,publish_date,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)').run(status, `${status} article`, status, '真实文章正文', status, '2026-11-11')
    db.prepare('INSERT INTO article_stats(article_id,views,likes) VALUES(?,?,?)').run(status, 7, status === 'draft' ? 99 : 5)
  }
  const browser = await chromium.launch({ headless: true })
  t.after(/* 结束隔离读者浏览器。 */ () => browser.close())
  const context = await browser.newContext({ viewport: { width: 1399, height: 776 } })
  await context.route('https://fonts.googleapis.com/**', /* 避免外部字体影响读者验收。 */ route => route.fulfill({ body: '', contentType: 'text/css' }))
  const page = await context.newPage()
  const requests = []
  page.on('request', /* 收集访问写入以检查重渲染不会重复计数。 */ request => { if (request.url().endsWith('/api/stats/views') && request.method() === 'POST') requests.push(request.url()) })
  await page.goto(base)
  const stats = page.locator('.reader-profile-stats')
  await expect(stats.locator('> div').nth(0)).toContainText('1')
  await expect(stats.locator('> div').nth(2)).toContainText('5')
  assert.equal(requests.length, 1)
  const summary = await context.request.get(`${base}/api/stats/summary`)
  assert.match(summary.headers()['cache-control'], /no-store/)
  assert.deepEqual(await summary.json(), { views: 1, articles: 1, likes: 5 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.setViewportSize({ width: 1399, height: 776 })
  assert.equal(requests.length, 1, '断点切换不新增访问')
  await page.goto(`${base}/article/published`)
  await page.getByRole('button', { name: '点赞', exact: true }).click()
  await expect(page.getByRole('button', { name: '已点赞', exact: true })).toContainText('6')
  await page.goto(base)
  await expect(stats.locator('> div').nth(2)).toContainText('6')
  assert.equal(db.prepare('SELECT views FROM site_stats').get().views, 3)
  const duplicate = await context.request.post(`${base}/api/stats/article/published/likes`)
  assert.deepEqual(await duplicate.json(), { likes: 6 }, '同一来源重复点赞不累加')
  await page.route('**/api/stats/summary', /* 模拟统计服务失败，不能向读者显示虚假的零。 */ route => route.fulfill({ status: 503, body: '{}' }))
  await page.evaluate(/* 使用实际刷新事件触发汇总错误路径。 */ () => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('统计暂不可用，请稍后重试')).toBeVisible()
  await expect(stats.locator('> div').nth(2)).toContainText('—')
  await page.unroute('**/api/stats/summary')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect.poll(/* 手机即使不展示侧栏也必须记录访问。 */ () => db.prepare('SELECT views FROM site_stats').get().views).toBe(4)
  // 新进程只复用同一持久数据目录，模拟代码更新后的服务重启，不复用浏览器内存计数。
  const stopped = once(child, 'exit')
  child.kill('SIGTERM')
  await stopped
  const restarted = await startFixture(t, 'server/index.js', { ...options, BLOG_DATA_DIR: root })
  const response = await context.request.get(`${restarted.base}/api/stats/summary`)
  assert.deepEqual(await response.json(), { views: 4, articles: 1, likes: 6 })
  const again = await context.request.post(`${restarted.base}/api/stats/article/published/likes`)
  assert.deepEqual(await again.json(), { likes: 6 }, '重启后来源去重记录仍然存在')
  const stoppedAgain = once(restarted.child, 'exit')
  restarted.child.kill('SIGTERM')
  await stoppedAgain
})
