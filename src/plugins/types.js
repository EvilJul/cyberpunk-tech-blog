/**
 * 插件基类
 * 所有插件都应该继承这个类
 */
export class Plugin {
  constructor(config = {}) {
    this.name = config.name || 'unnamed-plugin'
    this.version = config.version || '1.0.0'
    this.author = config.author || 'Unknown'
    this.description = config.description || ''
    this.config = config.config || {}
  }

  /**
   * 插件安装时调用
   * @param {PluginManager} pluginManager - 插件管理器实例
   */
  async onInstall(pluginManager) {
    // 子类可以重写此方法
  }

  /**
   * 插件卸载时调用
   */
  async onUninstall() {
    // 子类可以重写此方法
  }

  /**
   * 获取插件配置
   */
  getConfig() {
    return this.config
  }

  /**
   * 更新插件配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }
}

/**
 * Hook 点定义
 * 定义了系统中所有可用的扩展点
 */
export const HOOKS = {
  // ==================== 应用生命周期 ====================
  'app:init': {
    name: '应用初始化',
    description: '应用启动时触发，可以进行全局配置',
    params: { config: 'object' },
    returns: 'config'
  },

  'app:mounted': {
    name: '应用挂载完成',
    description: '应用挂载到 DOM 后触发',
    params: { app: 'object' },
    returns: 'void'
  },

  // ==================== 主题系统 ====================
  'theme:change': {
    name: '主题切换',
    description: '主题切换时触发',
    params: { oldTheme: 'string', newTheme: 'string' },
    returns: 'void'
  },

  'theme:applied': {
    name: '主题应用完成',
    description: '主题 CSS 变量应用完成后触发',
    params: { theme: 'object' },
    returns: 'void'
  },

  // ==================== 文章相关 ====================
  'article:render': {
    name: '文章渲染',
    description: '文章内容渲染前触发，可以转换内容格式',
    params: { content: 'string', article: 'object' },
    returns: 'string (processed content)'
  },

  'article:loaded': {
    name: '文章加载完成',
    description: '文章数据加载完成后触发',
    params: { article: 'object' },
    returns: 'article'
  },

  'article:before-display': {
    name: '文章显示前',
    description: '文章即将显示在页面上时触发',
    params: { article: 'object' },
    returns: 'article'
  },

  'article:actions': {
    name: '文章操作按钮',
    description: '获取文章操作按钮列表',
    params: { articleId: 'string', defaultActions: 'array' },
    returns: 'array (React components)'
  },

  // ==================== 评论系统 ====================
  'comment:before-submit': {
    name: '评论提交前',
    description: '评论提交前触发，可以验证或修改评论内容',
    params: { comment: 'object' },
    returns: 'comment'
  },

  'comment:submitted': {
    name: '评论已提交',
    description: '评论成功提交后触发',
    params: { comment: 'object' },
    returns: 'void'
  },

  'comment:render': {
    name: '评论渲染',
    description: '评论内容渲染前触发',
    params: { content: 'string', comment: 'object' },
    returns: 'string'
  },

  // ==================== UI 扩展 ====================
  'header:menu-items': {
    name: '导航菜单项',
    description: '获取导航菜单项列表',
    params: { defaultItems: 'array' },
    returns: 'array (menu items)'
  },

  'sidebar:widgets': {
    name: '侧边栏小部件',
    description: '获取侧边栏小部件列表',
    params: { position: 'string', defaultWidgets: 'array' },
    returns: 'array (React components)'
  },

  'footer:sections': {
    name: '页脚区块',
    description: '获取页脚区块列表',
    params: { defaultSections: 'array' },
    returns: 'array (React components)'
  },

  // ==================== 搜索功能 ====================
  'search:query': {
    name: '搜索查询',
    description: '搜索查询前触发，可以修改搜索参数',
    params: { query: 'string', filters: 'object' },
    returns: 'object { query, filters }'
  },

  'search:results': {
    name: '搜索结果',
    description: '搜索结果返回后触发，可以处理结果',
    params: { results: 'array', query: 'string' },
    returns: 'array (processed results)'
  },

  // ==================== 路由导航 ====================
  'route:before-navigate': {
    name: '路由跳转前',
    description: '路由跳转前触发',
    params: { to: 'string', from: 'string' },
    returns: 'void'
  },

  'route:after-navigate': {
    name: '路由跳转后',
    description: '路由跳转完成后触发',
    params: { to: 'string', from: 'string' },
    returns: 'void'
  },

  // ==================== 数据加载 ====================
  'data:fetch-before': {
    name: '数据获取前',
    description: 'API 请求发送前触发',
    params: { url: 'string', options: 'object' },
    returns: 'object { url, options }'
  },

  'data:fetch-after': {
    name: '数据获取后',
    description: 'API 响应返回后触发',
    params: { data: 'any', url: 'string' },
    returns: 'data'
  },

  'data:fetch-error': {
    name: '数据获取失败',
    description: 'API 请求失败时触发',
    params: { error: 'Error', url: 'string' },
    returns: 'void'
  },

  // ==================== 用户交互 ====================
  'user:login': {
    name: '用户登录',
    description: '用户登录成功后触发',
    params: { user: 'object' },
    returns: 'void'
  },

  'user:logout': {
    name: '用户登出',
    description: '用户登出时触发',
    params: { user: 'object' },
    returns: 'void'
  },

  // ==================== 设置页面 ====================
  'settings:panels': {
    name: '设置面板',
    description: '获取设置页面的面板列表',
    params: { defaultPanels: 'array' },
    returns: 'array (React components)'
  },

  'settings:save': {
    name: '设置保存',
    description: '设置保存前触发',
    params: { settings: 'object' },
    returns: 'settings'
  }
}

/**
 * 获取 Hook 信息
 */
export function getHookInfo(hookName) {
  return HOOKS[hookName] || null
}

/**
 * 获取所有 Hook
 */
export function getAllHooks() {
  return Object.entries(HOOKS).map(([name, info]) => ({
    name,
    ...info
  }))
}
