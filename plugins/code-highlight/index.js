import { Plugin } from '../../src/plugins/types'
import Prism from 'prismjs'

// 按需导入语言支持
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-markdown'

// 导入主题样式（可选）
import 'prismjs/themes/prism-tomorrow.css'

/**
 * 代码高亮插件
 * 为文章中的代码块添加语法高亮
 */
export default class CodeHighlightPlugin extends Plugin {
  constructor(config = {}) {
    super({
      name: 'code-highlight',
      version: '1.0.0',
      author: 'Blog Team',
      description: '使用 Prism.js 为代码块添加语法高亮',
      config: {
        theme: 'tomorrow',
        showLineNumbers: true,
        copyButton: true,
        ...config
      }
    })
  }

  async onInstall(pluginManager) {
    console.log('🎨 代码高亮插件已安装')

    // 注册文章渲染 Hook
    pluginManager.registerHook(
      'article:render',
      this.highlightCode.bind(this),
      this.name,
      5 // 优先级：比其他内容处理插件先执行
    )

    // 注册评论渲染 Hook
    pluginManager.registerHook(
      'comment:render',
      this.highlightCode.bind(this),
      this.name,
      5
    )
  }

  async onUninstall() {
    console.log('🎨 代码高亮插件已卸载')
  }

  /**
   * 高亮代码块
   * @param {string} content - HTML 内容
   * @returns {string} - 处理后的 HTML
   */
  highlightCode(content) {
    if (!content || typeof content !== 'string') {
      return content
    }

    // 创建临时 DOM 元素
    const div = document.createElement('div')
    div.innerHTML = content

    // 查找所有代码块
    const codeBlocks = div.querySelectorAll('pre code')

    codeBlocks.forEach((block) => {
      // 自动检测语言
      const language = this.detectLanguage(block)

      if (language && Prism.languages[language]) {
        // 设置语言类
        block.className = `language-${language}`

        // 应用高亮
        try {
          Prism.highlightElement(block)
        } catch (error) {
          console.error('代码高亮失败:', error)
        }
      }

      // 添加行号（如果启用）
      if (this.config.showLineNumbers) {
        this.addLineNumbers(block)
      }

      // 添加复制按钮（如果启用）
      if (this.config.copyButton) {
        this.addCopyButton(block.parentElement)
      }
    })

    return div.innerHTML
  }

  /**
   * 自动检测代码语言
   * @param {HTMLElement} block - 代码块元素
   * @returns {string|null} - 语言标识
   */
  detectLanguage(block) {
    // 检查现有的 class
    const classes = block.className.match(/language-(\w+)/)
    if (classes && classes[1]) {
      return classes[1]
    }

    // 检查 data-language 属性
    const dataLang = block.getAttribute('data-language')
    if (dataLang) {
      return dataLang
    }

    // 简单的启发式检测
    const code = block.textContent

    if (/^\s*import\s+.*from/.test(code) || /^\s*export\s+(default|const|function)/.test(code)) {
      return 'javascript'
    }
    if (/^\s*def\s+\w+\(/.test(code) || /^\s*import\s+\w+/.test(code)) {
      return 'python'
    }
    if (/^\s*#!/bin\/(bash|sh)/.test(code) || /^\s*(cd|ls|grep|find|curl)/.test(code)) {
      return 'bash'
    }
    if (/^\s*(\{|\[)/.test(code) && /(\}|\])\s*$/.test(code)) {
      return 'json'
    }

    return null
  }

  /**
   * 添加行号
   * @param {HTMLElement} block - 代码块元素
   */
  addLineNumbers(block) {
    const pre = block.parentElement
    if (!pre || pre.tagName !== 'PRE') return

    const lines = block.textContent.split('\n')
    const lineCount = lines.length

    // 添加行号容器
    const lineNumbers = document.createElement('span')
    lineNumbers.className = 'line-numbers-rows'
    lineNumbers.setAttribute('aria-hidden', 'true')

    for (let i = 0; i < lineCount; i++) {
      lineNumbers.appendChild(document.createElement('span'))
    }

    pre.appendChild(lineNumbers)
    pre.classList.add('line-numbers')
  }

  /**
   * 添加复制按钮
   * @param {HTMLElement} pre - pre 元素
   */
  addCopyButton(pre) {
    if (!pre || pre.tagName !== 'PRE') return

    // 避免重复添加
    if (pre.querySelector('.copy-button')) return

    const button = document.createElement('button')
    button.className = 'copy-button'
    button.textContent = '复制'
    button.setAttribute('aria-label', '复制代码')

    button.addEventListener('click', () => {
      const code = pre.querySelector('code').textContent

      navigator.clipboard.writeText(code).then(() => {
        button.textContent = '已复制!'
        button.classList.add('copied')

        setTimeout(() => {
          button.textContent = '复制'
          button.classList.remove('copied')
        }, 2000)
      }).catch(err => {
        console.error('复制失败:', err)
        button.textContent = '失败'
        setTimeout(() => {
          button.textContent = '复制'
        }, 2000)
      })
    })

    pre.style.position = 'relative'
    pre.appendChild(button)
  }
}
