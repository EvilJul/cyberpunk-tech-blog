/**
 * 主题与插件系统快速启动示例
 * 将此代码添加到 src/main.jsx 中以启用插件
 */

import { pluginManager } from './plugins/PluginManager'
// import CodeHighlightPlugin from '../plugins/code-highlight'

async function initializePlugins() {
  try {
    console.log('🔌 初始化插件系统...')

    // ==================== 示例1: 启用代码高亮插件 ====================
    // 取消下面的注释以启用代码高亮
    /*
    const CodeHighlightPlugin = (await import('../plugins/code-highlight')).default
    pluginManager.register(new CodeHighlightPlugin({
      theme: 'tomorrow',
      showLineNumbers: true,
      copyButton: true
    }))
    await pluginManager.enable('code-highlight')
    */

    // ==================== 示例2: 创建简单插件 ====================
    // 这是一个简单的文章标题转大写插件
    /*
    class TitleUppercasePlugin extends Plugin {
      constructor() {
        super({
          name: 'title-uppercase',
          version: '1.0.0',
          description: '将文章标题转为大写'
        })
      }

      async onInstall(pluginManager) {
        pluginManager.registerHook(
          'article:loaded',
          (article) => {
            article.title = article.title.toUpperCase()
            return article
          },
          this.name,
          10
        )
      }
    }

    pluginManager.register(new TitleUppercasePlugin())
    await pluginManager.enable('title-uppercase')
    */

    // ==================== 示例3: 监听用户行为 ====================
    // 统计文章浏览次数
    /*
    pluginManager.registerHook('article:loaded', (article) => {
      console.log('📊 文章浏览:', article.title)

      // 发送统计数据
      fetch('/api/stats/article/' + article.id + '/views', {
        method: 'POST'
      }).catch(() => {})

      return article
    }, 'analytics-plugin', 5)
    */

    // ==================== 示例4: 主题切换监听 ====================
    // 监听主题变化
    /*
    pluginManager.registerHook('theme:change', ({ oldTheme, newTheme }) => {
      console.log(`🎨 主题切换: ${oldTheme} → ${newTheme}`)

      // 可以在这里做一些清理工作
      // 比如重新初始化 WebGL 组件
    }, 'theme-listener', 10)
    */

    // 执行 app:init Hook
    await pluginManager.executeHook('app:init', {
      environment: import.meta.env.MODE,
      baseUrl: import.meta.env.BASE_URL
    })

    console.log('✅ 插件系统初始化完成')
    console.log('📦 已启用插件:', pluginManager.getEnabledPlugins().map(p => p.name))
  } catch (error) {
    console.error('❌ 插件系统初始化失败:', error)
  }
}

// 导出初始化函数
export { initializePlugins }

// ==================== 使用说明 ====================
/*

1. 在 src/main.jsx 中导入并调用:

   import { initializePlugins } from './plugins-init-example'

   initializePlugins()

2. 主题切换:
   - 用户点击右上角的主题切换器
   - 或在代码中: switchTheme('minimal')

3. 可用主题:
   - cyberpunk (暗金赛博朋克)
   - minimal (极简白)
   - dark (暗色)

4. 可用 Hook 点:
   - article:render - 文章内容渲染
   - article:loaded - 文章加载完成
   - comment:before-submit - 评论提交前
   - theme:change - 主题切换
   - 更多见 src/plugins/types.js

5. 调试:
   console.log(pluginManager.getAllPlugins())
   console.log(pluginManager.getEnabledPlugins())

*/
