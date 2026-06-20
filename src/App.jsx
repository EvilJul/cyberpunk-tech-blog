import React, { useState, useEffect } from 'react'
import Footer from './components/layout/Footer'
import Sidebar from './components/layout/Sidebar'
import ArticleList from './components/blog/ArticleList'
import ArticleDetail from './components/blog/ArticleDetail'
import GridOverlay from './components/background/GridOverlay'
import { useSettings } from './contexts/SettingsContext'
import { logger } from './utils/logger'

function App() {
  const [selectedArticle, setSelectedArticle] = useState(null)
  const { settings, loading } = useSettings()

  useEffect(() => {
    logger.info('App 组件已挂载')
  }, [])

  useEffect(() => {
    logger.debug('App 渲染', { selectedArticle: selectedArticle?.title || 'null' })
  }, [selectedArticle])

  useEffect(() => {
    if (settings.title) {
      document.title = settings.title
    }
  }, [settings.title])

  const handleArticleClick = (article) => {
    logger.info('点击文章', { title: article.title, id: article.id })
    setSelectedArticle(article)
    logger.info('selectedArticle 已设置', { title: article.title })
  }

  const handleBack = () => {
    logger.info('返回首页')
    setSelectedArticle(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold"></div>
      </div>
    )
  }

  const isSidebarLeft = settings.sidebar === 'left'

  return (
    <div className="min-h-screen bg-dark-950 relative">
      {settings.grid && <GridOverlay />}

      <div className="relative z-10">
        <main className="pt-4">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className={`flex flex-col lg:flex-row gap-8 ${isSidebarLeft ? 'lg:flex-row-reverse' : ''}`}>
              <div className="flex-1 min-w-0">
                {selectedArticle ? (
                  <ArticleDetail article={selectedArticle} onBack={handleBack} />
                ) : (
                  <ArticleList
                    onArticleClick={handleArticleClick}
                    perPage={settings.perpage}
                  />
                )}
              </div>

              <div className="w-full lg:w-80 flex-shrink-0">
                <Sidebar />
              </div>
            </div>
          </div>
        </main>

        {settings.footer && <Footer settings={settings} />}
      </div>
    </div>
  )
}

export default App
