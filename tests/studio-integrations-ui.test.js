import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'
import { chromium, expect } from 'playwright/test'
import { startFixture } from './helpers/server.js'

// Run after the parent finishes its shared build. BLOG_UI_DIST_DIR may select an isolated build.
// No traces or screenshots ever capture an unmasked credential; keys live only in process memory.
test('real integration UI: scoped once-only keys, machine audit, rotation, revocation and disable', { timeout: 120000 }, /* 执行当前验收场景并保留全部行为断言。 */ async t => {
  const dist = resolve(process.env.BLOG_UI_DIST_DIR || 'dist')
  await access(join(dist, 'index.html'))
  const artifacts = resolve('test-results/studio-integrations-ui')
  await mkdir(artifacts, { recursive: true })
  const evidence = { isolated: true, dist, startedAt: new Date().toISOString(), checks: [], browserErrors: [] }
  const fixture = await startFixture(t, 'server/index.js', { NODE_ENV: 'test', BLOG_DIST_DIR: dist, SESSION_COOKIE_SECURE: 'false', VITE_BASE_PATH: '/', PUBLIC_ORIGIN: '', PUBLISHING_API_ENABLED: 'true' })
  const { root, base } = fixture
  const db = new Database(join(root, 'blog.db'))
  t.after(/* 释放测试资源或保存验收证据。 */ () => db.close())
  db.prepare('INSERT INTO users(id,username,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('integration-ui-owner', 'integration-ui-owner', await bcrypt.hash('fixture-integration-password', 4), 'admin', 1, 1)
  const browser = await chromium.launch({ headless: true })
  t.after(/* 释放测试资源或保存验收证据。 */ () => browser.close())
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage(); page.setDefaultTimeout(8000)
  await page.route('https://fonts.googleapis.com/**', /* 拦截外部字体请求以稳定离线验收。 */ route => route.fulfill({ contentType: 'text/css', body: '' }))
  page.on('pageerror', /* 收集浏览器运行错误供最终断言。 */ error => evidence.browserErrors.push(error.message))
  page.on('dialog', /* 接受测试中的明确确认对话框。 */ dialog => dialog.accept())
  t.after(/* 释放测试资源或保存验收证据。 */ () => writeFile(join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2)))
  const secrets = []
  const secretField = page.getByLabel('一次性密钥', { exact: true })
  const check = /* 运行子场景并保存遮蔽密钥的验收截图。 */ async (name, fn) => t.test(name, /* 执行当前验收场景并保留全部行为断言。 */ async () => {
    try { await fn(); evidence.checks.push({ name, status: 'passed' }); await page.screenshot({ path: join(artifacts, `${evidence.checks.length}.png`), fullPage: true, mask: [secretField] }) }
    catch (error) {
      // Avoid ever serializing dynamic expected/actual values that could contain credentials.
      evidence.checks.push({ name, status: 'failed' })
      await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true, mask: [secretField] }).catch(/* 截图失败时保留原始场景异常。 */ () => {})
      throw error
    }
  })
  const json = /* 读取浏览器会话接口并校验成功状态。 */ async path => { const response = await context.request.get(base + path); assert.equal(response.status(), 200); return response.json() }
  const closeSecret = /* 关闭一次性密钥并确认其已移出页面。 */ async () => { await page.getByRole('button', { name: '已妥善保存，关闭', exact: true }).click(); await expect(secretField).toHaveCount(0) }
  const captureSecret = /* 校验密钥格式并仅在进程内保存供后续验证。 */ async () => { await expect(secretField).toBeVisible(); const value = await secretField.inputValue(); assert.ok(/^bpk_[a-f0-9-]+\.[A-Za-z0-9_-]+$/.test(value), 'credential format'); secrets.push(value); return value }
  const noPersistence = /* 确认已关闭密钥未进入页面或浏览器存储。 */ async () => {
    const stored = await page.evaluate(/* 读取浏览器存储以检查凭据未持久化。 */ () => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
    const dom = await page.locator('body').innerText()
    for (const key of secrets) { assert.ok(!stored.includes(key), 'credential absent from storage'); assert.ok(!dom.includes(key), 'closed credential absent from DOM') }
  }
  const machine = /* 使用独立机器凭据调用发布接口。 */ async (key, path, options = {}) => {
    const response = await fetch(base + '/api/v1' + path, { ...options, headers: { Authorization: `Bearer ${key}`, ...options.headers } })
    return { status: response.status, data: await response.json() }
  }
  let integrationId, originalKey, originalId, rotatedKey, rotatedId, finalKey, articleId
  const row = /* 按密钥标识定位对应操作行。 */ id => page.locator('section li').filter({ has: page.locator('code', { hasText: id }) })
  const selectIntegration = /* 选择测试集成并等待密钥操作可用。 */ async () => { await page.getByLabel('选择集成', { exact: true }).selectOption(integrationId); await expect(page.getByRole('button', { name: '创建密钥', exact: true })).toBeVisible() }
  const keys = /* 读取测试集成的脱敏密钥列表。 */ async () => (await json(`/api/studio/integrations/${integrationId}/keys`)).data

  await check('create integration and choose least-privilege scopes with explicit expiry', /* 验收集成创建、最小权限选择和明确有效期。 */ async () => {
    await page.goto(base + '/login?returnTo=/studio/integrations')
    await page.getByLabel('用户名', { exact: true }).fill('integration-ui-owner'); await page.getByLabel('密码', { exact: true }).fill('fixture-integration-password')
    await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page).toHaveURL(base + '/studio/integrations')
    await expect(page.getByRole('button', { name: '创建集成', exact: true })).toBeEnabled()
    await expect(page.getByRole('combobox', { name: '选择集成', exact: true })).toHaveAccessibleName('选择集成')
    await page.getByLabel('集成名称', { exact: true }).fill('真实 UI 验收中台'); await page.getByRole('button', { name: '创建集成', exact: true }).click()
    await expect(page.getByLabel('选择集成', { exact: true })).not.toHaveValue(''); integrationId = await page.getByLabel('选择集成', { exact: true }).inputValue()
    await expect(page.getByRole('combobox', { name: '选择集成', exact: true })).toHaveAccessibleName('选择集成')
    const scopeInputs = page.getByRole('checkbox'); await expect(scopeInputs).toHaveCount(4)
    for (const checkbox of await scopeInputs.all()) await expect(checkbox).not.toBeChecked()
    await page.getByRole('checkbox', { name: /^articles:read/ }).check(); await page.getByRole('checkbox', { name: /^articles:write/ }).check()
    await expect(page.getByRole('checkbox', { name: /^articles:publish/ })).not.toBeChecked(); await expect(page.getByRole('checkbox', { name: /^media:write/ })).not.toBeChecked()
    await page.getByLabel('有效天数（1–365）', { exact: true }).fill('7')
    await page.getByRole('button', { name: '创建密钥', exact: true }).click(); originalKey = await captureSecret(); originalId = originalKey.slice(4).split('.')[0]
    await expect(page.getByRole('button', { name: '创建密钥', exact: true })).toBeDisabled()
    const listed = await keys(); assert.equal(listed.length, 1); assert.deepEqual(listed[0].scopes, ['articles:read', 'articles:write']); assert.ok(listed[0].expires_at > Date.now() + 6 * 86400000 && listed[0].expires_at <= Date.now() + 7 * 86400000)
    assert.ok(!JSON.stringify(listed).includes(originalKey), 'list never returns plaintext')
  })
  await check('close and reload cannot recover plaintext credential; Node machine calls produce safe audit', /* 验收明文不可恢复及机器调用的脱敏审计。 */ async () => {
    await closeSecret(); await noPersistence(); await page.reload(); await selectIntegration(); await expect(secretField).toHaveCount(0); await noPersistence()
    assert.equal((await machine(originalKey, '/connection')).status, 200)
    const created = await machine(originalKey, '/articles/by-external-id/ui-source', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-None-Match': '*', 'Idempotency-Key': 'ui-integration-create-001' }, body: JSON.stringify({ title: '集成 UI 草稿', body_markdown: '不应进入审计的私密正文', slug: 'integration-ui-draft', tags: [] }) })
    assert.equal(created.status, 201); articleId = created.data.data.id
    // Read misses are audited without consuming the 20-write/minute budget.
    for (let i = 0; i < 22; i++) assert.equal((await machine(originalKey, `/articles/ui-missing-${i}`)).status, 404)
    await page.reload(); await selectIntegration()
    await expect(page.locator('section tbody tr')).toHaveCount(20)
    const text = await page.locator('section table').innerText(); assert.ok(!text.includes('不应进入审计的私密正文'))
    const audit = await json(`/api/studio/integrations/${integrationId}/audit`); assert.ok(audit.pagination.total > 20)
    for (const key of secrets) assert.ok(!JSON.stringify(audit).includes(key), 'audit excludes plaintext')
  })
  await check('audit pagination and current-page result filter show distinct request records', /* 验收审计分页、结果筛选和请求记录隔离。 */ async () => {
    const ids = await page.locator('section tbody tr td:last-child').allTextContents(); assert.equal(ids.length, 20)
    await page.getByLabel('当前页结果筛选', { exact: true }).fill('404'); await expect(page.locator('section tbody tr')).toHaveCount(20)
    await page.getByLabel('当前页结果筛选', { exact: true }).fill(''); await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(page.locator('section')).toContainText('第 2 页'); await expect.poll(/* 等待异步审计数据加载完成。 */ () => page.locator('section tbody tr').count()).toBeGreaterThan(0)
    const second = await page.locator('section tbody tr td:last-child').allTextContents(); assert.ok(second.every(/* 验证两页审计请求编号没有重复。 */ id => !ids.includes(id)), 'pages have distinct request IDs')
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
    await page.getByLabel('当前页结果筛选', { exact: true }).fill('201'); await expect(page.locator('section tbody tr')).toHaveCount(1)
    await page.getByLabel('当前页结果筛选', { exact: true }).fill(''); await page.getByRole('button', { name: '上一页', exact: true }).click(); await expect(page.locator('section tbody tr')).toHaveCount(20)
  })
  await check('rotate preserves scope and source identity; immediately revoked old key cannot authenticate', /* 验收轮换保留权限与来源并立即撤销旧密钥。 */ async () => {
    await expect(page.getByLabel('轮换重叠小时（默认立即撤销旧密钥，最多24小时）', { exact: true })).toHaveValue('0')
    await row(originalId).getByRole('button', { name: '轮换（保留原权限）', exact: true }).click(); rotatedKey = await captureSecret(); rotatedId = rotatedKey.slice(4).split('.')[0]
    assert.ok(rotatedKey !== originalKey, 'rotated credential differs')
    assert.equal((await machine(originalKey, '/connection')).status, 401); assert.equal((await machine(rotatedKey, '/connection')).status, 200)
    const mapped = await machine(rotatedKey, '/articles?external_id=ui-source'); assert.equal(mapped.status, 200); assert.equal(mapped.data.data[0].id, articleId); assert.equal(mapped.data.data[0].integration_id, integrationId)
    const listing = await keys(); assert.deepEqual(listing.find(/* 查找当前标识对应的条目。 */ key => key.key_id === rotatedId).scopes, ['articles:read', 'articles:write']); assert.ok(listing.find(/* 查找当前标识对应的条目。 */ key => key.key_id === originalId).revoked_at)
    await closeSecret(); await noPersistence(); await page.reload(); await selectIntegration(); await expect(secretField).toHaveCount(0); await noPersistence()
  })
  await check('revoke and disable take effect on next machine request; reenable retains integration namespace', /* 验收撤销、禁用和重新启用后的机器访问边界。 */ async () => {
    await row(rotatedId).getByRole('button', { name: '立即撤销', exact: true }).click(); await expect(row(rotatedId)).toContainText('已撤销'); assert.equal((await machine(rotatedKey, '/connection')).status, 401)
    await page.getByRole('checkbox', { name: /^articles:read/ }).check(); await page.getByRole('checkbox', { name: /^articles:write/ }).check()
    await page.getByRole('button', { name: '创建密钥', exact: true }).click(); finalKey = await captureSecret(); await closeSecret()
    assert.equal((await machine(finalKey, '/connection')).status, 200)
    await page.getByRole('button', { name: '禁用集成', exact: true }).click(); await expect(page.getByRole('button', { name: '启用集成', exact: true })).toBeVisible(); assert.equal((await machine(finalKey, '/connection')).status, 401)
    await page.getByRole('button', { name: '启用集成', exact: true }).click(); await expect(page.getByRole('button', { name: '禁用集成', exact: true })).toBeVisible(); assert.equal((await machine(finalKey, '/connection')).status, 200)
    const mapped = await machine(finalKey, '/articles?external_id=ui-source'); assert.equal(mapped.data.data[0].id, articleId)
    const machineManagement = await fetch(base + '/api/studio/integrations', { headers: { Authorization: `Bearer ${finalKey}` } }); assert.equal(machineManagement.status, 401)
    await noPersistence()
    const audit = await json(`/api/studio/integrations/${integrationId}/audit?per_page=100`)
    for (const operation of ['key.rotate', 'key.revoke', 'integration.update']) assert.ok(audit.data.some(/* 确认审计中包含预期生命周期操作。 */ entry => entry.operation === operation), operation)
    for (const key of secrets) assert.ok(!JSON.stringify(audit).includes(key), 'final audit excludes plaintext')
  })
  assert.deepEqual(evidence.browserErrors, [])
})
