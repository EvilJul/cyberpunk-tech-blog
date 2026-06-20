/**
 * 插件管理器 - 核心类
 * 负责插件的注册、生命周期管理和 Hook 系统
 */
class PluginManager {
  constructor() {
    this.plugins = new Map()
    this.hooks = new Map()
    this.enabled = new Set()
  }

  /**
   * 注册插件
   * @param {Plugin} plugin - 插件实例
   */
  register(plugin) {
    if (!plugin.name) {
      throw new Error('Plugin must have a name')
    }

    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered`)
      return
    }

    this.plugins.set(plugin.name, plugin)
    console.log(`✅ Plugin registered: ${plugin.name} v${plugin.version || '1.0.0'}`)
  }

  /**
   * 启用插件
   * @param {string} pluginName - 插件名称
   */
  async enable(pluginName) {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`)
    }

    if (this.enabled.has(pluginName)) {
      console.warn(`Plugin "${pluginName}" is already enabled`)
      return
    }

    try {
      // 调用插件的 onInstall 生命周期
      if (typeof plugin.onInstall === 'function') {
        await plugin.onInstall(this)
      }

      this.enabled.add(pluginName)
      console.log(`✅ Plugin enabled: ${pluginName}`)
    } catch (error) {
      console.error(`❌ Failed to enable plugin "${pluginName}":`, error)
      throw error
    }
  }

  /**
   * 禁用插件
   * @param {string} pluginName - 插件名称
   */
  async disable(pluginName) {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`)
    }

    if (!this.enabled.has(pluginName)) {
      return
    }

    try {
      // 调用插件的 onUninstall 生命周期
      if (typeof plugin.onUninstall === 'function') {
        await plugin.onUninstall()
      }

      this.enabled.delete(pluginName)

      // 清理该插件注册的所有 Hook
      this.hooks.forEach((callbacks, hookName) => {
        this.hooks.set(
          hookName,
          callbacks.filter(cb => cb.pluginName !== pluginName)
        )
      })

      console.log(`✅ Plugin disabled: ${pluginName}`)
    } catch (error) {
      console.error(`❌ Failed to disable plugin "${pluginName}":`, error)
      throw error
    }
  }

  /**
   * 注册 Hook
   * @param {string} hookName - Hook 名称
   * @param {Function} callback - 回调函数
   * @param {string} pluginName - 插件名称（用于追踪）
   * @param {number} priority - 优先级（数字越小越先执行）
   */
  registerHook(hookName, callback, pluginName = 'unknown', priority = 10) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }

    const callbacks = this.hooks.get(hookName)
    callbacks.push({
      callback,
      pluginName,
      priority
    })

    // 按优先级排序
    callbacks.sort((a, b) => a.priority - b.priority)

    console.log(`🔗 Hook registered: ${hookName} (from ${pluginName}, priority ${priority})`)
  }

  /**
   * 执行 Hook（串行）
   * @param {string} hookName - Hook 名称
   * @param {any} context - 上下文数据
   * @returns {Promise<any>} - 处理后的数据
   */
  async executeHook(hookName, context) {
    const callbacks = this.hooks.get(hookName) || []

    if (callbacks.length === 0) {
      return context
    }

    let result = context

    for (const { callback, pluginName } of callbacks) {
      try {
        result = await callback(result)
      } catch (error) {
        console.error(`❌ Hook "${hookName}" error in plugin "${pluginName}":`, error)
        // 继续执行其他插件，不中断链条
      }
    }

    return result
  }

  /**
   * 执行 Hook（并行）
   * @param {string} hookName - Hook 名称
   * @param {any} context - 上下文数据
   * @returns {Promise<any[]>} - 所有插件的返回值数组
   */
  async executeHookParallel(hookName, context) {
    const callbacks = this.hooks.get(hookName) || []

    if (callbacks.length === 0) {
      return []
    }

    const promises = callbacks.map(({ callback, pluginName }) =>
      callback(context).catch(error => {
        console.error(`❌ Hook "${hookName}" error in plugin "${pluginName}":`, error)
        return null
      })
    )

    return Promise.all(promises)
  }

  /**
   * 触发事件（Fire and forget）
   * @param {string} eventName - 事件名称
   * @param {any} data - 事件数据
   */
  emit(eventName, data) {
    const callbacks = this.hooks.get(eventName) || []

    callbacks.forEach(({ callback, pluginName }) => {
      try {
        callback(data)
      } catch (error) {
        console.error(`❌ Event "${eventName}" error in plugin "${pluginName}":`, error)
      }
    })
  }

  /**
   * 获取已启用的插件列表
   */
  getEnabledPlugins() {
    return Array.from(this.enabled).map(name => this.plugins.get(name))
  }

  /**
   * 获取所有已注册的插件
   */
  getAllPlugins() {
    return Array.from(this.plugins.values())
  }

  /**
   * 检查插件是否已启用
   */
  isEnabled(pluginName) {
    return this.enabled.has(pluginName)
  }
}

// 导出单例
export const pluginManager = new PluginManager()

// 导出类
export default PluginManager
