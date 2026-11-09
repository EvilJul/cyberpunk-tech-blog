import { randomUUID } from 'node:crypto'
import db from '../db/index.js'
import {
  getWorkingCopy,
  createDraft,
  saveDraft,
  publish,
  unpublish,
  registerIntegrationPolicy
} from './articleService.js'
import {
  verifyActor,
  integrationPolicy,
  fail,
  digest,
  audit
} from './integrationService.js'
registerIntegrationPolicy(integrationPolicy)
/** 生成包含文章编号和修订号的强ETag。 */
export const etag = (dto) => `"article-${dto.id}-r${dto.revision}"`
/** 校验外部编号并读取集成来源映射。 */
export function source(actor, externalId) {
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(externalId))
    fail(422, 'INVALID_FIELDS', '来源编号无效')
  return db
    .prepare(
      'SELECT * FROM article_sources WHERE integration_id=? AND external_id=?'
    )
    .get(actor.integrationId, externalId)
}
/** 将工作副本转换为发布协议响应。 */
export function dtoFor(value, mapping) {
  return {
    id: value.id,
    title: value.title,
    body_markdown: value.content,
    slug: value.slug,
    excerpt: value.excerpt || null,
    category: value.category_id ?? null,
    tags: value.tags || [],
    cover_media_id: value.cover_media_id ?? null,
    canonical_source: value.canonical_source ?? null,
    external_id: mapping.external_id,
    integration_id: mapping.integration_id,
    status: value.status,
    revision: value.revision,
    published_revision: value.published_revision ?? null,
    updated_at: new Date(value.updated_at || Date.now()).toISOString(),
    public_url:
      value.status === 'published'
        ? value.public_url ||
          `${(process.env.VITE_BASE_PATH || '/').replace(/\/$/, '')}/article/${value.public_slug || value.slug}`
        : null
  }
}
/** 校验归属及读取权限后返回文章。 */
export function readArticle(id, actor) {
  verifyActor(actor, 'articles:read', id)
  return dtoFor(
    getWorkingCopy(id, actor),
    db.prepare('SELECT * FROM article_sources WHERE article_id=?').get(id)
  )
}
/** 解析并校验分页参数。 */
export function pagination(query) {
  /** 解析具有默认值和上限的正整数。 */
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > max)
      fail(422, 'INVALID_FIELDS', '分页参数无效')
    return Number(value)
  }
  return {
    page: parse(query.page, 1, 1000000),
    per_page: parse(query.per_page, 20, 100)
  }
}
/** 分页筛选当前集成拥有的文章。 */
export function listArticles(actor, query) {
  verifyActor(actor, 'articles:read')
  const { page, per_page } = pagination(query)
  if (query.status && !['draft', 'published'].includes(query.status))
    fail(422, 'INVALID_FIELDS', '状态无效')
  if (query.external_id !== undefined) source(actor, query.external_id)
  const where =
    's.integration_id=? AND s.tombstone=0' +
    (query.status ? ' AND a.status=?' : '') +
    (query.external_id !== undefined ? ' AND s.external_id=?' : '')
  const args = [
    actor.integrationId,
    ...(query.status ? [query.status] : []),
    ...(query.external_id !== undefined ? [query.external_id] : [])
  ]
  const total = db
    .prepare(
      `SELECT count(*) n FROM article_sources s JOIN articles a ON a.id=s.article_id WHERE ${where}`
    )
    .get(...args).n
  const rows = db
    .prepare(
      `SELECT a.id FROM article_sources s JOIN articles a ON a.id=s.article_id WHERE ${where} ORDER BY a.created_at DESC,a.id ASC LIMIT ? OFFSET ?`
    )
    .all(...args, per_page, (page - 1) * per_page)
  return {
    items: rows.map(/* 移除列表摘要中的正文内容。 */ (row) => {
      const { content, body_markdown, ...summary } = readArticle(row.id, actor)
      return summary
    }),
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
      has_next: page * per_page < total,
      has_prev: page > 1
    }
  }
}
const fields = [
  'title',
  'body_markdown',
  'slug',
  'tags',
  'category',
  'excerpt',
  'canonical_source',
  'cover_media_id'
]
/** 校验发布字段并适配共享文章格式。 */
export function normalize(payload, put, externalId, actor, current) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).some(/* 识别文章请求中的未知字段。 */ (k) => !fields.includes(k))
  )
    fail(422, 'INVALID_FIELDS', '包含未知字段')
  const p = put
    ? {
        tags: [],
        category: null,
        excerpt: null,
        canonical_source: null,
        cover_media_id: null,
        ...payload
      }
    : { ...payload }
  if (put && (!Object.hasOwn(p, 'title') || !Object.hasOwn(p, 'body_markdown')))
    fail(422, 'INVALID_FIELDS', '标题和正文必填')
  if ('title' in p) {
    if (
      typeof p.title !== 'string' ||
      ![...p.title.trim()].length ||
      [...p.title.trim()].length > 200
    )
      fail(422, 'INVALID_FIELDS', '标题无效')
    p.title = p.title.trim()
  }
  if ('body_markdown' in p) {
    if (typeof p.body_markdown !== 'string')
      fail(422, 'INVALID_FIELDS', '正文须为字符串')
    if (Buffer.byteLength(p.body_markdown) > 1048576)
      fail(413, 'PAYLOAD_TOO_LARGE', '正文过大')
    p.content = p.body_markdown
    delete p.body_markdown
  }
  if (
    'slug' in p &&
    (typeof p.slug !== 'string' || !/^[a-z0-9-]{1,160}$/.test(p.slug))
  )
    fail(422, 'INVALID_FIELDS', '地址无效')
  if (put && !p.slug) p.slug = current?.slug || `article-${randomUUID()}`
  if (
    'excerpt' in p &&
    p.excerpt !== null &&
    (typeof p.excerpt !== 'string' || [...p.excerpt].length > 1000)
  )
    fail(422, 'INVALID_FIELDS', '摘要无效')
  if ('tags' in p) {
    if (
      !Array.isArray(p.tags) ||
      p.tags.length > 20 ||
      p.tags.some(
        /* 检查标签类型、内容及长度。 */ (t) => typeof t !== 'string' || !t.trim() || [...t.trim()].length > 50
      )
    )
      fail(422, 'INVALID_FIELDS', '标签无效')
    p.tags = [...new Set(p.tags.map(/* 去除标签两侧空白。 */ (t) => t.trim()))]
  }
  if ('category' in p) {
    if (
      p.category !== null &&
      (!Number.isSafeInteger(p.category) || p.category < 1)
    )
      fail(422, 'INVALID_FIELDS', '分类须为已有分类的正整数编号或 null')
    const row =
      p.category === null
        ? null
        : db
            .prepare('SELECT id,name FROM categories WHERE id=?')
            .get(p.category)
    if (p.category !== null && !row) fail(422, 'INVALID_FIELDS', '分类不存在')
    p.category_id = row?.id ?? null
    p.category = row?.name ?? null
  }
  if (p.canonical_source !== undefined && p.canonical_source !== null) {
    const c = p.canonical_source
    let u
    try {
      u = new URL(c.url)
    } catch {
      fail(422, 'INVALID_FIELDS', '来源地址无效')
    }
    if (
      Object.keys(c).some(/* 识别规范来源中的未知字段。 */ (k) => !['url', 'external_id'].includes(k)) ||
      typeof c.url !== 'string' ||
      c.url.length > 2048 ||
      !['http:', 'https:'].includes(u.protocol) ||
      u.username ||
      u.password ||
      c.external_id !== externalId
    )
      fail(422, 'INVALID_FIELDS', '来源地址无效')
  }
  if (
    p.cover_media_id !== undefined &&
    p.cover_media_id !== null &&
    !db
      .prepare(
        'SELECT 1 FROM integration_media WHERE id=? AND integration_id=?'
      )
      .get(
        typeof p.cover_media_id === 'string' ? p.cover_media_id : '',
        actor.integrationId
      )
  )
    fail(422, 'INVALID_FIELDS', '封面不存在')
  return p
}
/** 递归排序对象键以生成稳定请求指纹。 */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map(/* 递归规范化每个字段的值。 */ (k) => [k, canonical(v[k])])
    )
  return v
}
/** 校验幂等键并在同一事务中保存写入结果。 */
export function writeOnce(
  req,
  scope,
  id,
  perform,
  fingerprintPayload = req.body
) {
  const actor = req.actor,
    key = req.get('Idempotency-Key'),
    route = Object.entries(req.params).reduce(
      /* 替换路由参数以确定幂等目标。 */ (path, [name, value]) =>
        path.replace(':' + name, encodeURIComponent(value)),
      req.route.path
    )
  if (!key || !/^[\x20-\x7e]{8,128}$/.test(key))
    fail(400, 'INVALID_IDEMPOTENCY_KEY', '需要8至128字符幂等键')
  const fingerprint = digest(
    JSON.stringify(
      canonical({
        payload: fingerprintPayload ?? null,
        match: req.get('If-Match') ?? null,
        none: req.get('If-None-Match') ?? null
      })
    )
  )
  return db
    .transaction(/* 复核身份并原子重放或执行和记录写入。 */ () => {
      verifyActor(actor, scope, id)
      const old = db
        .prepare(
          'SELECT * FROM publishing_idempotency WHERE integration_id=? AND method=? AND route=? AND key=?'
        )
        .get(actor.integrationId, req.method, route, key)
      if (old && old.created_at > Date.now() - 86400000) {
        if (old.fingerprint !== fingerprint)
          fail(409, 'IDEMPOTENCY_CONFLICT', '幂等键内容不同')
        return {
          status: old.status,
          body: JSON.parse(old.body),
          etag: old.etag,
          replayed: true
        }
      }
      if (old)
        db.prepare(
          'DELETE FROM publishing_idempotency WHERE integration_id=? AND method=? AND route=? AND key=?'
        ).run(actor.integrationId, req.method, route, key)
      const result = perform(),
        body = { data: result.data, request_id: req.requestId },
        tag = result.etag ?? null
      audit(
        actor,
        req.method + ' ' + req.route.path + (result.noOp ? ':no-op' : ''),
        result.status,
        req.requestId,
        result.data?.id ?? null,
        result.data?.revision ?? null,
        req.ip
      )
      db.prepare(
        'INSERT INTO publishing_idempotency VALUES(?,?,?,?,?,?,?,?,?)'
      ).run(
        actor.integrationId,
        req.method,
        route,
        key,
        fingerprint,
        result.status,
        JSON.stringify(body),
        tag,
        Date.now()
      )
      return { status: result.status, body, etag: tag }
    })
    .immediate()
}
/** 校验条件请求头并返回匹配的修订号。 */
export function condition(req, current) {
  const match = req.get('If-Match'),
    none = req.get('If-None-Match')
  if (
    (match && none) ||
    (none && none !== '*') ||
    (match && !/^"article-[A-Za-z0-9-]+-r[1-9]\d*"$/.test(match))
  )
    fail(400, 'INVALID_PRECONDITION', '条件头格式无效')
  if (!match && !none) fail(428, 'PRECONDITION_REQUIRED', '需要版本条件')
  if (!current) {
    if (!none) fail(412, 'REVISION_CONFLICT', '文章版本已变化')
    return null
  }
  if (none || match !== etag(current))
    fail(412, 'REVISION_CONFLICT', '文章版本已变化')
  return current.revision
}
/** 执行带来源映射和幂等保护的文章变更。 */
export function mutateArticle(req, operation) {
  const actor = req.actor
  const scope = ['publish', 'unpublish'].includes(operation)
    ? 'articles:publish'
    : 'articles:write'
  // Acquire the writer lock before resolving source identity, and retain it through replay/commit.
  return db
    .transaction(/* 持有写锁解析来源并执行幂等写入。 */ () => {
      verifyActor(actor, scope)
      const mapping =
        operation === 'put' ? source(actor, req.params.externalId) : null
      const id =
        mapping?.article_id || (operation === 'put' ? null : req.params.id)
      if (mapping?.tombstone) fail(410, 'ARTICLE_GONE', '来源文章已删除')
      return writeOnce(req, scope, id, /* 按操作保存草稿或发布并组装响应。 */ () => {
        // Read access is a separate scope; obtain DTO using a policy-validated write actor.
        const current = id
          ? getWorkingCopy(id, { ...actor, publishingAction: operation })
          : null
        const revision = condition(req, current)
        let value
        if (operation === 'put' || operation === 'patch') {
          const externalId =
            mapping?.external_id ||
            (id
              ? db
                  .prepare(
                    'SELECT external_id FROM article_sources WHERE article_id=?'
                  )
                  .get(id)?.external_id
              : req.params.externalId)
          const p = normalize(
            req.body,
            operation === 'put',
            externalId,
            actor,
            current
          )
          value = id ? saveDraft(id, p, revision, actor) : createDraft(p, actor)
          if (!id)
            db.prepare(
              'INSERT INTO article_sources(integration_id,external_id,article_id) VALUES(?,?,?)'
            ).run(actor.integrationId, externalId, value.id)
        } else
          value = (operation === 'publish' ? publish : unpublish)(
            id,
            revision,
            actor
          )
        const s = db
          .prepare('SELECT * FROM article_sources WHERE article_id=?')
          .get(value.id)
        const data = dtoFor(value, s)
        return {
          status: id ? 200 : 201,
          data,
          etag: etag(data),
          noOp: current && current.revision === data.revision
        }
      })
    })
    .immediate()
}
