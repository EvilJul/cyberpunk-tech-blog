import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { chromium } from 'playwright'
import { startFixture } from './helpers/server.js'

test('built subpath frontend loads assets, APIs and article links together', { timeout: 30000 }, async t => {
  const dist = await mkdtemp(join(tmpdir(), 'bolg-base-build-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--base=/blog/', '--outDir', dist, '--emptyOutDir'], { stdio: 'pipe' })
  const { root, base } = await startFixture(t, 'server/index.js', { VITE_BASE_PATH: '/blog/', BLOG_DIST_DIR: dist, SITE_URL: 'https://blog.example/blog' })
  const db = new Database(join(root, 'blog.db'))
  t.after(() => db.close())
  db.prepare("INSERT INTO articles(id,title,slug,content,status,created_at,updated_at) VALUES('subpath','子路径文章','release-1.0','# 子路径正文','published',1,1)").run()
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  t.after(() => { if (errors.length) t.diagnostic(JSON.stringify(errors)) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/blog/`, { waitUntil: 'domcontentloaded' })
  const link = page.getByRole('link', { name: '子路径文章', exact: true })
  await link.waitFor().catch(async error => { t.diagnostic(await page.locator('body').innerText()); throw error })
  await link.click()
  await page.locator('.markdown-body').waitFor()
  assert.equal(new URL(page.url()).pathname, '/blog/article/release-1.0')
  await page.reload()
  await page.locator('.markdown-body').waitFor()
  assert.equal(await page.locator('.markdown-body').innerText(), '子路径正文')
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://blog.example/blog/article/release-1.0')
  assert.deepEqual(errors, [])
})
