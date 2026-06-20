import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 9099,
    proxy: {
      '/api': 'http://localhost:9098'
    }
  }
})