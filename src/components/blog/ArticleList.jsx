import React, { useState, useEffect, useMemo } from 'react'
import ArticleCard from './ArticleCard'
import SearchBar from './SearchBar'
import { useSettings } from '../../contexts/SettingsContext'
import { Folder, X } from 'lucide-react'
import { logger } from '../../utils/logger'

function highlightMatch(text, query) {
  if (!query.trim()) return text
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-gold/30 text-gold rounded px-0.5">{part}</mark> : part
  )
}

export default function ArticleList({ onArticleClick, perPage = 10 }) {
  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: perPage,
    total: 0,
    total_pages: 0
  })
  const { settings } = useSettings()

  // 获取文章列表
  const fetchArticles = async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page,
        per_page: perPage,
        sort: 'publish_date',
        order: 'desc'
      })

      if (selectedCategory) {
        params.append('category', selectedCategory)
      }

      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }

      const res = await fetch(`/api/articles?${params}`)
      const data = await res.json()

      logger.info('获取文章成功', { total: data.pagination?.total || data.length })

      // 适配新旧 API 格式
      if (data.data) {
        setArticles(data.data)
        setPagination(data.pagination)
      } else {
        // 兼容旧格式
        setArticles(data)
        setPagination({
          page: 1,
          per_page: data.length,
          total: data.length,
          total_pages: 1
        })
      }

      setLoading(false)
    } catch (err) {
      logger.error('获取文章失败', { error: err.message })
      setLoading(false)
    }
  }

  useEffect(() => {
    logger.info('ArticleList 组件已挂载')
    // 获取分类
    fetch('/api/categories').then(res => res.json()).then(setCategories).catch(console.error)
  }, [])

  useEffect(() => {
    fetchArticles(1)
  }, [searchQuery, selectedCategory, perPage])

  const articleCategories = useMemo(() => {
    const catMap = {}
    categories.forEach(cat => {
      catMap[cat.name] = cat.count || 0
    })
    return Object.entries(catMap).map(([name, count]) => ({ name, count }))
  }, [categories])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold"></div>
      </div>
    )
  }

  return (
    <div>
      <SearchBar onSearch={setSearchQuery} />

      {searchQuery && (
        <div className="mb-4 text-sm text-dark-400">
          搜索 "<span className="text-gold">{searchQuery}</span>" 找到 {pagination.total} 篇文章
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Folder size={16} className="text-gold" />
          <span className="text-sm font-medium text-white">按分类筛选</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm transition-all ${
              !selectedCategory
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'bg-dark-800/50 text-dark-400 border border-dark-700/50 hover:text-gold hover:border-gold/30'
            }`}
          >
            全部
          </button>
          {articleCategories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
              className={`px-3 py-1.5 rounded-full text-sm transition-all flex items-center gap-1.5 ${
                selectedCategory === cat.name
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-dark-800/50 text-dark-400 border border-dark-700/50 hover:text-gold hover:border-gold/30'
              }`}
            >
              {cat.name}
              <span className="text-xs opacity-70">({cat.count})</span>
              {selectedCategory === cat.name && <X size={12} />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {articles.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-dark-400">
              {searchQuery || selectedCategory ? '没有找到匹配的文章' : '暂无文章'}
            </p>
          </div>
        ) : (
          articles.map(article => (
            <ArticleCard
              key={article.id}
              article={article}
              onClick={onArticleClick}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>

      {/* 分页控制 */}
      {pagination.total_pages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-dark-400">
            显示 {articles.length} / {pagination.total} 篇文章
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => fetchArticles(pagination.page - 1)}
              disabled={!pagination.has_prev}
              className="px-4 py-2 rounded-lg bg-dark-800/50 text-white border border-dark-700/50 hover:border-gold/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              上一页
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(pagination.total_pages, 5) }, (_, i) => {
                let pageNum
                if (pagination.total_pages <= 5) {
                  pageNum = i + 1
                } else if (pagination.page <= 3) {
                  pageNum = i + 1
                } else if (pagination.page >= pagination.total_pages - 2) {
                  pageNum = pagination.total_pages - 4 + i
                } else {
                  pageNum = pagination.page - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => fetchArticles(pageNum)}
                    className={`w-10 h-10 rounded-lg border transition-all ${
                      pagination.page === pageNum
                        ? 'bg-gold/20 text-gold border-gold/30'
                        : 'bg-dark-800/50 text-dark-400 border-dark-700/50 hover:border-gold/30'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => fetchArticles(pagination.page + 1)}
              disabled={!pagination.has_next}
              className="px-4 py-2 rounded-lg bg-dark-800/50 text-white border border-dark-700/50 hover:border-gold/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
