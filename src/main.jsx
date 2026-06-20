import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import './index.css'

window.addEventListener('error', (e) => {
  fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'ERROR', message: '全局错误', data: { message: e.message, filename: e.filename, lineno: e.lineno } })
  }).catch(() => {})
})

window.addEventListener('unhandledrejection', (e) => {
  fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'ERROR', message: 'Promise错误', data: { reason: String(e.reason) } })
  }).catch(() => {})
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
)
