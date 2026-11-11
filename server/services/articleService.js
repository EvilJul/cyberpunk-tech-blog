import { randomUUID } from 'node:crypto'
import db from '../db/index.js'
import { ArticleDAO } from '../db/articleDAO.js'

/** 构造带状态码和详情的文章错误。 */
export function articleError(status, code, message, details) {
  return Object.assign(new Error(message), {
    status,
    statusCode: status,
    code,
    details
  })
}
/** 生成字段顺序稳定的比较文本。 */
const stable = (value) =>
  JSON.stringify(value, /* 按键排序对象字段以稳定序列化结果。 */ (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(/* 按字段名排序键值对。 */ ([a], [b]) => a.localeCompare(b))
        )
      : item
  )
let integrationPolicy = null
/** 注册集成文章访问策略。 */
export function registerIntegrationPolicy(policy) {
  integrationPolicy = policy
}
/** 校验文章操作主体及权限。 */
function authorize(actor, id, action) {
  if (actor?.kind === 'integration') {
    if (!integrationPolicy || integrationPolicy(actor, id, action) === false)
      throw articleError(403, 'FORBIDDEN', '集成无此操作权限')
    return
  }
  if (actor?.role !== 'admin')
    throw articleError(actor ? 403 : 401, 'FORBIDDEN', '需要管理员权限')
}
/** 解析强条件头或整数修订号。 */
export function parseRevision(value) {
  if (Number.isSafeInteger(value) && value >= 1) return value
  if (typeof value === 'string') {
    const match = value.match(/^"(?:article-.+-r)?([1-9]\d*)"$/)
    if (match && Number.isSafeInteger(Number(match[1]))) return Number(match[1])
  }
  if (value === undefined || value === null || value === '')
    throw articleError(428, 'PRECONDITION_REQUIRED', '请提供文章版本 If-Match')
  throw articleError(400, 'INVALID_PRECONDITION', '文章版本格式无效')
}
/** 校验文章修订号并报告冲突。 */
function checkVersion(article, expected) {
  if (parseRevision(expected) !== article.revision)
    throw articleError(
      412,
      'REVISION_CONFLICT',
      '文章已被修改，请保留输入并重新读取',
      { revision: article.revision }
    )
}
/** 提取文章公开快照字段。 */
function snapshot(article) {
  return {
    title: article.title,
    slug: article.slug,
    content: article.content || '',
    excerpt: article.excerpt || '',
    author: article.author || '博主',
    category: article.category || null,
    category_id: article.category_id ?? null,
    tags: article.tags || [],
    cover_media_id: article.cover_media_id || null,
    canonical_source: article.canonical_source
      ? JSON.parse(article.canonical_source)
      : null
  }
}
/** 按编号读取文章并处理不存在情况。 */
function row(id) {
  const article = ArticleDAO.findById(id)
  if (!article) throw articleError(404, 'NOT_FOUND', '文章未找到')
  return article
}
/** 优先读取草稿作为当前工作内容。 */
function currentPayload(article) {
  const draft = db
    .prepare('SELECT payload_json FROM article_drafts WHERE article_id=?')
    .get(article.id)
  return draft ? JSON.parse(draft.payload_json) : snapshot(article)
}
const allowedFields = new Set([
  'title',
  'slug',
  'content',
  'excerpt',
  'author',
  'category',
  'category_id',
  'categoryId',
  'tags',
  'cover_media_id',
  'canonical_source'
])
/** 校验并规范化文章字段。 */
function normalize(payload, base = {}, creating = false) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw articleError(400, 'INVALID_FIELDS', '文章字段无效')
  for (const key of Object.keys(payload))
    if (!allowedFields.has(key))
      throw articleError(400, 'INVALID_FIELDS', `不支持的文章字段：${key}`)
  const data = {
    title: '',
    content: '',
    excerpt: '',
    author: '博主',
    category: null,
    category_id: null,
    tags: [],
    cover_media_id: null,
    canonical_source: null,
    ...base,
    ...payload
  }
  if (payload.categoryId !== undefined) data.category_id = payload.categoryId
  delete data.categoryId
  if (
    typeof data.title !== 'string' ||
    !data.title.trim() ||
    Array.from(data.title.trim()).length > 200
  )
    throw articleError(400, 'INVALID_TITLE', '标题需为1至200字')
  data.title = data.title.trim()
  if (
    typeof data.content !== 'string' ||
    Buffer.byteLength(data.content, 'utf8') > 1048576
  )
    throw articleError(413, 'INVALID_CONTENT', '正文需为文本且不超过1MiB')
  if (data.excerpt === null) data.excerpt = ''
  if (
    typeof data.excerpt !== 'string' ||
    Array.from(data.excerpt).length > 1000
  )
    throw articleError(400, 'INVALID_EXCERPT', '摘要不能超过1000字')
  if (
    typeof data.author !== 'string' ||
    !data.author.trim() ||
    data.author.length > 100
  )
    throw articleError(400, 'INVALID_AUTHOR', '作者字段无效')
  if (
    !Array.isArray(data.tags) ||
    data.tags.length > 20 ||
    data.tags.some(
      /* 检查标签类型、内容及长度。 */ (tag) =>
        typeof tag !== 'string' ||
        !tag.trim() ||
        Array.from(tag.trim()).length > 50
    )
  )
    throw articleError(400, 'INVALID_TAGS', '标签最多20个，每个1至50字')
  data.tags = [...new Set(data.tags.map(/* 去除标签两侧空白。 */ (tag) => tag.trim()))]
  if (data.category === '') data.category = null
  if (
    data.category !== null &&
    (typeof data.category !== 'string' ||
      !data.category.trim() ||
      data.category.length > 100)
  )
    throw articleError(400, 'INVALID_CATEGORY', '分类字段无效')
  if (
    payload.category !== undefined &&
    payload.category !== base.category &&
    payload.category_id === undefined
  )
    data.category_id = null
  if (data.category_id !== null) {
    if (
      !Number.isSafeInteger(Number(data.category_id)) ||
      Number(data.category_id) < 1
    )
      throw articleError(400, 'INVALID_CATEGORY', '分类编号无效')
    const category = db
      .prepare('SELECT id,name FROM categories WHERE id=?')
      .get(Number(data.category_id))
    if (!category)
      throw articleError(409, 'CATEGORY_CHANGED', '分类已删除，请重新选择')
    if (
      payload.category !== undefined &&
      payload.category !== null &&
      payload.category !== category.name
    )
      throw articleError(409, 'CATEGORY_CHANGED', '分类已改名，请重新选择')
    if (
      payload.category === undefined ||
      payload.category_id !== undefined ||
      payload.categoryId !== undefined
    )
      data.category = category.name
    data.category_id = category.id
  }
  if (data.canonical_source !== null) {
    const source =
      typeof data.canonical_source === 'string'
        ? { url: data.canonical_source }
        : data.canonical_source
    let url
    try {
      url = new URL(source.url)
    } catch {
      throw articleError(400, 'INVALID_SOURCE', '来源地址无效')
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      source.url.length > 2048
    )
      throw articleError(400, 'INVALID_SOURCE', '来源地址无效')
    data.canonical_source = source
  }
  if (data.cover_media_id !== null && typeof data.cover_media_id !== 'string')
    throw articleError(400, 'INVALID_MEDIA', '封面编号无效')
  if (data.cover_media_id !== null && !db.prepare('SELECT 1 FROM integration_media WHERE id=?').get(data.cover_media_id))
    throw articleError(400, 'INVALID_MEDIA', '封面不存在')
  if (data.slug === undefined || data.slug === null || data.slug === '') {
    if (!creating && base.slug) data.slug = base.slug
    else
      data.slug =
        data.title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 140) || `article-${randomUUID()}`
  }
  if (
    typeof data.slug !== 'string' ||
    Array.from(data.slug).length > 160 ||
    !/^[\p{L}\p{N}._~-]+$/u.test(data.slug) ||
    data.slug === '.' ||
    data.slug === '..'
  )
    throw articleError(
      400,
      'INVALID_SLUG',
      '文章地址需为1至160个文字、数字或连接符'
    )
  return data
}
/** 检查冲突并预留文章地址。 */
function reserveSlug(id, slug, generate = false) {
  /** 查询其他文章及预留地址的占用情况。 */
  const conflict = (candidate) =>
    db
      .prepare('SELECT id FROM articles WHERE slug=? AND id!=?')
      .get(candidate, id) ||
    db
      .prepare(
        'SELECT article_id FROM article_slug_reservations WHERE slug=? AND article_id!=?'
      )
      .get(candidate, id)
  let candidate = slug
  if (generate && conflict(candidate))
    candidate = `${slug.slice(0, 140)}-${randomUUID().slice(0, 8)}`
  if (conflict(candidate))
    throw articleError(409, 'SLUG_CONFLICT', '文章地址已被占用')
  db.prepare('DELETE FROM article_slug_reservations WHERE article_id=?').run(id)
  db.prepare(
    'INSERT INTO article_slug_reservations(slug,article_id) VALUES(?,?)'
  ).run(candidate, id)
  return candidate
}
/** 持久化草稿并更新修订号。 */
function persistDraft(article, payload, revision) {
  db.prepare(
    `INSERT INTO article_drafts(article_id,payload_json,updated_at,base_published_revision) VALUES(?,?,?,?)
    ON CONFLICT(article_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at,base_published_revision=excluded.base_published_revision`
  ).run(
    article.id,
    JSON.stringify(payload),
    Math.max(
      Date.now(),
      (db
        .prepare('SELECT updated_at FROM article_drafts WHERE article_id=?')
        .get(article.id)?.updated_at ||
        article.updated_at ||
        0) + 1
    ),
    article.published_revision
  )
  db.prepare('UPDATE articles SET revision=? WHERE id=?').run(
    revision,
    article.id
  )
}
/** 组装包含草稿状态的文章响应。 */
function dto(id) {
  const article = row(id)
  const payload = currentPayload(article)
  const draftTime = db
    .prepare('SELECT updated_at FROM article_drafts WHERE article_id=?')
    .get(id)?.updated_at
  return {
    ...article,
    ...payload,
    pinned: !!article.pinned,
    cover_image: payload.cover_media_id
      ? db.prepare('SELECT url FROM integration_media WHERE id=?').get(payload.cover_media_id)?.url ?? null
      : null,
    updated_at: draftTime ?? article.updated_at,
    id: article.id,
    status: article.status,
    revision: article.revision,
    published_revision: article.published_revision,
    has_draft: !!db
      .prepare('SELECT 1 FROM article_drafts WHERE article_id=?')
      .get(id),
    public_slug: article.status === 'published' ? article.slug : null
  }
}
/** 鉴权后读取文章工作副本。 */
export function getWorkingCopy(id, actor) {
  authorize(actor, id, 'read')
  return dto(id)
}
/** 在事务中创建文章草稿。 */
export function createDraft(payload, actor) {
  return db
    .transaction(/* 原子创建文章记录、地址预留和草稿。 */ () => {
      authorize(actor, null, 'write')
      const data = normalize(payload, {}, true)
      const id = randomUUID(),
        now = Date.now()
      data.slug = reserveSlugCandidate(id, data.slug, !payload.slug)
      db.prepare(
        `INSERT INTO articles(id,title,slug,content,excerpt,author,status,created_at,updated_at,revision) VALUES(?,?,?,'','',?,'draft',?,?,1)`
      ).run(id, data.title, data.slug, data.author, now, now)
      data.slug = reserveSlug(id, data.slug)
      persistDraft({ id, published_revision: null }, data, 1)
      return dto(id)
    })
    .immediate()
}
/** 选择未占用的候选文章地址。 */
function reserveSlugCandidate(id, slug, generate) {
  let candidate = slug
  /** 查询候选地址是否已被占用。 */
  const occupied = (value) =>
    db.prepare('SELECT id FROM articles WHERE slug=?').get(value) ||
    db
      .prepare('SELECT article_id FROM article_slug_reservations WHERE slug=?')
      .get(value)
  if (occupied(candidate) && generate)
    candidate = `${slug.slice(0, 140)}-${randomUUID().slice(0, 8)}`
  if (occupied(candidate))
    throw articleError(409, 'SLUG_CONFLICT', '文章地址已被占用')
  return candidate
}
/** 校验版本并保存文章草稿。 */
export function saveDraft(id, payload, expectedRevision, actor) {
  return db
    .transaction(/* 原子校验权限、预留地址并保存草稿。 */ () => {
      authorize(actor, id, 'write')
      const article = row(id)
      checkVersion(article, expectedRevision)
      const data = normalize(payload, currentPayload(article))
      data.slug = reserveSlug(id, data.slug)
      persistDraft(article, data, article.revision + 1)
      return dto(id)
    })
    .immediate()
}
/** 仅管理员可更新独立置顶状态，不提升草稿或修改公开内容。 */
export function setPinned(id, payload, expectedRevision, actor) {
  return db.transaction(/* 原子校验权限、版本及发布状态并递增共享版本。 */ () => {
    if (actor?.kind === 'integration')
      throw articleError(403, 'FORBIDDEN', '仅管理员可管理置顶')
    authorize(actor, id, 'pin')
    const article = row(id)
    checkVersion(article, expectedRevision)
    if (!payload || typeof payload.pinned !== 'boolean' || Object.keys(payload).length !== 1)
      throw articleError(400, 'INVALID_FIELDS', '请仅提供布尔值 pinned')
    if (payload.pinned && article.status !== 'published')
      throw articleError(409, 'NOT_PUBLISHED', '仅已发布文章可置顶')
    db.prepare('UPDATE articles SET pinned=?,revision=revision+1 WHERE id=?')
      .run(Number(payload.pinned), id)
    return dto(id)
  }).immediate()
}
/** 校验版本并将工作副本发布为公开内容。 */
export function publish(id, expectedRevision, actor) {
  return db
    .transaction(/* 原子更新公开快照及关联分类标签。 */ () => {
      authorize(actor, id, 'publish')
      const article = row(id)
      checkVersion(article, expectedRevision)
      const data = normalize(currentPayload(article))
      data.slug = reserveSlug(id, data.slug)
      if (
        article.status === 'published' &&
        stable(snapshot(article)) === stable(data)
      ) {
        db.prepare('DELETE FROM article_drafts WHERE article_id=?').run(id)
        db.prepare(
          'DELETE FROM article_slug_reservations WHERE article_id=?'
        ).run(id)
        return dto(id)
      }
      let categoryId = data.category_id
      if (categoryId) {
        const category = db
          .prepare('SELECT name FROM categories WHERE id=?')
          .get(categoryId)
        if (!category || category.name !== data.category)
          throw articleError(
            409,
            'CATEGORY_CHANGED',
            '分类发生变化，请重新选择'
          )
      } else if (data.category) {
        let category = db
          .prepare('SELECT id FROM categories WHERE name=?')
          .get(data.category)
        if (!category)
          category = {
            id: db
              .prepare(
                'INSERT INTO categories(name,slug,created_at) VALUES(?,?,?)'
              )
              .run(
                data.category,
                data.category.toLowerCase().replace(/\s+/g, '-'),
                Date.now()
              ).lastInsertRowid
          }
        categoryId = Number(category.id)
      }
      const revision = article.revision + 1
      const publishedAt = Math.max(
        Date.now(),
        (db
          .prepare('SELECT updated_at FROM article_drafts WHERE article_id=?')
          .get(id)?.updated_at ||
          article.updated_at ||
          0) + 1
      )
      const date = new Date(publishedAt).toISOString()
      db.prepare(
        `UPDATE articles SET title=?,slug=?,content=?,excerpt=?,author=?,category_id=?,status='published',publish_date=COALESCE(publish_date,?),update_date=?,updated_at=?,revision=?,published_revision=?,cover_media_id=?,canonical_source=? WHERE id=?`
      ).run(
        data.title,
        data.slug,
        data.content,
        data.excerpt,
        data.author,
        categoryId,
        date,
        date,
        publishedAt,
        revision,
        revision,
        data.cover_media_id,
        data.canonical_source ? JSON.stringify(data.canonical_source) : null,
        id
      )
      db.prepare('DELETE FROM article_tags WHERE article_id=?').run(id)
      ArticleDAO.addTags(id, data.tags)
      db.prepare('DELETE FROM article_drafts WHERE article_id=?').run(id)
      db.prepare(
        'DELETE FROM article_slug_reservations WHERE article_id=?'
      ).run(id)
      return dto(id)
    })
    .immediate()
}
/** 撤回公开文章并保留工作副本。 */
export function unpublish(id, expectedRevision, actor) {
  return db
    .transaction(/* 原子保存撤回草稿并更新文章状态。 */ () => {
      authorize(actor, id, 'publish')
      const article = row(id)
      checkVersion(article, expectedRevision)
      if (article.status !== 'published') return dto(id)
      const payload = currentPayload(article)
      persistDraft(article, payload, article.revision + 1)
      db.prepare("UPDATE articles SET status='draft' WHERE id=?").run(id)
      return dto(id)
    })
    .immediate()
}
/** 校验权限和版本后删除文章。 */
export function deleteArticle(id, expectedRevision, actor) {
  return db
    .transaction(/* 原子校验并删除文章记录。 */ () => {
      authorize(actor, id, 'delete')
      const article = row(id)
      checkVersion(article, expectedRevision)
      db.prepare('DELETE FROM articles WHERE id=?').run(id)
      return { success: true }
    })
    .immediate()
}
/** 分页筛选管理员可见的工作副本。 */
export function listWorkingCopies(
  { page = 1, perPage = 20, search = '', status } = {},
  actor
) {
  if (actor?.kind === 'integration')
    throw articleError(403, 'FORBIDDEN', '集成需使用受限来源列表')
  authorize(actor, null, 'read')
  const params = [],
    conditions = []
  if (status) {
    conditions.push('a.status=?')
    params.push(status)
  }
  if (search) {
    conditions.push(
      "COALESCE(json_extract(d.payload_json,'$.title'),a.title) LIKE ?"
    )
    params.push(`%${search}%`)
  }
  page = Math.max(1, parseInt(page) || 1)
  perPage = Math.min(100, Math.max(1, parseInt(perPage) || 20))
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db
    .prepare(
      `SELECT COUNT(*) AS total FROM articles a LEFT JOIN article_drafts d ON d.article_id=a.id ${where}`
    )
    .get(...params).total
  const data = db
    .prepare(
      `SELECT a.id FROM articles a LEFT JOIN article_drafts d ON d.article_id=a.id ${where} ORDER BY a.created_at DESC,a.id LIMIT ? OFFSET ?`
    )
    .all(...params, perPage, (page - 1) * perPage)
    .map(/* 将查询编号转换为工作副本响应。 */ ({ id }) => dto(id))
  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
      has_next: page * perPage < total,
      has_prev: page > 1
    }
  }
}
export const articleService = {
  getWorkingCopy,
  setPinned,
  createDraft,
  saveDraft,
  publish,
  unpublish,
  deleteArticle,
  listWorkingCopies
}
export default articleService

