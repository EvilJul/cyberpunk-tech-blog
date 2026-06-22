import React, { useRef, useEffect } from 'react'

export default function SplashCursor() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const particles = []
    const MAX_PARTICLES = 200

    const handleMouseMove = (e) => {
      for (let i = 0; i < 2; i++) {
        particles.push({
          x: e.clientX,
          y: e.clientY,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 1,
          color: `hsla(${Math.random() * 60 + 30}, 100%, 50%, 0.4)`,
        })
      }

      while (particles.length > MAX_PARTICLES) {
        particles.shift()
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.03

        if (p.life <= 0) {
          particles.splice(i, 1)
          continue
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, 2 * p.life, 0, Math.PI * 2)
        ctx.fillStyle = p.color.replace('0.4', String(p.life * 0.3))
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, 6 * p.life, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(50, 100%, 50%, ${p.life * 0.08})`
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('resize', resize)
    animate()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  )
}