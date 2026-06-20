import React, { useRef, useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

export default function GridOverlay() {
  const canvasRef = useRef(null)
  const { colors } = useSettings()
  const [cachedRgb, setCachedRgb] = useState(() => hexToRgb(colors.primary))

  useEffect(() => {
    setCachedRgb(hexToRgb(colors.primary))
  }, [colors.primary])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const gridSize = 60
    const particles = []
    const maxParticles = 15

    class Particle {
      constructor() {
        this.reset()
      }

      reset() {
        const side = Math.floor(Math.random() * 4)
        switch (side) {
          case 0:
            this.x = Math.random() * canvas.width
            this.y = 0
            this.vx = (Math.random() - 0.5) * 0.5
            this.vy = Math.random() * 0.8 + 0.2
            break
          case 1:
            this.x = canvas.width
            this.y = Math.random() * canvas.height
            this.vx = -(Math.random() * 0.8 + 0.2)
            this.vy = (Math.random() - 0.5) * 0.5
            break
          case 2:
            this.x = Math.random() * canvas.width
            this.y = canvas.height
            this.vx = (Math.random() - 0.5) * 0.5
            this.vy = -(Math.random() * 0.8 + 0.2)
            break
          case 3:
            this.x = 0
            this.y = Math.random() * canvas.height
            this.vx = Math.random() * 0.8 + 0.2
            this.vy = (Math.random() - 0.5) * 0.5
            break
        }
        this.life = 1
        this.decay = Math.random() * 0.003 + 0.002
        this.size = Math.random() * 2 + 1
      }

      update() {
        this.x += this.vx
        this.y += this.vy
        this.life -= this.decay

        if (this.life <= 0 || this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
          this.reset()
        }
      }

      draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cachedRgb.r}, ${cachedRgb.g}, ${cachedRgb.b}, ${this.life * 0.6})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cachedRgb.r}, ${cachedRgb.g}, ${cachedRgb.b}, ${this.life * 0.15})`
        ctx.fill()
      }
    }

    for (let i = 0; i < maxParticles; i++) {
      particles.push(new Particle())
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.strokeStyle = `rgba(${cachedRgb.r}, ${cachedRgb.g}, ${cachedRgb.b}, 0.03)`
      ctx.lineWidth = 1

      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      particles.forEach(p => {
        p.update()
        p.draw()
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