// Compatibility adapter: one legacy operation is one shared revision transaction.
/** 兼容旧接口创建并合并修订增量。 */
export function legacyCreate(payload, status, actor) {
  return db
    .transaction(/* 原子执行旧接口创建及可选发布。 */ () => {
      let article = createDraft(payload, actor)
      if (status === 'published') {
        article = publish(article.id, article.revision, actor)
        db.prepare(
          'UPDATE articles SET revision=1,published_revision=1 WHERE id=?'
        ).run(article.id)
      }
      return dto(article.id)
    })
    .immediate()
}
/** 兼容旧接口更新并统一修订增量。 */
export function legacyUpdate(id, payload, status, condition, actor) {
  return db
    .transaction(/* 原子执行旧接口保存及状态切换。 */ () => {
      const before = row(id)
      if (condition) checkVersion(before, condition)
      const saved = saveDraft(id, payload, before.revision, actor)
      const target = status ?? before.status
      if (target === 'published') publish(id, saved.revision, actor)
      else if (before.status === 'published')
        unpublish(id, saved.revision, actor)
      const after = row(id)
      db.prepare(
        'UPDATE articles SET revision=?,published_revision=? WHERE id=?'
      ).run(
        before.revision + 1,
        target === 'published' ? before.revision + 1 : after.published_revision,
        id
      )
      return dto(id)
    })
    .immediate()
}
