/**
 * 插件配置文件
 * 在这里配置要启用的插件和它们的配置
 */

// 导入插件
// import CodeHighlightPlugin from '../plugins/code-highlight'

/**
 * 插件配置列表
 */
export const pluginConfig = {
  // 默认启用的插件
  enabled: [
    // 'code-highlight',  // 取消注释以启用代码高亮插件
  ],

  // 插件配置
  config: {
    'code-highlight': {
      theme: 'tomorrow',
      showLineNumbers: true,
      copyButton: true
    }
  }
}

/**
 * 初始化所有配置的插件
 * @param {PluginManager} pluginManager - 插件管理器实例
 */
export async function initConfiguredPlugins(pluginManager) {
  const { enabled, config } = pluginConfig

  // 注册并启用插件
  for (const pluginName of enabled) {
    try {
      // 根据插件名称动态导入
      const pluginConfig = config[pluginName] || {}

      // 这里需要手动导入插件
      // 示例：
      // if (pluginName === 'code-highlight') {
      //   const CodeHighlightPlugin = (await import('../plugins/code-highlight')).default
      //   pluginManager.register(new CodeHighlightPlugin(pluginConfig))
      //   await pluginManager.enable(pluginName)
      // }

      console.log(`✅ 插件 "${pluginName}" 已配置`)
    } catch (error) {
      console.error(`❌ 加载插件 "${pluginName}" 失败:`, error)
    }
  }
}
