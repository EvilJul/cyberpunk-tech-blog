import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'

export default function SearchBar({ onSearch, onComposingChange }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const isComposing = useRef(false)

  const handleClear = useCallback(() => {
    setQuery('')
    if (onSearch) {
      onSearch('')
    }
    inputRef.current?.focus()
  }, [onSearch])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && !focused && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focused])

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      if (query) {
        e.preventDefault()
        handleClear()
      } else {
        // query 可能因 React 状态不同步而为空，但 onSearch 仍需清空
        if (onSearch) onSearch('')
        inputRef.current?.blur()
        setFocused(false)
      }
    }
  }, [query, handleClear, onSearch])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    if (onSearch) onSearch(query)
  }, [query, onSearch])

  const handleChange = useCallback((e) => {
    setQuery(e.target.value)
    if (!isComposing.current && onSearch) {
      onSearch(e.target.value)
    }
  }, [onSearch])

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true
    if (onComposingChange) onComposingChange(true)
  }, [onComposingChange])

  const handleCompositionEnd = useCallback((e) => {
    isComposing.current = false
    if (onComposingChange) onComposingChange(false)
    if (onSearch) onSearch(e.target.value)
  }, [onSearch, onComposingChange])

  return (
    <form onSubmit={handleSubmit} className="relative mb-6">
      <div className={`glass-card flex items-center gap-3 px-4 py-3 transition-all duration-300 ${
        focused ? 'border-gold/30 shadow-lg shadow-gold/10' : ''
      }`}>
        <Search size={18} className="text-dark-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索文章... (按 / 聚焦)"
          value={query}
          onChange={handleChange}
          onKeyDown={handleInputKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent text-white placeholder-dark-400 focus:outline-none text-sm"
        />
        {query ? (
          <button
            type="button"
            onClick={handleClear}
            className="text-dark-400 hover:text-gold transition-colors"
          >
            <X size={16} />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs text-dark-500 bg-dark-800/50 rounded border border-dark-700/50">
            /
          </kbd>
        )}
      </div>
    </form>
  )
}