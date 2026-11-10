import React, { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useMobileReader } from '../../utils/readerViewport'

/** 保持受控输入与焦点稳定；组合输入状态交由列表统一防抖。 */
export default function SearchBar({ query, onSearch, onComposingChange, autoFocus = false, inputName = 'reader-search', focusRequest = false }) {
  const [localQuery, setLocalQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const composing = useRef(false)
  const isMobile = useMobileReader()
  const value = query ?? localQuery

  /** 更新受控值，同时兼容独立使用时的内部输入。 */
  function changeValue(next) {
    setLocalQuery(next)
    onSearch?.(next)
  }
  /** 清空立即提交并把焦点保留在输入框。 */
  function clear() {
    composing.current = false
    onComposingChange?.(false)
    changeValue('')
    inputRef.current?.focus()
  }
  useEffect(/* 只响应明确的聚焦意图，不随结果更新抢焦点。 */ () => {
    if (autoFocus || focusRequest) inputRef.current?.focus()
  }, [autoFocus, focusRequest])
  useEffect(/* 输入区以外的斜杠快捷键聚焦搜索。 */ () => {
    /** 避免覆盖可编辑元素中的正常键入。 */
    function handleShortcut(event) {
      const target = document.activeElement
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) && !target?.isContentEditable) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return /* 卸载时移除快捷键。 */ () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  return (
    <form className="reader-list-search relative mb-6" onSubmit={/* 防止组合期间提交或刷新页面。 */ event => event.preventDefault()}>
      <div className={`glass-card flex items-center gap-3 px-4 py-3 ${focused ? 'border-gold/30' : ''}`}>
        <Search size={18} aria-hidden="true" className="text-dark-400 flex-shrink-0" />
        <input ref={inputRef} name={inputName} aria-label="搜索文章" type="text"
          placeholder={isMobile ? '搜索文章' : '搜索文章... (按 / 聚焦)'} value={value}
          onChange={/* 每次输入都回传草稿，防抖由列表负责。 */ event => changeValue(event.target.value)}
          onCompositionStart={/* 组合开始立即暂停已有防抖。 */ () => { composing.current = true; onComposingChange?.(true) }}
          onCompositionEnd={/* 组合结束后再启动完整防抖周期。 */ event => { composing.current = false; onComposingChange?.(false); changeValue(event.currentTarget.value) }}
          onKeyDown={/* 输入法使用 Escape 时不干扰候选词。 */ event => {
            if (event.key === 'Escape' && !composing.current && !event.nativeEvent.isComposing) {
              if (value) { event.preventDefault(); event.stopPropagation(); clear() }
              else inputRef.current?.blur()
            }
          }}
          onFocus={/* 标记输入焦点。 */ () => setFocused(true)}
          onBlur={/* 清除焦点样式。 */ () => setFocused(false)}
          className="min-w-0 flex-1 bg-transparent text-white placeholder-dark-400 focus:outline-none text-sm" />
        {value ? <button type="button" aria-label="清除搜索" onClick={clear} className="reader-search-clear text-dark-400 hover:text-gold"><X size={16} aria-hidden="true" /></button>
          : !isMobile && <kbd className="hidden sm:inline-flex text-xs text-dark-500">/</kbd>}
      </div>
    </form>
  )
}
