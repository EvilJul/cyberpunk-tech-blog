import { apiFetch } from './api'
const recent = new Map()
let pending = null,
  timer = null,
  sent = 0,
  windowStart = Date.now()
export function reportError(message, data = null, level = 'ERROR') {
  const now = Date.now()
  if (now - windowStart > 60000) {
    sent = 0
    windowStart = now
    recent.clear()
  }
  const text = String(message).slice(0, 500)
  if (sent >= 5 || recent.has(text)) return
  recent.set(text, now)
  pending = {
    level,
    message: text,
    data: data
      ? { message: String(data.message || data.error || '').slice(0, 1000) }
      : undefined
  }
  clearTimeout(timer)
  timer = setTimeout(() => {
    const payload = pending
    pending = null
    sent++
    // Neither response failures nor transport failures are fed back to telemetry.
    apiFetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {})
  }, 1000)
}
const debug = (level, message, data) => {
  if (import.meta.env.DEV) console[level](message, data || '')
}
export const logger = {
  info: (message, data) => debug('info', message, data),
  debug: (message, data) => debug('debug', message, data),
  warn: (message, data) => {
    debug('warn', message, data)
    reportError(message, data, 'WARN')
  },
  error: (message, data) => {
    debug('error', message, data)
    reportError(message, data)
  }
}
