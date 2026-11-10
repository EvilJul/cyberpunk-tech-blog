import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { ThemeProvider } from './themes/ThemeProvider'
import './index.css'
import './mobile-reader.css'
import { reportError } from './utils/logger'

window.addEventListener('error', (e) => reportError(e.message))
window.addEventListener('unhandledrejection', (e) =>
  reportError(String(e.reason))
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <SettingsProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </SettingsProvider>
)
