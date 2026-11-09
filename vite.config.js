import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const prefix = (env.VITE_BASE_PATH || '/').replace(/^\/+|\/+$/g, '')
  const base = prefix ? `/${prefix}/` : '/'
  // Keep the prefix: Express uses it for routing and the session Cookie Path.
  const proxy = Object.fromEntries(['api', 'uploads'].map(path => [
    `${base}${path}`,
    { target: 'http://localhost:9098', changeOrigin: false }
  ]))

  return {
    plugins: [react(), tailwindcss()],
    base,
    server: { port: 9099, proxy }
  }
})
