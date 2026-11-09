import multer from 'multer'
import logger from '../utils/logger.js'

/**
 * 全局错误处理中间件
 */
export function errorHandler(err, req, res, next) {
  // v1 前置中间件同样遵守机器协议，不返回开发堆栈或原始错误内容。
  if (req.path === '/api/v1' || req.path.startsWith('/api/v1/')) {
    const status = err.statusCode || err.status || 500
    logger.warn('发布请求被前置中间件拒绝', { status, request_id: req.id })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(status).json({
      error: {
        code: status === 403 ? 'ORIGIN_REJECTED' : 'REQUEST_REJECTED',
        message: status === 403 ? '请求来源不受信任' : '发布请求处理失败',
        details: null
      },
      request_id: req.id
    })
  }
  // 处理 Multer 错误
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: '一次只能上传 1 个文件' })
    }
    return res.status(400).json({ error: `上传错误: ${err.message}` })
  }

  // 处理文件类型错误
  if (err.message && err.message.includes('不支持的文件类型')) {
    return res.status(400).json({ error: err.message })
  }

  // 记录错误日志
  logger.error('请求错误', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.path,
    bodyKeys:
      req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
    user: req.user?.username || 'anonymous',
    ip: req.ip
  })

  // 设置状态码
  const statusCode = err.statusCode || err.status || 500

  // 构造错误响应
  const errorResponse = {
    request_id: req.id,
    error: {
      message: statusCode >= 500 ? '服务器内部错误' : err.message || '请求失败',
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
    url: req.path,
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
