import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studioApi } from '../../utils/studioApi'
import './studio.css'
/** 使用本地安装令牌初始化首个管理员。 */
export default function Setup() {
  const [needed, setNeeded] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    navigate = useNavigate()
  useEffect(/* 查询站点是否仍允许首装。 */ () => {
    studioApi('/api/setup/status')
      .then(/* 更新首装需求状态。 */ (d) => setNeeded(d.needsSetup ?? d.setupRequired ?? d.required))
      .catch(/* 更新错误提示。 */ (e) => setError(e.message))
  }, [])
  return (
    <main className="studio studio--auth">
      <h1>首次安装</h1>
      <p>
        请在服务器本机运行 node scripts/create-setup-token.js
        获取一次性安装凭据，不要分享凭据。
      </p>
      {needed === false ? (
        <p>站点已有账号，安装入口已关闭。</p>
      ) : needed ? (
        <form
          onSubmit={/* 提交本地令牌和首位管理员信息后进入登录页。 */ async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            try {
              await studioApi('/api/setup/complete', {
                method: 'POST',
                body: Object.fromEntries(new FormData(e.currentTarget))
              })
              navigate('/login', { replace: true })
            } catch (e) {
              setError(e.message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <label>
            安装凭据
            <input name="token" type="password" required autoComplete="off" />
          </label>
          <label>
            管理员用户名
            <input name="username" required autoComplete="username" />
          </label>
          <label>
            管理员密码
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <button disabled={busy}>创建管理员</button>
        </form>
      ) : (
        <p>正在检查安装状态…</p>
      )}
      {error && <p role="alert">{error}</p>}
      <Link to="/login">返回登录</Link>
    </main>
  )
}
