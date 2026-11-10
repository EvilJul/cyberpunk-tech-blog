import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { themes } from '../src/themes/index.js'

const directory = mkdtempSync(join(tmpdir(), 'blog-settings-security-'))
process.env.BLOG_DATA_DIR = directory
const { default: settings } = await import('../server/routes/settings.js')
const app = express()
app.use(express.json({ limit: '100kb' }))
app.use('/settings', settings)
app.use(/* 将解析失败转换为可断言响应，避免测试输出无关堆栈。 */ (error, req, res, next) => res.status(error.status || 500).json({ error: error.message }))
const server = app.listen(0, '127.0.0.1')
await new Promise(/* 等待隔离设置服务开始监听。 */ resolve => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}/settings`
const file = join(directory, 'settings.json')
/** 向隔离路由写入配置，外层管理员鉴权由现有管理验收覆盖。 */
async function save(body) {
  return fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
after(/* 关闭临时服务并清理隔离数据。 */ async () => {
  await new Promise(/* 等待连接关闭。 */ resolve => server.close(resolve))
  rmSync(directory, { recursive: true, force: true })
})

test('settings reject unknown keys and invalid structures without partial writes', /* 验证拒绝非法配置时持久文件保持原样。 */ async () => {
  assert.equal((await save({ title: '安全站点', showSidebar: false })).status, 200)
  const before = readFileSync(file, 'utf8')
  const invalid = [
    { title: '不应写入', secret: 'private' }, [], null,
    { perpage: '10' }, { perpage: 0 }, { perpage: 101 }, { excerpt: -1 },
    { title: 'x'.repeat(8193) }, { theme: [] }, { theme: { effects: { pixelSnow: 'true' } } },
    { theme: { colors: { primary: {} } } }, { theme: { background: { overlay: 2 } } },
    JSON.parse('{"theme":{"__proto__":{"secret":"value"}}}'),
    { theme: { deep: { a: { b: { c: { d: { e: { f: 'too deep' } } } } } } } },
    { theme: Object.fromEntries(Array.from({ length: 257 }, /* 构造超过字段预算的主题。 */ (_, i) => [`key${i}`, true])) },
    { theme: Object.fromEntries(Array.from({ length: 10 }, /* 构造超过总大小限制的主题。 */ (_, i) => [`key${i}`, 'x'.repeat(8192)])) }
  ]
  for (const body of invalid) {
    assert.ok([400, 413].includes((await save(body)).status))
    assert.equal(readFileSync(file, 'utf8'), before)
  }
})

test('public reads remove historical unknown settings and next save cleans them', /* 验证历史未知字段不会公开或在下次保存继续传播。 */ async () => {
  writeFileSync(file, JSON.stringify({ title: '旧站点', privateToken: 'never-public', perpage: 'invalid', theme: { name: '旧主题' } }))
  const response = await (await fetch(base)).json()
  assert.equal(response.settings.title, '旧站点')
  assert.equal(response.settings.perpage, 10)
  assert.equal(Object.hasOwn(response.settings, 'privateToken'), false)
  assert.equal((await save({ title: '新站点' })).status, 200)
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(file, 'utf8')), 'privateToken'), false)
})

test('all presets and bounded custom theme extensions round-trip', /* 验证合法主题预设及现有公开扩展的兼容性。 */ async () => {
  for (const [preset, theme] of Object.entries(themes)) {
    const body = { theme: { ...theme, preset, customExtension: { variant: { accent: 'amber', enabled: false }, revision: 3 } } }
    assert.equal((await save(body)).status, 200)
    const saved = (await (await fetch(base)).json()).settings.theme
    assert.equal(saved.colors.accentGlow, theme.colors.accentGlow)
    assert.deepEqual(saved.spacing, theme.spacing)
    assert.deepEqual(saved.customExtension, body.theme.customExtension)
  }
})
