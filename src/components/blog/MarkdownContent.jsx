import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowUp } from 'lucide-react'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { useMobileReader } from '../../utils/readerViewport'
import './article-reading.css'

// Build the TOC and IDs from the same rendered AST, including inline formatting.
const plain = (node) =>
  node.type === 'text' ? node.value : (node.children || []).map(plain).join('')
export function headingPlugin(onHeadings) {
  return () => (tree) => {
    const headings = [],
      counts = new Map()
    const walk = (node) => {
      if (/^h[1-3]$/.test(node.tagName)) {
        const text = plain(node)
        const stem = `section-${
          text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-|-$/g, '') || 'heading'
        }`
        const count = (counts.get(stem) || 0) + 1
        counts.set(stem, count)
        const id = `${stem}-${count}`
        node.properties = { ...node.properties, id }
        headings.push({ id, text, level: Number(node.tagName[1]) })
      }
      node.children?.forEach(walk)
    }
    walk(tree)
    onHeadings(headings)
  }
}
// Split highlighted tokens at newlines without losing nested syntax spans.
export function codeLinesPlugin() {
  return (tree) => {
    const split = (node) => {
      if (node.type === 'text')
        return node.value.split('\n').map((value) => [{ type: 'text', value }])
      const lines = [[]]
      for (const child of node.children || []) {
        split(child).forEach((parts, index) => {
          if (index) lines.push([])
          lines[lines.length - 1].push(...parts)
        })
      }
      return lines.map((children) => [{ ...node, children }])
    }
    const walk = (node) => {
      if (node.tagName === 'pre' && node.children?.[0]?.tagName === 'code') {
        const code = node.children[0],
          lines = [[]]
        for (const child of code.children)
          split(child).forEach((parts, index) => {
            if (index) lines.push([])
            lines[lines.length - 1].push(...parts)
          })
        if (
          lines.length > 1 &&
          lines.at(-1).every((n) => n.type === 'text' && !n.value)
        )
          lines.pop()
        code.children = lines.map((children, index) => ({
          type: 'element',
          tagName: 'span',
          properties: { className: ['code-line'] },
          children: [
            ...children,
            ...(index < lines.length - 1 ? [{ type: 'text', value: '\n' }] : [])
          ]
        }))
        return
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes.code || []),
      ['className', /^language-/, /^hljs/]
    ],
    span: [...(defaultSchema.attributes.span || []), ['className', /^hljs/]]
  }
}
function CodeBlock({ children }) {
  const ref = useRef(null),
    [status, setStatus] = useState('复制代码')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        ref.current.textContent.replace(/\n$/, '')
      )
      setStatus('已复制')
    } catch {
      setStatus('复制失败，请选择代码复制')
    }
  }
  return (
    <div className="code-block">
      <button onClick={copy} aria-live="polite">
        {status}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}
