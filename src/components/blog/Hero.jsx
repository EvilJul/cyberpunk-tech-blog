import React from 'react'

export default function Hero() {
  return (
    <section id="home" className="py-12 text-center">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">
          <span className="gradient-text">TechBlog</span>
        </h1>
        <p className="text-lg text-dark-300 mb-6 animate-slide-up">
          探索技术世界，分享编程经验
        </p>
        <div className="flex flex-wrap justify-center gap-3 animate-slide-up">
          <span className="px-3 py-1 glass-card text-gold text-sm">React</span>
          <span className="px-3 py-1 glass-card text-gold text-sm">Node.js</span>
          <span className="px-3 py-1 glass-card text-gold text-sm">Python</span>
          <span className="px-3 py-1 glass-card text-gold text-sm">WebGL</span>
        </div>
      </div>
    </section>
  )
}