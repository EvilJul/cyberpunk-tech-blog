import React, { useEffect, useState } from 'react'
import { studioApi } from '../../utils/studioApi'
import StudioPageHeader from './StudioPageHeader'
const root = '/api/studio/integrations'
const scopes = {
  'articles:read': '读取自己创建的文章',
  'articles:write': '创建和保存工作草稿（不会自动发布）',
  'articles:publish': '发布与撤回文章',
  'media:write': '上传正文图片'
}
const date = /* 格式化时间，缺失时显示尚无。 */ (value) => (value ? new Date(value).toLocaleString() : '尚无')
/** 管理集成、一次性密钥及脱敏调用审计。 */
export default function IntegrationsPage() {
  const [publishingEnabled, setPublishingEnabled] = useState(false)
  useEffect(/* 读取服务端发布集成能力开关。 */ () => {
    studioApi('/api/studio/capabilities')
      .then(/* 更新发布集成可用状态。 */ (data) => setPublishingEnabled(data.publishingEnabled === true))
      .catch(/* 更新操作反馈。 */ (e) => setMessage(e.message))
  }, [])
  const [items, setItems] = useState([]),
    [selected, setSelected] = useState(''),
    [keys, setKeys] = useState([]),
    [auditSnapshot, setAudit] = useState(null),
    [page, setPage] = useState(1),
    [result, setResult] = useState(''),
    [name, setName] = useState(''),
    [grants, setGrants] = useState([]),
    [days, setDays] = useState(90),
    [overlap, setOverlap] = useState(0),
    [secret, setSecret] = useState(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  // 仅展示属于当前集成和页码的响应，避免翻页时把旧记录显示为新页。
  const audit = auditSnapshot?.integrationId === selected && auditSnapshot?.page === page
    ? auditSnapshot.value
    : null
  const load = /* 加载页面数据并更新展示状态。 */ async () => setItems((await studioApi(root)).data)
  const details = /* 读取所选集成的密钥和当前页审计。 */ async () => {
    if (!selected) return
    setKeys((await studioApi(`${root}/${selected}/keys`)).data)
    setAudit({
      integrationId: selected,
      page,
      value: await studioApi(`${root}/${selected}/audit?page=${page}&per_page=20`)
    })
  }
  useEffect(/* 首次进入页面时加载集成列表。 */ () => {
    load().catch(/* 更新操作反馈。 */ (e) => setMessage(e.message))
  }, [])
  useEffect(/* 切换集成或页码时加载详情并忽略旧响应。 */ () => {
    let active = true
    setKeys([])
    setAudit(null)
    if (selected)
      Promise.all([
        studioApi(`${root}/${selected}/keys`),
        studioApi(`${root}/${selected}/audit?page=${page}&per_page=20`)
      ])
        .then(/* 接收请求结果并更新页面状态。 */ ([a, b]) => {
          if (active) {
            setKeys(a.data)
            setAudit({ integrationId: selected, page, value: b })
          }
        })
        .catch(/* 处理请求失败并保留当前页面内容。 */ (e) => {
          if (active) setMessage(e.message)
        })
    return /* 忽略卸载后返回的异步结果。 */ () => {
      active = false
    }
  }, [selected, page])
  const run = /* 执行操作并统一处理忙碌状态与错误反馈。 */ async (fn) => {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      await load()
      await details()
      setMessage('操作成功')
    } catch (e) {
      setMessage(
        `${e.message}${e.requestId ? `（请求编号 ${e.requestId}）` : ''}`
      )
    } finally {
      setBusy(false)
    }
  }
  const post = /* 发送带会话保护的集成写请求。 */ (path, body = {}) => studioApi(path, { method: 'POST', body })
  const once = /* 仅在内存中展示本次返回的明文密钥。 */ (value) => {
    if (!value?.key) throw new Error('未收到密钥')
    setSecret(value.key)
  }
  return (
    <section>
      <StudioPageHeader
        title="发布集成"
        description="为中台创建独立凭据。建议仅选择必需权限，密钥不可管理账号或全站设置。发布 API 未启用时不能创建密钥。"
      />
      {!publishingEnabled && (
        <p role="status">发布集成尚未启用。请联系管理员配置启用后创建密钥。</p>
      )}
      <p role="status">{message}</p>
      {secret && (
        <aside role="alert" className="studio-secret">
          <h2>密钥仅展示这一次</h2>
          <p>请立即复制到调用方的安全配置中。关闭后无法再次查看。</p>
          <textarea
            aria-label="一次性密钥"
            readOnly
            value={secret}
            onFocus={/* 选中只读内容以便手动复制。 */ (e) => e.target.select()}
          />
          <div className="studio-actions">
            <button
              onClick={/* 复制当前内容并反馈剪贴板失败。 */ async () => {
                try {
                  await navigator.clipboard.writeText(secret)
                  setMessage('已复制密钥')
                } catch {
                  setMessage('请选中密钥手动复制')
                }
              }}
            >
              复制密钥
            </button>
            <button onClick={/* 更新一次性密钥展示。 */ () => setSecret(null)}>已妥善保存，关闭</button>
          </div>
        </aside>
      )}
      <form
        className="studio-manage-form"
        onSubmit={/* 创建集成并选中新建记录。 */ (e) => {
          e.preventDefault()
          run(/* 提交当前管理请求并更新操作结果。 */ async () => {
            const created = (await post(root, { name })).data
            setSelected(created.id)
            setName('')
            setPage(1)
          })
        }}
      >
        <h2 className="studio-manage-form-title">新建集成</h2>
        <div className="studio-fields">
          <label>
            集成名称
            <input
              required
              maxLength={80}
              value={name}
              onChange={/* 更新待创建集成的名称。 */ (e) => setName(e.target.value)}
            />
          </label>
        </div>
        <div className="studio-actions">
          <button disabled={busy || !publishingEnabled}>创建集成</button>
        </div>
      </form>
      <fieldset>
        <legend>集成信息</legend>
        <label htmlFor="studio-integration-select">选择集成</label>
        <select
          id="studio-integration-select"
          value={selected}
          onChange={/* 关闭明文密钥并清除内存展示。 */ (e) => {
            setSelected(e.target.value)
            setPage(1)
            setSecret(null)
          }}
        >
          <option value="">请选择</option>
          {items.map(/* 将当前条目映射为展示内容。 */ (item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.enabled ? '' : '（已禁用）'}
            </option>
          ))}
        </select>
      </fieldset>
      {selected && (
        <>
          <p>
            来源命名空间：<code>{selected}</code>。轮换不会更改来源或文章归属。
          </p>
          <div className="studio-actions">
            <button
              disabled={busy}
              onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
                const current = items.find(/* 查找当前标识对应的条目。 */ (item) => item.id === selected)
                if (
                  window.confirm(
                    `${current.enabled ? '禁用后所有密钥立即停止访问' : '重新启用此集成'}？`
                  )
                )
                  run(/* 提交当前管理请求并更新操作结果。 */ () =>
                    studioApi(`${root}/${selected}`, {
                      method: 'PATCH',
                      body: { enabled: !current.enabled }
                    })
                  )
              }}
            >
              {items.find(/* 查找当前标识对应的条目。 */ (item) => item.id === selected)?.enabled
                ? '禁用集成'
                : '启用集成'}
            </button>
          </div>
          <fieldset>
            <legend>新密钥权限（默认无权限）</legend>
            {Object.entries(scopes).map(/* 将当前条目映射为展示内容。 */ ([key, description]) => (
              <label key={key} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={grants.includes(key)}
                  onChange={/* 更新密钥权限。 */ (e) =>
                    setGrants(
                      e.target.checked
                        ? [...grants, key]
                        : grants.filter(/* 筛选符合当前条件的条目。 */ (item) => item !== key)
                    )
                  }
                />
                {key}：{description}
              </label>
            ))}
            <label>
              有效天数（1–365）
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={/* 更新密钥有效天数。 */ (e) => setDays(Number(e.target.value))}
              />
            </label>
            <div className="studio-actions">
              <button
                disabled={busy || !!secret || !publishingEnabled}
                onClick={/* 提交当前管理请求并更新操作结果。 */ () =>
                  run(/* 提交当前管理请求并更新操作结果。 */ async () =>
                    once(
                      (
                        await post(`${root}/${selected}/keys`, {
                          scopes: grants,
                          expires_in_days: days
                        })
                      ).data
                    )
                  )
                }
              >
                创建密钥
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend>现有密钥</legend>
            <label>
              轮换重叠小时（默认立即撤销旧密钥，最多24小时）
              <input
                type="number"
                min={0}
                max={24}
                value={overlap}
                onChange={/* 更新轮换重叠小时。 */ (e) => setOverlap(Number(e.target.value))}
              />
            </label>
            <ul>
              {keys.map(/* 将当前条目映射为展示内容。 */ (key) => (
                <li key={key.key_id}>
                  <code>{key.key_id}</code>
                  <p>
                    权限：{key.scopes.join('、') || '无'}；到期：
                    {date(key.expires_at)}；上次使用：{date(key.last_used_at)}
                    ；状态：
                    {key.revoked_at
                      ? '已撤销'
                      : key.expires_at <= Date.now()
                        ? '已过期'
                        : '有效'}
                  </p>
                  <div className="studio-actions">
                    <button
                      disabled={
                        busy ||
                        !!secret ||
                        !publishingEnabled ||
                        !!key.revoked_at ||
                        key.expires_at <= Date.now()
                      }
                      onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
                        if (
                          window.confirm(
                            '轮换此密钥？保留原权限，旧密钥按指定重叠时间失效。'
                          )
                        )
                          run(/* 提交当前管理请求并更新操作结果。 */ async () =>
                            once(
                              (
                                await post(
                                  `${root}/${selected}/keys/${key.key_id}/rotate`,
                                  {
                                    scopes: key.scopes,
                                    expires_in_days: days,
                                    overlap_hours: overlap
                                  }
                                )
                              ).data
                            )
                          )
                      }}
                    >
                      轮换（保留原权限）
                    </button>
                    <button
                      className="studio-button--danger"
                      disabled={busy || !!key.revoked_at}
                      onClick={/* 确认用户意图后执行当前管理操作。 */ () => {
                        if (window.confirm('立即撤销此密钥？调用方需更新配置。'))
                          run(/* 提交当前管理请求并更新操作结果。 */ () =>
                            post(`${root}/${selected}/keys/${key.key_id}/revoke`)
                          )
                      }}
                    >
                      立即撤销
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend>接入说明</legend>
            <p>
              在服务端设置 Authorization: Bearer &lt;密钥&gt;，先调用
              /api/v1/connection 验证；草稿保存和发布为独立动作。密钥不要放入 URL
              或前端网页。HTTP 412 表示版本冲突，需读取最新版本后合并。
            </p>
          </fieldset>
          <fieldset>
            <legend>调用审计</legend>
            <label>
              当前页结果筛选
              <input
                placeholder="例如 200、403"
                value={result}
                onChange={/* 更新审计结果筛选。 */ (e) => setResult(e.target.value)}
              />
            </label>
            <div className="studio-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作</th>
                    <th>结果</th>
                    <th>请求编号</th>
                  </tr>
                </thead>
                <tbody>
                  {audit?.data
                    ?.filter(
                      /* 筛选符合当前条件的条目。 */ (item) => !result || String(item.result).includes(result)
                    )
                    .map(/* 将当前条目映射为展示内容。 */ (item) => (
                      <tr key={item.id}>
                        <td>{date(item.created_at)}</td>
                        <td>{item.operation}</td>
                        <td>{item.result}</td>
                        <td>{item.request_id}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <nav className="studio-pager" aria-label="审计分页">
              <button disabled={page === 1} onClick={/* 更新页码。 */ () => setPage(page - 1)}>
                上一页
              </button>
              <span className="studio-pager-info">
                第 {page} 页，共 {audit?.pagination?.total || 0} 条
              </span>
              <button
                disabled={!audit?.pagination?.has_next}
                onClick={/* 更新页码。 */ () => setPage(page + 1)}
              >
                下一页
              </button>
            </nav>
          </fieldset>
        </>
      )}
    </section>
  )
}
