import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect } from 'playwright/test'
import sharp from 'sharp'

/** 用独立页面与模拟接口验收图片字段，不启动业务服务或读取真实数据。 */
test('inline image fields retain draft, crop, errors and deployment prefix', async t => {
  const server = await createServer({ configFile: false, base: '/blog/', plugins: [react(), {
    name: 'image-field-fixture',
    /** 提供仅包含本次管理页面的独立入口，隔离其他人的编辑器改动。 */
    configureServer(vite) {
      vite.middlewares.use(/* 返回测试 HTML 和 JSX 入口。 */ async (req, res, next) => {
        if (['/blog/fixture', '/fixture'].includes(req.url)) {
          res.setHeader('Content-Type', 'text/html')
          res.end(await vite.transformIndexHtml('/blog/fixture', '<div id="root"></div><script type="module" src="/blog/src-fixture.jsx"></script>'))
        } else next()
      })
    },
    /** 为测试入口提供源模块标识。 */
    resolveId(id) { if (id === '/src-fixture.jsx' || id === '/blog/src-fixture.jsx') return '\0fixture.jsx' },
    /** 挂载真实设置上下文与管理组件。 */
    load(id) {
      if (id === '\0fixture.jsx') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SettingsProvider} from '/src/contexts/SettingsContext.jsx'; import {SettingsPage,AppearancePage} from '/src/components/studio/ManagementPages.jsx'; createRoot(document.getElementById('root')).render(React.createElement(SettingsProvider, null, React.createElement(location.hash === '#appearance' ? AppearancePage : SettingsPage)));`
    }
  }], server: { port: 0, host: '127.0.0.1' } })
  await server.listen()
  t.after(/* 释放测试开发服务器。 */ () => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(/* 释放测试浏览器。 */ () => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(7000)
  page.setDefaultNavigationTimeout(10000)
  const errors = []
  page.on('pageerror', /* 收集未处理运行错误。 */ e => errors.push(e.message))
  const image = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#436899' } }).png().toBuffer()
  let draft = { title: '隔离测试', avatar: '', custom: { logo_url: '', keep: '扩展键' }, theme: { preset: 'custom', background: { image: '', overlay: 0.3 }, extra: '保留' } }
  let uploads = 0, saves = 0, fail = false, release
  await page.route('**/blog/api/**', /* 模拟已有接口并记录写入边界。 */ async route => {
    const req = route.request()
    if (req.url().endsWith('/media')) {
      uploads++
      if (release) await release
      return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: { message: '模拟失败' } } : { url: '/uploads/test.jpg' } })
    }
    if (req.method() === 'PUT') { saves++; draft = req.postDataJSON() }
    await route.fulfill({ json: { settings: draft } })
  })
  await page.route('**/blog/uploads/**', /* 用有效图片验证子路径预览解码。 */ route => route.fulfill({ contentType: 'image/png', body: image }))
  const base = server.resolvedUrls.local[0]
  await page.goto(base + 'fixture')
  await expect(page.getByLabel('公众号名称', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('微信号', { exact: true })).toHaveValue('')
  const avatar = page.getByLabel('上传头像（选择区域裁剪）', { exact: true })
  await avatar.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: image })
  await page.getByRole('button', { name: '取消裁剪' }).click()
  assert.equal(uploads, 0)
  await avatar.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: image })
  await page.getByRole('button', { name: '确认裁剪并上传' }).click()
  await expect(page.getByLabel('头像地址', { exact: true })).toHaveValue('/blog/uploads/test.jpg')
  assert.equal(saves, 0)
  await expect(page.getByAltText('头像地址预览')).toBeVisible()
  await page.getByLabel('上传公众号二维码', { exact: true }).setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByLabel('公众号二维码', { exact: true })).toHaveValue('/blog/uploads/test.jpg')
  assert.equal(saves, 0, '二维码上传也只改变待保存配置')
  await page.getByLabel('上传logo_url', { exact: true }).setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByLabel('logo_url', { exact: true })).toHaveValue('/blog/uploads/test.jpg')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect.poll(/* 等待显式设置保存。 */ () => saves).toBe(1)
  assert.equal(draft.custom.keep, '扩展键')
  await page.goto(base + 'fixture#appearance')
  await page.reload()
  const background = page.getByLabel('上传背景', { exact: true })
  let done
  release = new Promise(/* 控制上传延迟以验证忙碌状态和并发编辑。 */ resolve => { done = resolve })
  await background.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByText('正在上传…', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled()
  await page.getByLabel('背景遮罩透明度', { exact: true }).fill('0.7')
  done(); release = null
  await expect(page.getByLabel('背景图片地址', { exact: true })).toHaveValue('/blog/uploads/test.jpg')
  await expect(page.getByLabel('背景遮罩透明度', { exact: true })).toHaveValue('0.7')
  fail = true
  await background.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('alert')).toContainText('模拟失败')
  await expect(page.getByLabel('背景图片地址', { exact: true })).toHaveValue('/blog/uploads/test.jpg')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect.poll(/* 等待主题显式保存。 */ () => saves).toBe(2)
  assert.equal(draft.theme.extra, '保留')
  assert.equal(draft.theme.background.overlay, 0.7)
  assert.deepEqual(errors, [])
})
