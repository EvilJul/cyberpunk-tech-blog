import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

test('admin login, escaped rendering, pagination, editing and theme', { timeout: 30000 }, async t => {
  // Static fixture server only; all API traffic is intercepted, no persistent data.
  const dir = await mkdtemp(join(tmpdir(), 'admin-ui-'))
  process.env.BLOG_DATA_DIR = dir
  process.env.JWT_SECRET = 'admin-ui-fixture-secret-at-least-32-chars'
  const { createAdminApp } = await import('../server/index-admin.js')
  const { default: db } = await import('../server/db/index.js')
  const app = createAdminApp()
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const browser = await chromium.launch({ headless: true })
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); db.close(); await rm(dir, { recursive: true, force: true }) })
  const page = await browser.newPage()
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
  });
  const errors = []
  page.setDefaultTimeout(8000)
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss() })
  page.on('pageerror', error => errors.push(error.message))
  let savedArticle, savedSettings
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    let data = {}
    if (url.pathname === '/api/auth/login') data = { token: 'fixture-token', user: { role: 'admin' } }
    else if (url.pathname === '/api/auth/me') data = { user: { role: 'admin' } }
    else if (url.pathname === '/api/articles' && req.method() === 'GET') data = { data: [{ id: 'a1', title: '<img src=x onerror=alert(1)>', category: '技术', tags: ['<script>'], status: 'published' }], pagination: { page: Number(url.searchParams.get('page') || 1), total: 21, total_pages: 3 } }
    else if (url.pathname === '/api/articles/by-id/a1') data = { id: 'a1', title: '原始文章', content: '原内容', category: '技术', tags: [], status: 'published' }
    else if (url.pathname === '/api/articles/a1') savedArticle = req.postDataJSON()
    else if (url.pathname === '/api/categories') data = [{ id: 1, name: '技术', slug: 'tech' }]
    else if (url.pathname === '/api/tags') data = []
    else if (url.pathname === '/api/settings') {
      if (req.method() === 'PUT' || req.method() === 'POST') savedSettings = req.postDataJSON()
      else data = { title: '测试博客' }
    }
    await route.fulfill({ json: data })
  })
  await page.route('https://fonts.googleapis.com/**', route => route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.locator('[name=username]').fill('admin')
  await page.locator('[name=password]').fill('fixture')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('#articles-table tr').waitFor()
  assert.equal(await page.locator('#login-panel').isVisible(), false)
  assert.equal(await page.locator('#articles-table img').count(), 0)
  assert.match(await page.locator('#articles-table').innerText(), /<img/)
  await page.getByRole('button', { name: '下一页' }).click()
  await page.waitForFunction(() => document.getElementById('article-pagination').textContent.includes('第 2 /'))
  await page.locator('#articles-table').getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('article-title').value === '原始文章')
  await page.locator('#article-title').fill('修改后的文章')
  await page.getByRole('button', { name: '发布文章', exact: true }).click()
  await page.waitForFunction(() => !document.getElementById('article-editor').classList.contains('active'))
  assert.equal(savedArticle.title, '修改后的文章')
  assert.equal(savedArticle.category, '技术')
  await page.locator('.nav-item').filter({ hasText: '系统设置' }).click()
  await page.locator('[data-admin-click]').filter({ hasText: '暗色' }).last().click()
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.waitForTimeout(100)
  assert.ok(savedSettings.theme)
  await page.locator('#logout-button').click()
  assert.equal(await page.locator('#login-panel').isVisible(), true)
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => window.cspViolations), [])
  assert.equal(await page.locator('[onclick], [onchange]').count(), 0)
})
