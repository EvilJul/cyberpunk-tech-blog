import logger from './logger.js'

export function installLifecycle(server, database, { timeout = 10000 } = {}) {
  let shuttingDown = false
  let exitCode = 0
  const shutdown = (reason, code = 0) => {
    exitCode = Math.max(exitCode, code)
    if (shuttingDown) return
    shuttingDown = true
    logger.info('服务正在关闭', { reason })
    const timer = setTimeout(() => process.exit(1), timeout)
    timer.unref()
    server.close(() => {
      try {
        if (database.open) database.close()
      } catch (error) {
        logger.error('数据库关闭失败', { message: error.message })
        exitCode = 1
      }
      clearTimeout(timer)
      logger.end(() => process.exit(exitCode))
    })
    server.closeIdleConnections?.()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('uncaughtException', error => {
    logger.error('uncaughtException', { message: error.message, stack: error.stack })
    shutdown('uncaughtException', 1)
  })
  process.on('unhandledRejection', reason => {
    logger.error('unhandledRejection', { reason: String(reason) })
    shutdown('unhandledRejection', 1)
  })
  return shutdown
}