/** 共享安全 Markdown 渲染，局部管理目录、预览和可访问的回顶入口。 */
export default function MarkdownContent({ content }) {
  const mobile = useMobileReader()
  const [tocOpen, setTocOpen] = useState(false)
  const [readingReady, setReadingReady] = useState(false)
  const tocId = React.useId()
  // 工作台预览复用渲染器，但不启用手机读者的目录策略。

  const [headings, setHeadings] = useState([]),
    [active, setActive] = useState(''),
    [image, setImage] = useState(null)
  const root = useRef(null),
    dialog = useRef(null),
    previousFocus = useRef(null)
  const reader = !!root.current?.closest('.article-reading')
  const collapsible = mobile && reader
  const nextHeadings = useRef([])
  const plugin = React.useMemo(
    /* 缓存标题插件，保持预览和正文的锚点一致。 */ () =>
      headingPlugin(/* 接收渲染树提取的目录。 */ (items) => {
        nextHeadings.current = items
      }),
    [content]
  )
  useEffect(/* 内容或预览状态变化时同步并清理相关资源。 */ () => {
    setHeadings(nextHeadings.current)
    setReadingReady(true)
    setTocOpen(false)
  }, [content])
  useEffect(/* 内容或预览状态变化时同步并清理相关资源。 */ () => {
    if (!root.current) return
    const observer = new IntersectionObserver(
      /* 跟踪当前进入阅读区域的标题。 */ (entries) => {
        const visible = entries.filter(/* 只保留可见标题。 */ (e) => e.isIntersecting)
        if (visible.length) setActive(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -65% 0px' }
    )
    root.current
      .querySelectorAll('h1,h2,h3')
      .forEach(/* 订阅各章节的可见性。 */ (h) => observer.observe(h))
    return /* 卸载后释放观察器。 */ () => observer.disconnect()
  }, [content])
  /** 关闭图片预览并由效果恢复有效触发焦点。 */
  const close = () => {
    dialog.current?.close()
    setImage(null)
  }
  useEffect(/* 内容或预览状态变化时同步并清理相关资源。 */ () => {
    if (image) {
      const overflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      dialog.current?.showModal()
      return /* 图片模态卸载或关闭时释放背景滚动锁。 */ () => {
        dialog.current?.close()
        document.body.style.overflow = overflow
      }
    }
    if (!previousFocus.current) return

    // Markdown rendering may replace the trigger. Resolve it after the close
    // render commits instead of focusing a detached node in the event handler.
    const frame = requestAnimationFrame(/* 等待图片触发节点完成渲染再恢复焦点。 */ () => {
      const { element, index } = previousFocus.current || {}
      const trigger = element?.isConnected
        ? element
        : root.current?.querySelectorAll('.image-preview-trigger')[index]
      trigger?.focus({ preventScroll: true })
      previousFocus.current = null
    })
    return /* 卸载后取消待处理焦点恢复。 */ () => cancelAnimationFrame(frame)
  }, [image])
  const components = React.useMemo(/* 复用安全渲染组件，避免预览状态变化重建触发节点。 */ () => {
    let imageIndex = 0
    return {
      pre: /* 包装代码复制和局部滚动。 */ ({ children }) => <CodeBlock>{children}</CodeBlock>,
      img: /* 保留图片比例，后续图片延迟加载。 */ ({ src, alt }) => (
        <button
          className="image-preview-trigger"
          onClick={/* 记录图片来源，关闭时恢复焦点。 */ (event) => {
            const element = event.currentTarget
            const triggers = [
              ...root.current.querySelectorAll('.image-preview-trigger')
            ]
            previousFocus.current = {
              element,
              index: triggers.indexOf(element)
            }
            setImage({ src, alt })
          }}
          aria-label={`放大图片：${alt || '文章图片'}`}
        >
          <img
            src={src}
            alt={alt || ''}
            loading={imageIndex++ === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        </button>
      ),
      a: /* 安全链接沿用净化器生成的地址。 */ ({ children, href }) => (
        <a href={href} rel="noopener noreferrer">
          {children}
        </a>
      )
    }
  }, [content])
  return (
    <>
      {headings.length > 0 && <nav aria-label="文章目录" className="toc">
        {collapsible ? (
          <button type="button" aria-expanded={tocOpen} aria-controls={tocId}
            onClick={/* 展开或收起手机文章目录。 */ () => setTocOpen(!tocOpen)}>
            文章目录 · {headings.length} 节 {tocOpen ? '收起' : '展开'}
          </button>
        ) : <h2>文章目录</h2>}
        <div id={tocId} className="toc-entries" hidden={collapsible && !tocOpen}>
        {headings.map(/* 同一 AST 提供唯一锚点与当前章节状态。 */ (h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            onClick={/* 收起后重新定位，抵消目录高度变化引起的位置偏移。 */ (event) => {
              if (!collapsible || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              setTocOpen(false)
              requestAnimationFrame(/* 等待折叠布局提交，再对齐标题。 */ () => {
                root.current?.querySelector(`[id="${h.id}"]`)?.scrollIntoView({ block: 'start' })
              })
            }}
            aria-current={active === h.id ? 'location' : undefined}
            style={{ paddingInlineStart: `${(h.level - 1) * 12}px` }}
          >
            {h.text}
          </a>
        ))}
        </div>
      </nav>}
      <div ref={root} className="markdown-body" data-reading-ready={readingReady}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeHighlight,
            [rehypeSanitize, schema],
            codeLinesPlugin,
            plugin
          ]}
          skipHtml
          components={components}
        >
          {content || ''}
        </ReactMarkdown>
      </div>
      <button
        className="back-top"
        type="button"
        aria-label="回到顶部"
        title="回到顶部"
        onClick={/* 回到阅读开头并尊重减少动效设置。 */ () =>
          window.scrollTo({
            top: 0,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth'
          })
        }
      >
        <ArrowUp size={21} aria-hidden="true" />
        <span className={reader ? 'sr-only' : undefined}>回到顶部</span>
      </button>
      <dialog
        ref={dialog}
        aria-label="图片预览"
        onCancel={/* Esc 使用统一关闭流程。 */ (e) => {
          e.preventDefault()
          close()
        }}
        onClick={/* 仅点击预览外围时关闭。 */ (e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        <button autoFocus onClick={close}>
          关闭图片预览
        </button>
        {image && <img src={image.src} alt={image.alt || ''} />}
      </dialog>
    </>
  )
}
