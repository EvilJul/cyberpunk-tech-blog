import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

/** 使用独立组件入口与内存接口验证列表，不启动后端或写入真实数据。 */
test('列表请求、输入和地址契约', { timeout: 60000 }, async t => {
  const server = await createServer({ configFile: false, server: { port: 0 }, plugins: [{
    name: 'reader-list-test', enforce: 'pre',
    /** 注入只供测试使用的入口和轻量卡片，隔离其他代理的共享组件修改。 */
    resolveId(id, importer) {
      if (id === '/reader-list-harness.js') return '\0reader-harness'
      if (id === './ArticleCard' && importer?.endsWith('/ArticleList.jsx')) return '\0reader-card'
    },
    /** 提供测试挂载与选项更新入口。 */
    load(id) {
      if (id === '\0reader-card') return `import React from 'react'; /** 渲染接口标题供行为断言。 */ export default function Card({article}) { return React.createElement('article', null, article.title) }`
      if (id === '\0reader-harness') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import ArticleList from '/src/components/blog/ArticleList.jsx'; const root=createRoot(document.getElementById('root')); /** 更新列表公开参数而不重建路由。 */ window.renderList=(props={})=>root.render(React.createElement(BrowserRouter,null,React.createElement(ArticleList,{showCategories:false,...props,onStateChange:/* 记录列表提交后的状态。 */ state=>{window.lastResult=state}}))); window.renderList();`
    },
    /** 只提供测试 HTML，其余资源交由 Vite。 */
    configureServer(vite) {
      vite.middlewares.use(/* 返回专用组件页面。 */ (req, res, next) => {
        if (!req.url.startsWith('/__reader_test')) return next()
        res.setHeader('Content-Type', 'text/html')
        res.end('<html><div id="root"></div><script type="module" src="/reader-list-harness.js"></script></html>')
      })
    }
  }] })
  await server.listen()
  t.after(/* 测试结束释放开发服务器。 */ () => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(/* 测试结束关闭浏览器。 */ () => browser.close())
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(5000)
  const origin = `http://localhost:${server.httpServer.address().port}`
  const requests = []
  let fail = false
  let total = 30
  /** 返回带分页的可控公开结果。 */
  function payload(url) {
    const query = url.searchParams.get('search') || ''
    const current = Number(url.searchParams.get('page'))
    return { data: total ? [{ id: query || 'latest', title: query || '最新结果' }] : [], pagination: { total, total_pages: Math.ceil(total / 10), page: current } }
  }
  await page.route('**/api/articles?*', /* 模拟失败、慢响应及正常分页。 */ async route => {
    const url = new URL(route.request().url())
    requests.push(url)
    if (url.searchParams.get('search') === 'slow') await new Promise(/* 允许新搜索先返回。 */ resolve => setTimeout(resolve, 1000))
    if (fail) return route.fulfill({ status: 500, body: '{}' })
    await route.fulfill({ json: payload(url) }).catch(/* 被主动取消的测试请求无需继续发送。 */ () => {})
  })
  /** 等待成功列表提交而非仅等待网络返回。 */
  async function ready() { await page.locator('[data-list-ready="true"]').waitFor() }
  await page.goto(`${origin}/__reader_test?q=first&q=second&page=2&page=3&other=keep&focus=search`)
  await ready()
  assert.equal(new URL(page.url()).searchParams.getAll('q').length, 1)
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  assert.equal(new URL(page.url()).searchParams.get('other'), 'keep')
  assert.equal(new URL(page.url()).searchParams.has('focus'), false)
  const input = page.getByRole('textbox', { name: '搜索文章' })
  assert.equal(await input.inputValue(), 'first')
  await input.fill('slow')
  await page.waitForTimeout(550)
  await input.fill('newest')
  await page.waitForTimeout(1700)
  assert.equal(await page.locator('article').textContent(), 'newest')
  assert.equal(await input.evaluate(/* 检查输入节点仍拥有焦点。 */ node => node === document.activeElement), true)
  const count = requests.length
  await input.dispatchEvent('compositionstart')
  await input.fill('中文')
  await page.waitForTimeout(600)
  assert.equal(requests.length, count)
  await input.dispatchEvent('compositionend', { data: '中文' })
  await page.waitForTimeout(550)
  await ready()
  assert.equal(requests.at(-1).searchParams.get('search'), '中文')
  await page.getByRole('button', { name: '清除搜索' }).click()
  await page.waitForFunction(/* 等待清空真正提交成功。 */ () => window.lastResult?.query === '')
  await ready()
  assert.equal(new URL(page.url()).searchParams.has('q'), false)
  fail = true
  await page.getByRole('button', { name: '下一页' }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  assert.equal(await page.locator('article').textContent(), '最新结果')
  fail = false
  await page.getByRole('button', { name: '重试' }).click()
  await ready()
  total = 10
  const beforeCorrection = requests.length
  await page.getByRole('button', { name: '下一页' }).click()
  await page.waitForFunction(/* 等待越界补请求完成并报告纠正页。 */ () => window.lastResult?.page === 1 && !new URL(location.href).searchParams.has('page'))
  await ready()
  assert.equal(requests.length - beforeCorrection, 2)
  assert.equal(new URL(page.url()).searchParams.has('page'), false)
  total = 0
  await input.fill('empty')
  await page.waitForTimeout(550)
  await ready()
  await page.getByText('没有找到匹配的文章', { exact: false }).waitFor()
  // 独立模式初始化必须忽略外部 q/page，且不消费外部 focus。
  await page.goto(`${origin}/__reader_test?q=outside&page=3`)
  await ready()
  total = 30
  const outside = page.url()
  await page.evaluate(/* 重新挂载独立列表并使用初始条件。 */ () => { window.renderList({ key: 'modal', syncUrl: false, initialQuery: 'inside', initialPage: 2 }) })
  await page.waitForFunction(/* 等待独立初始状态成功提交。 */ () => window.lastResult?.query === 'inside')
  await ready()
  assert.equal(await input.inputValue(), 'inside')
  assert.equal(page.url(), outside)
  assert.deepEqual(await page.evaluate(/* 读取成功回调报告。 */ () => window.lastResult), { query: 'inside', page: 2 })
  await page.getByRole('button', { name: '下一页' }).click()
  await page.waitForFunction(/* 等待独立列表翻页回调。 */ () => window.lastResult?.page === 3)
  await ready()
  assert.equal(page.url(), outside)
  assert.deepEqual(await page.evaluate(/* 读取翻页后的成功状态。 */ () => window.lastResult), { query: 'inside', page: 3 })
  // 直达非法页码使用第一页，超上限先限制请求，再以成功总数纠正。
  for (const [raw, requested] of [['0', 1], ['-2', 1], ['abc', 1], ['1.5', 1], ['1000001', 1000000]]) {
    const before = requests.length
    await page.goto(`${origin}/__reader_test?q=case-${raw}&page=${raw}`)
    await ready()
    assert.equal(Number(requests[before].searchParams.get('page')), requested)
    assert.ok(requests.length - before <= 2)
  }
  total = 0
  const beforeEmpty = requests.length
  await page.goto(`${origin}/__reader_test?page=6`)
  await ready()
  await page.waitForFunction(/* 零结果直接规范化到第一页。 */ () => !new URL(location.href).searchParams.has('page'))
  await page.waitForTimeout(100)
  assert.equal(requests.length - beforeEmpty, 1)
  fail = true
  await page.goto(`${origin}/__reader_test?page=6`)
  await page.getByRole('alert').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('page'), '6')

})
