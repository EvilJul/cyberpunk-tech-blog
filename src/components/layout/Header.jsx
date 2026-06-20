import React, { useState, useEffect } from 'react'
import { Search, Menu, X, Home, BookOpen, Tag, User, X as CloseIcon } from 'lucide-react'

export default function Header({ onNavigate, currentView }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (view) => {
    onNavigate(view)
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      onNavigate('search', searchQuery)
      setSearchOpen(false)
      setSearchQuery('')
    }
  }

  return (
    <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
      scrolled ? 'bg-dark-950/95 backdrop-blur-xl shadow-lg shadow-black/30 border-b border-dark-700/30' : 'bg-dark-950/80 backdrop-blur-sm'
    }`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => handleNavClick('home')}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold via-gold-light to-gold-dark flex items-center justify-center shadow-lg shadow-gold/20 group-hover:shadow-gold/40 transition-shadow">
            <span className="text-dark-950 font-bold text-sm">T</span>
          </div>
          <span className="text-xl font-bold gradient-text hidden sm:block">TechBlog</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-1">
          <button 
            onClick={() => handleNavClick('home')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'home' 
                ? 'text-gold bg-gold/10' 
                : 'text-dark-300 hover:text-gold hover:bg-dark-800/50'
            }`}
          >
            <Home size={16} />
            <span>首页</span>
          </button>
          <button 
            onClick={() => handleNavClick('articles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'articles' 
                ? 'text-gold bg-gold/10' 
                : 'text-dark-300 hover:text-gold hover:bg-dark-800/50'
            }`}
          >
            <BookOpen size={16} />
            <span>文章</span>
          </button>
          <button 
            onClick={() => handleNavClick('tags')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'tags' 
                ? 'text-gold bg-gold/10' 
                : 'text-dark-300 hover:text-gold hover:bg-dark-800/50'
            }`}
          >
            <Tag size={16} />
            <span>标签</span>
          </button>
          <button 
            onClick={() => handleNavClick('about')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'about' 
                ? 'text-gold bg-gold/10' 
                : 'text-dark-300 hover:text-gold hover:bg-dark-800/50'
            }`}
          >
            <User size={16} />
            <span>关于</span>
          </button>
          <div className="w-px h-6 bg-dark-700 mx-2"></div>
          <button 
            onClick={() => setSearchOpen(true)}
            className="p-2 text-dark-300 hover:text-gold hover:bg-dark-800/50 rounded-xl transition-all"
          >
            <Search size={18} />
          </button>
        </nav>

        <button 
          className="md:hidden p-2 text-dark-300 hover:bg-dark-800/50 rounded-xl"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* 移动端菜单 */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-dark-900/98 backdrop-blur-xl border-t border-dark-700/50">
          <nav className="flex flex-col p-2 gap-1">
            <button 
              onClick={() => handleNavClick('home')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:text-gold hover:bg-dark-800/50"
            >
              <Home size={18} />
              <span>首页</span>
            </button>
            <button 
              onClick={() => handleNavClick('articles')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:text-gold hover:bg-dark-800/50"
            >
              <BookOpen size={18} />
              <span>文章</span>
            </button>
            <button 
              onClick={() => handleNavClick('tags')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:text-gold hover:bg-dark-800/50"
            >
              <Tag size={18} />
              <span>标签</span>
            </button>
            <button 
              onClick={() => handleNavClick('about')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:text-gold hover:bg-dark-800/50"
            >
              <User size={18} />
              <span>关于</span>
            </button>
            <button 
              onClick={() => { setSearchOpen(true); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:text-gold hover:bg-dark-800/50"
            >
              <Search size={18} />
              <span>搜索</span>
            </button>
          </nav>
        </div>
      )}

      {/* 搜索弹窗 */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-xl glass-card p-4 animate-slide-up">
            <form onSubmit={handleSearch} className="flex items-center gap-3">
              <Search className="text-gold" size={20} />
              <input
                type="text"
                placeholder="搜索文章..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder-dark-400 focus:outline-none text-lg"
                autoFocus
              />
              <button 
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-2 text-dark-400 hover:text-gold transition-colors"
              >
                <CloseIcon size={20} />
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}