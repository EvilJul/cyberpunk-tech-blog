import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
process.env.BLOG_DATA_DIR = await mkdtemp(join(tmpdir(), 'article-workspace-'))
process.env.NODE_ENV = 'production'
const { default: db, initDatabase } = await import('../server/db/index.js')
initDatabase()
const service = await import('../server/services/articleService.js')
const admin = { kind: 'user', id: 'author-test', role: 'admin' }
const actor = { kind: 'integration', integrationId: 'int1', scopes: ['articles:write'] }
const { ArticleDAO } = await import('../server/db/articleDAO.js')

test('workspace saves isolate public snapshots, versions and taxonomy; publishing is atomic', /* 验证草稿隔离、版本条件及原子发布。 */ () => {
  let draft = service.createDraft({ title: '中文标题', content: '# 原文', category: '私密分类', tags: ['私密标签'] }, admin)
  assert.ok(draft.slug)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categories').get().n, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tags').get().n, 0)
  assert.equal(ArticleDAO.findAll().pagination.total, 0)
  const initial = draft.revision
  assert.throws(/* 触发缺少版本的草稿保存。 */ () => service.saveDraft(draft.id, { title: 'x' }, null, admin), /* 匹配缺少版本的拒绝状态。 */ e => e.status === 428)
  draft = service.publish(draft.id, initial, admin)
  assert.equal(draft.status, 'published')
  const before = ArticleDAO.findById(draft.id)
  const saved = service.saveDraft(draft.id, { title: '改过的标题', content: '# 新文', category: '待发分类', tags: ['待发标签'], slug: 'future-slug' }, draft.revision, admin)
  const visible = ArticleDAO.findById(draft.id)
  for (const key of ['title', 'content', 'slug', 'category', 'update_date']) assert.equal(visible[key], before[key], key)
  assert.deepEqual(visible.tags, ['私密标签'])
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tags WHERE name='待发标签'").get().n, 0)
  assert.throws(/* 使用旧版本触发保存冲突。 */ () => service.saveDraft(draft.id, { content: 'stale' }, draft.revision, admin), /* 匹配版本冲突状态。 */ e => e.status === 412)
  const promoted = service.publish(draft.id, saved.revision, admin)
  assert.equal(promoted.slug, 'future-slug')
  assert.equal(ArticleDAO.findById(draft.id).content, '# 新文')
  assert.equal(promoted.published_revision, promoted.revision)
  assert.equal(service.publish(draft.id, promoted.revision, admin).revision, promoted.revision)
  const hidden = service.unpublish(draft.id, promoted.revision, admin)
  assert.equal(ArticleDAO.findAll().pagination.total, 0)
  assert.equal(service.getWorkingCopy(draft.id, admin).content, '# 新文')
  assert.equal(service.unpublish(draft.id, hidden.revision, admin).revision, hidden.revision)
})

test('slug reservation, transaction failure, and integration service policy', /* 验证别名预留、事务回滚及集成权限。 */ () => {
  let draft = service.createDraft({ title: 'Reserved', slug: 'reserved', content: 'content' }, admin)
  assert.throws(/* 创建重复别名的草稿。 */ () => service.createDraft({ title: 'conflict', slug: 'reserved' }, admin), /* 匹配别名冲突状态。 */ e => e.status === 409)
  const generated1 = service.createDraft({ title: '相同标题' }, admin)
  const generated2 = service.createDraft({ title: '相同标题' }, admin)
  assert.notEqual(generated1.slug, generated2.slug)
  db.exec("CREATE TRIGGER fail_publish BEFORE UPDATE OF status ON articles WHEN new.id='" + draft.id + "' AND new.status='published' BEGIN SELECT RAISE(ABORT,'injected'); END")
  assert.throws(/* 触发数据库故障下的发布回滚。 */ () => service.publish(draft.id, draft.revision, admin), /injected/)
  assert.equal(service.getWorkingCopy(draft.id, admin).revision, draft.revision)
  assert.equal(ArticleDAO.findById(draft.id).status, 'draft')
  db.exec('DROP TRIGGER fail_publish')
  assert.throws(/* 尝试未经授权的集成保存。 */ () => service.saveDraft(draft.id, { content: 'x' }, draft.revision, actor), /* 匹配集成权限拒绝状态。 */ e => e.status === 403)
  service.registerIntegrationPolicy(/* 仅授权指定集成执行写入。 */ (who, id, action) => who.integrationId === 'int1' && action === 'write')
  draft = service.saveDraft(draft.id, { content: 'machine draft' }, draft.revision, actor)
  assert.throws(/* 尝试无发布权限的集成发布。 */ () => service.publish(draft.id, draft.revision, actor), /* 匹配发布权限拒绝状态。 */ e => e.status === 403)
  service.registerIntegrationPolicy(null)
  const migrated = ArticleDAO.findById(generated1.id)
  initDatabase()
  assert.equal(ArticleDAO.findById(generated1.id).slug, migrated.slug)
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
})

test('distinct tag names survive slug collisions and draft timestamps track private saves', /* 验证同别名标签保留及私有保存时间更新。 */ () => {
  let draft = service.createDraft({ title: '标签与日期', tags: ['JavaScript', 'javascript', '有,逗号'], content: '公开正文' }, admin)
  draft = service.publish(draft.id, draft.revision, admin)
  assert.deepEqual(new Set(ArticleDAO.findById(draft.id).tags), new Set(['JavaScript', 'javascript', '有,逗号']))
  const listed = ArticleDAO.findAll({ perPage: 100 }).data.find(/* 定位当前草稿对应的列表记录。 */ value => value.id === draft.id)
  assert.deepEqual(new Set(listed.tags), new Set(['JavaScript', 'javascript', '有,逗号']))
  const publicTimestamp = ArticleDAO.findById(draft.id).updated_at
  const changed = service.saveDraft(draft.id, { title: '私下编辑的标题' }, draft.revision, admin)
  assert.ok(changed.updated_at > draft.updated_at)
  assert.equal(ArticleDAO.findById(draft.id).updated_at, publicTimestamp)
})
