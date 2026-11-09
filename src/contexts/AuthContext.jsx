import React, { createContext, useContext, useEffect, useState } from 'react'
import { studioApi, setCsrfToken, exportRecovery } from '../utils/studioApi'
const AuthContext = createContext(null)
export const useAuth = /* 读取当前作者会话上下文。 */ () => useContext(AuthContext)
/** 提供作者身份、登录退出及会话刷新。 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const accept = /* 接收会话身份与内存 CSRF 令牌。 */ (data) => {
    setCsrfToken(data.csrfToken)
    setUser(data.user)
    setError('')
    return data.user
  }
  const refresh = /* 重新获取作者身份并处理失效会话。 */ async () => {
    setLoading(true)
    try {
      return accept(await studioApi('/api/session/me'))
    } catch (e) {
      setUser(null)
      setCsrfToken(null)
      if (e.status !== 401) setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(/* 挂载身份上下文时刷新作者会话。 */ () => {
    refresh()
  }, [])
  const login = /* 提交凭据并接收浏览器会话。 */ async (credentials) =>
    accept(
      await studioApi('/api/session/login', {
        method: 'POST',
        body: credentials
      })
    )
  const logout = /* 退出前处理本机恢复副本并撤销会话。 */ async () => {
    const prefix = `blog-recovery:${user.id}:`
    const drafts = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key.startsWith(prefix)) drafts[key] = localStorage.getItem(key)
      }
    } catch {}
    let clear = false
    if (Object.keys(drafts).length > 0) {
      if (window.confirm('退出前是否导出本机草稿？取消将跳过导出。')) {
        exportRecovery(drafts)
      }
      clear = window.confirm(
        '退出将默认清除本机草稿。确定清除？取消后可选择保留或中止退出。'
      )
      if (!clear && !window.confirm('确认在这台设备保留私密草稿并退出？'))
        return
    }
    await studioApi('/api/session/logout', { method: 'POST' })
    if (clear) {
      try {
        Object.keys(drafts).forEach(/* 逐项清理当前账号的本机恢复记录。 */ (key) => localStorage.removeItem(key))
      } catch {}
    }
    setCsrfToken(null)
    setUser(null)
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, refresh, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}
