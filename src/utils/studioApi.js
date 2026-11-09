import { apiUrl } from './api'
let csrfToken = null
/** 仅在内存中更新 CSRF 令牌。 */
export function setCsrfToken(token) {
  csrfToken = token || null
}
/** 验证文章版本并生成强条件请求标签。 */
export function revisionTag(revision) {
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1)
    throw Error('文章版本无效，请重新读取')
  return `"${Number(revision)}"`
}
/** 校验回跳路径并拒绝跨站或编码逃逸。 */
export function safeReturnTo(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return '/studio'
  try {
    const decoded = decodeURIComponent(value)
    if (
      /[\\\u0000-\u0020]/.test(decoded) ||
      decoded.startsWith('//') ||
      decoded.includes('..') ||
      /%[0-9a-f]{2}/i.test(decoded)
    )
      return '/studio'
    const url = new URL(value, 'https://local.invalid')
    return url.origin === 'https://local.invalid'
      ? url.pathname + url.search + url.hash
      : '/studio'
  } catch {
    return '/studio'
  }
}
/** 发送同源会话请求并处理 CSRF、版本及错误信息。 */
export async function studioApi(path, options = {}) {
  const { revision, ...rest } = options
  const headers = new Headers(rest.headers)
  const method = (rest.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD'].includes(method) && csrfToken)
    headers.set('X-CSRF-Token', csrfToken)
  if (revision !== undefined) headers.set('If-Match', revisionTag(revision))
  let body = rest.body
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }
  const response = await fetch(apiUrl(path), {
    ...rest,
    method,
    body,
    headers,
    credentials: 'same-origin',
    cache: 'no-store'
  })
  const data =
    response.status === 204 ? null : await response.json().catch(/* 响应无法解析为 JSON 时返回空数据。 */ () => null)
  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
        (response.status === 401
          ? '登录已失效，请重新登录；正文仍保留在本机'
          : `请求失败（${response.status}）`)
    )
    Object.assign(error, {
      status: response.status,
      code: data?.error?.code,
      details: data?.error?.details,
      requestId: data?.request_id
    })
    throw error
  }
  return data
}
/** 下载本机恢复内容并延迟释放临时地址。 */
export function exportRecovery(value, name = '文章恢复.json') {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(/* 释放下载使用的临时对象地址。 */ () => URL.revokeObjectURL(url), 1000)
}
export const studioFetch = studioApi
