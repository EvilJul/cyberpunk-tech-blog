import React from 'react'

export default function Footer({ settings }) {
  return (
    <footer className="border-t border-dark-800 mt-12">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-dark-500 text-sm">
            © {new Date().getFullYear()} {settings?.title || 'TechBlog'}. {settings?.description || 'Built with React + Vite + Tailwind CSS'}
          </div>
          <div className="flex gap-6 text-sm">
            {settings?.github && (
              <a 
                href={settings.github} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-dark-500 hover:text-gold transition-colors"
              >
                GitHub
              </a>
            )}
            <a href="#" className="text-dark-500 hover:text-gold transition-colors">RSS</a>
            <a href="#" className="text-dark-500 hover:text-gold transition-colors">友链</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
