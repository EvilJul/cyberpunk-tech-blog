import logger from '../utils/logger.js'

/**
 * 全局错误处理中间件
 */
export function errorHandler(err, req, res, next) {
  // 记录错误日志
  logger.error('请求错误', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    user: req.user?.username || 'anonymous',
    ip: req.ip
  })

  // 设置状态码
  const statusCode = err.statusCode || err.status || 500

  // 构造错误响应
  const errorResponse = {
    error: {
      message: err.message || '服务器内部错误',
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  }

  // 开发环境返回堆栈信息
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = err.stack
  }

  // 添加错误详情（如验证错误）
  if (err.details) {
    errorResponse.error.details = err.details
  }

  res.status(statusCode).json(errorResponse)
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req, res) {
  logger.warn('404 Not Found', {
    method: req.method,
    url: req.url,
    ip: req.ip
  })

  res.status(404).json({
    error: {
      message: '请求的资源不存在',
      code: 'NOT_FOUND',
      path: req.url
    }
  })
}

/**
 * 异步路由错误捕获包装器
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
