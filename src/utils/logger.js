const LOG_API = '/api/logs'

export async function log(level, message, data = null) {
  const token = localStorage.getItem('token')
  if (!token) return
  try {
    await fetch(LOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ level, message, data })
    })
  } catch (err) {
    // 静默失败
  }
}

export const logger = {
  info: (message, data) => log('INFO', message, data),
  warn: (message, data) => log('WARN', message, data),
  error: (message, data) => log('ERROR', message, data),
  debug: (message, data) => log('DEBUG', message, data),
}