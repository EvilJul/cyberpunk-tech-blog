import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

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
export default function MarkdownContent({ content }) {
  const [headings, setHeadings] = useState([]),
    [active, setActive] = useState(''),
    [image, setImage] = useState(null)
  const root = useRef(null),
    dialog = useRef(null),
    previousFocus = useRef(null)
  const nextHeadings = useRef([])
  const plugin = React.useMemo(
    () =>
      headingPlugin((items) => {
        nextHeadings.current = items
      }),
    [content]
  )
  useEffect(() => {
    setHeadings(nextHeadings.current)
  }, [content])
  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length) setActive(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -65% 0px' }
    )
    root.current
      .querySelectorAll('h1,h2,h3')
      .forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [content])
  const close = () => {
    dialog.current?.close()
    setImage(null)
  }
  useEffect(() => {
    if (image) {
      dialog.current?.showModal()
      return
    }
    if (!previousFocus.current) return

    // Markdown rendering may replace the trigger. Resolve it after the close
    // render commits instead of focusing a detached node in the event handler.
    const frame = requestAnimationFrame(() => {
      const { element, index } = previousFocus.current || {}
      const trigger = element?.isConnected
        ? element
        : root.current?.querySelectorAll('.image-preview-trigger')[index]
      trigger?.focus({ preventScroll: true })
      previousFocus.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [image])
  const components = React.useMemo(() => {
    let imageIndex = 0
    return {
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      img: ({ src, alt }) => (
        <button
          className="image-preview-trigger"
          onClick={(event) => {
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
      a: ({ children, href }) => (
        <a href={href} rel="noopener noreferrer">
          {children}
        </a>
      )
    }
  }, [content])
  return (
    <>
      <nav aria-label="文章目录" className="toc">
        <h2>文章目录</h2>
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            aria-current={active === h.id ? 'location' : undefined}
            style={{ paddingInlineStart: `${(h.level - 1) * 12}px` }}
          >
            {h.text}
          </a>
        ))}
      </nav>
      <div ref={root} className="markdown-body">
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
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth'
          })
        }
      >
        回到顶部
      </button>
      <dialog
        ref={dialog}
        aria-label="图片预览"
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
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
