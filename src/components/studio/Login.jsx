import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { safeReturnTo } from '../../utils/studioApi'
import './studio.css'
/** 登录作者会话并跳转至安全站内地址。 */
export default function Login() {
  const { login } = useAuth(),
    navigate = useNavigate(),
    [params] = useSearchParams()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  return (
    <main className="studio">
      <h1>作者登录</h1>
      <form
        onSubmit={/* 提交登录凭据并回到安全站内路径。 */ async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const data = new FormData(e.currentTarget)
          try {
            await login(Object.fromEntries(data))
            navigate(safeReturnTo(params.get('returnTo')), { replace: true })
          } catch (e) {
            setError(e.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          用户名
          <input name="username" required autoComplete="username" />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button disabled={busy}>登录</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <Link to="/">返回博客</Link> · <Link to="/setup">首次安装</Link>
    </main>
  )
}
