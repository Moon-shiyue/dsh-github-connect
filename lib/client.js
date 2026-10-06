/**
 * dsh-github-connect — browser half (plain JS, no build step).
 *
 * Registered as a `window.__ModuleLoader__` module, like every other profile
 * bundle client half. Adds:
 *  - a small always-visible GitHub button at `conversation.input.left`
 *    (bottom-left of the chat composer),
 *  - a connect panel in `conversation.input.overlay` that opens above the
 *    composer: OAuth device flow or personal access token.
 */
window.__ModuleLoader__.load({
  id: 'dsh-github-connect',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const NS = 'dsh-github-connect'

    const R = {
      status: '/dsh-github/status',
      deviceStart: '/dsh-github/device/start',
      devicePoll: '/dsh-github/device/poll',
      pat: '/dsh-github/pat',
      verify: '/dsh-github/verify',
      disconnect: '/dsh-github/disconnect',
    }

    async function api(path, payload) {
      const init = payload === undefined
        ? { cache: 'no-store' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
      let res
      try {
        res = await fetch(path, init)
      } catch (err) {
        throw new Error('无法连接到 DSH 主机：' + (err && err.message ? err.message : String(err)))
      }
      let data = null
      try {
        data = await res.json()
      } catch {
        /* not json */
      }
      if (data === null) throw new Error('请求失败（HTTP ' + res.status + '）')
      if (data.error) throw new Error(data.error)
      return data
    }

    // ── open/close store shared by button and panel ────────────────────────

    const listeners = new Set()
    let openSessionId = null
    const subscribe = (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
    const getOpenSession = () => openSessionId
    function setOpen(sessionId, open) {
      openSessionId = open ? sessionId : null
      listeners.forEach((fn) => fn())
    }
    function useOpenSession() {
      return React.useSyncExternalStore(subscribe, getOpenSession, () => null)
    }

    // ── icons ──────────────────────────────────────────────────────────────

    const OCTOCAT = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'

    function OctocatIcon() {
      return React.createElement('svg', { className: 'ghc-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        React.createElement('path', { d: OCTOCAT, fill: 'currentColor', fillRule: 'evenodd' }))
    }

    // ── left composer button ───────────────────────────────────────────────

    function LeftButton(props) {
      const openSession = useOpenSession()
      const isOpen = openSession === props.sessionId
      const [status, setStatus] = React.useState(null)
      // Verify against GitHub rather than replaying the cached status, so a
      // restarted dsh shows the fresh state (and drops dead tokens).
      React.useEffect(() => {
        let alive = true
        api(R.verify, {}).then((s) => { if (alive) setStatus(s) }).catch(() => {})
        return () => { alive = false }
      }, [isOpen])
      const connected = status !== null && status.connected === true
      return React.createElement('button', {
        type: 'button',
        className: 'ghc-trigger' + (connected ? ' ghc-connected' : '') + (isOpen ? ' ghc-open' : ''),
        title: connected && status.login ? '已连接 GitHub：' + status.login : '连接 GitHub 账号',
        'aria-label': '连接 GitHub 账号',
        onClick: () => setOpen(props.sessionId, !isOpen),
      },
        React.createElement(OctocatIcon, null),
        React.createElement('span', { className: 'ghc-trigger-label' }, connected && status.login ? status.login : 'GitHub'),
        React.createElement('span', { className: 'ghc-dot' + (connected ? ' ghc-dot-on' : '') }, null))
    }

    // ── connect panel ──────────────────────────────────────────────────────

    function Panel(props) {
      const openSession = useOpenSession()
      if (openSession !== props.sessionId) return null
      return React.createElement('div', {
        className: 'ghc-backdrop',
        onClick: (event) => {
          if (event.target === event.currentTarget) setOpen(props.sessionId, false)
        },
      },
        React.createElement(ConnectPanel, { sessionId: props.sessionId }))
    }

    function ConnectPanel(props) {
      const [status, setStatus] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        api(R.verify, {})
          .then((s) => { if (alive) { setStatus(s); setError(null) } })
          .catch((e) => { if (alive) setError(e && e.message ? e.message : String(e)) })
          .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
      }, [])
      const close = () => setOpen(props.sessionId, false)
      const onConnected = (user, kind) => {
        setError(null)
        setStatus({
          connected: true,
          login: user.login,
          avatarUrl: user.avatarUrl || null,
          name: user.name || null,
          scopes: user.scopes || [],
          kind,
          connectedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
        })
      }
      return React.createElement('div', { className: 'ghc-panel', role: 'dialog', 'aria-label': 'GitHub 连接' },
        React.createElement('div', { className: 'ghc-panel-head' },
          React.createElement(OctocatIcon, null),
          React.createElement('span', { className: 'ghc-panel-title' }, 'GitHub 连接'),
          React.createElement('button', { type: 'button', className: 'ghc-close', 'aria-label': '关闭', onClick: close }, '\u00d7')),
        error !== null && React.createElement('div', { className: 'ghc-error' }, String(error)),
        loading
          ? React.createElement('div', { className: 'ghc-hint' }, '加载中\u2026')
          : status !== null && status.connected
            ? React.createElement(ConnectedView, { status, onDisconnected: () => setStatus({ connected: false, clientId: null }) })
            : React.createElement(React.Fragment, null,
              status !== null && status.invalidated === true && React.createElement('div', { className: 'ghc-error' }, '原 GitHub 连接已失效（' + (status.message || '令牌无效') + '），请重新连接。'),
              React.createElement(NotConnectedView, {
                rememberedClientId: status !== null && status.clientId ? status.clientId : '',
                onConnected,
              })))
    }

    function NotConnectedView(props) {
      const [tab, setTab] = React.useState('device')
      return React.createElement('div', null,
        React.createElement('div', { className: 'ghc-hint' }, '连接后，AI（DeepSeek 等）即可通过 github_api 工具使用你的 GitHub 账号。'),
        React.createElement('div', { className: 'ghc-tabs', role: 'tablist' },
          React.createElement('button', {
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'device',
            className: 'ghc-tab' + (tab === 'device' ? ' ghc-tab-active' : ''),
            onClick: () => setTab('device'),
          }, '设备流登录（推荐）'),
          React.createElement('button', {
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'pat',
            className: 'ghc-tab' + (tab === 'pat' ? ' ghc-tab-active' : ''),
            onClick: () => setTab('pat'),
          }, '粘贴 Token')),
        tab === 'device'
          ? React.createElement(DeviceFlow, { initialClientId: props.rememberedClientId, onConnected: (u) => props.onConnected(u, 'oauth') })
          : React.createElement(PatForm, { onConnected: (u) => props.onConnected(u, 'pat') }))
    }

    function DeviceFlow(props) {
      const [clientId, setClientId] = React.useState(props.initialClientId || '')
      const [scopes, setScopes] = React.useState('repo gist read:org workflow')
      const [step, setStep] = React.useState('form')
      const [device, setDevice] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const pollTimer = React.useRef(null)

      function stopPolling() {
        if (pollTimer.current !== null) {
          clearTimeout(pollTimer.current)
          pollTimer.current = null
        }
      }
      React.useEffect(() => stopPolling, [])

      function tick(clientIdValue, deviceValue, intervalMs) {
        api(R.devicePoll, { clientId: clientIdValue, deviceCode: deviceValue.deviceCode })
          .then((result) => {
            if (result.status === 'authorized') {
              stopPolling()
              props.onConnected(result.user)
              return
            }
            if (result.status === 'expired' || result.status === 'denied' || result.status === 'error') {
              stopPolling()
              setError(result.message || '连接失败，请重试')
              setStep('form')
              setDevice(null)
              return
            }
            const next = result.slowDown === true ? Math.min(intervalMs + 5000, 15000) : intervalMs
            pollTimer.current = setTimeout(() => tick(clientIdValue, deviceValue, next), next)
          })
          .catch(() => {
            // transient network error: keep waiting until GitHub reports expiry
            pollTimer.current = setTimeout(() => tick(clientIdValue, deviceValue, intervalMs), intervalMs)
          })
      }

      async function start() {
        setBusy(true)
        setError(null)
        try {
          const data = await api(R.deviceStart, { clientId: clientId.trim(), scopes })
          setDevice(data)
          setStep('waiting')
          window.open(data.verificationUri, '_blank', 'noopener')
          pollTimer.current = setTimeout(() => tick(clientId.trim(), data, data.interval * 1000), data.interval * 1000)
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }

      function cancel() {
        stopPolling()
        setDevice(null)
        setStep('form')
        setError(null)
      }

      function copyCode() {
        if (!device) return
        try {
          navigator.clipboard.writeText(device.userCode).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }).catch(() => {})
        } catch {
          /* clipboard unavailable */
        }
      }

      if (step === 'waiting' && device) {
        return React.createElement('div', null,
          React.createElement('div', { className: 'ghc-hint' }, '在 GitHub 授权页面输入下面的验证码：'),
          React.createElement('div', { className: 'ghc-code-row' },
            React.createElement('span', { className: 'ghc-code' }, device.userCode),
            React.createElement('button', { type: 'button', className: 'ghc-btn', onClick: copyCode }, copied ? '已复制' : '复制')),
          React.createElement('div', { className: 'ghc-hint' }, '已尝试自动打开授权页面，若未打开请点击：'),
          React.createElement('a', { className: 'ghc-link', href: device.verificationUri, target: '_blank', rel: 'noopener noreferrer' }, device.verificationUri),
          React.createElement('div', { className: 'ghc-hint' }, '正在自动等待授权\u2026（验证码 ' + Math.max(1, Math.round(device.expiresIn / 60)) + ' 分钟内有效）'),
          React.createElement('button', { type: 'button', className: 'ghc-btn', onClick: cancel }, '取消'))
      }

      return React.createElement('div', null,
        React.createElement('label', { className: 'ghc-field' },
          React.createElement('span', { className: 'ghc-label' }, 'GitHub OAuth App 的 Client ID'),
          React.createElement('input', { type: 'text', className: 'ghc-input', placeholder: '例如 a1b2c3d4e5f6a7b8c9d0 或 Iv1.xxxx', value: clientId, onChange: (e) => setClientId(e.target.value) })),
        React.createElement('a', { className: 'ghc-link', href: 'https://github.com/settings/developers', target: '_blank', rel: 'noopener noreferrer' }, '还没有？去创建一个 OAuth App（无需回调地址）'),
        React.createElement('label', { className: 'ghc-field' },
          React.createElement('span', { className: 'ghc-label' }, '授权范围 scopes（空格分隔）'),
          React.createElement('input', { type: 'text', className: 'ghc-input', value: scopes, onChange: (e) => setScopes(e.target.value) })),
        error !== null && React.createElement('div', { className: 'ghc-error' }, String(error)),
        React.createElement('div', { className: 'ghc-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'ghc-btn ghc-btn-primary ghc-btn-stack',
            disabled: busy,
            onClick: start,
          }, busy
            ? '请求中\u2026'
            : React.createElement(React.Fragment, null,
              React.createElement('span', { className: 'ghc-btn-line' }, '开始'),
              React.createElement('span', { className: 'ghc-btn-line' }, '连接')))))
    }

    function PatForm(props) {
      const [token, setToken] = React.useState('')
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      async function save() {
        setBusy(true)
        setError(null)
        try {
          const result = await api(R.pat, { token })
          props.onConnected(result.user)
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }
      return React.createElement('div', null,
        React.createElement('label', { className: 'ghc-field' },
          React.createElement('span', { className: 'ghc-label' }, 'Personal Access Token'),
          React.createElement('input', {
            type: 'password',
            className: 'ghc-input',
            placeholder: 'ghp_\u2026 或 github_pat_\u2026',
            value: token,
            onChange: (e) => setToken(e.target.value),
            autoComplete: 'new-password',
            name: 'dsh-github-pat-token',
            spellCheck: false,
            autoCapitalize: 'off',
          })),
        React.createElement('div', { className: 'ghc-hint' }, '建议使用 fine-grained PAT，只授予需要的仓库与权限。Token 仅保存在本机 DSH home 下（.dsh-github-connect/auth.json），不会上传到任何服务器。'),
        React.createElement('a', { className: 'ghc-link', href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, '创建 fine-grained Token'),
        error !== null && React.createElement('div', { className: 'ghc-error' }, String(error)),
        React.createElement('div', { className: 'ghc-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'ghc-btn ghc-btn-primary ghc-btn-stack',
            disabled: busy,
            onClick: save,
          }, busy
            ? '验证中\u2026'
            : React.createElement(React.Fragment, null,
              React.createElement('span', { className: 'ghc-btn-line' }, '保存'),
              React.createElement('span', { className: 'ghc-btn-line' }, '并验证')))))
    }

    function ConnectedView(props) {
      const status = props.status
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [confirming, setConfirming] = React.useState(false)
      async function disconnect() {
        if (!confirming) {
          setConfirming(true)
          return
        }
        setBusy(true)
        setError(null)
        try {
          await api(R.disconnect, {})
          setConfirming(false)
          props.onDisconnected()
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }
      const kindLabel = status.kind === 'pat' ? 'Personal Access Token' : 'OAuth 设备流'
      return React.createElement('div', null,
        React.createElement('div', { className: 'ghc-user-line' },
          status.avatarUrl
            ? React.createElement('img', { className: 'ghc-avatar', src: status.avatarUrl, alt: '' })
            : React.createElement('span', { className: 'ghc-avatar ghc-avatar-fallback' }, '\ud83d\udc19'),
          React.createElement('div', { className: 'ghc-user-meta' },
            React.createElement('span', { className: 'ghc-user-name' }, status.login || 'GitHub'),
            React.createElement('span', { className: 'ghc-user-kind' }, kindLabel))),
        React.createElement('div', { className: 'ghc-hint ghc-success' }, '\u2713 已连接 \u2014\u2014 AI 现在可以通过 github_api 工具使用你的 GitHub 账号。'),
        status.scopes && status.scopes.length > 0 && React.createElement('div', { className: 'ghc-chips' },
          status.scopes.map((scope) => React.createElement('span', { key: scope, className: 'ghc-chip' }, scope))),
        status.connectedAt && React.createElement('div', { className: 'ghc-hint' }, '连接时间：' + new Date(status.connectedAt).toLocaleString()),
        status.lastVerifiedAt && React.createElement('div', { className: 'ghc-hint' }, '最近验证：' + new Date(status.lastVerifiedAt).toLocaleString()),
        status.verified === false && status.message && React.createElement('div', { className: 'ghc-hint ghc-warn' }, '（未能在线验证：' + status.message + ' —— 令牌已保留，网络恢复后自动刷新）'),
        error !== null && React.createElement('div', { className: 'ghc-error' }, String(error)),
        React.createElement('div', { className: 'ghc-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'ghc-btn ghc-btn-danger' + (confirming ? ' ghc-btn-confirm' : ''),
            disabled: busy,
            onClick: disconnect,
          }, busy ? '处理中\u2026' : (confirming ? '再点一次确认断开' : '断开连接'))))
    }

    // ── styles ──────────────────────────────────────────────────────────────

    const STYLES = `
/* The panel's own accent. Deliberately NOT the theme's brand color: in the
   official Desktop theme --dsw-alias-brand-primary resolves to near-black
   (the app's own primary buttons are black there), which turned the active
   tab into black-on-black. A plugin-owned surface keeps one fixed accent so
   it reads the same in every theme and skin. */
.ghc-trigger, .ghc-panel { --ghc-accent: #4d6bfe; }
.ghc-trigger { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 8px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3)); background: transparent; color: var(--dsw-alias-label-secondary, #888); cursor: pointer; font-family: inherit; font-size: 12px; line-height: 1; transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
.ghc-trigger:hover { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, #eee); }
.ghc-trigger.ghc-open { border-color: var(--ghc-accent, #4d6bfe); color: var(--dsw-alias-label-primary, #eee); }
.ghc-trigger:focus-visible { outline: 2px solid var(--ghc-accent, #4d6bfe); outline-offset: 1px; }
.ghc-trigger .ghc-icon { width: 14px; height: 14px; flex: none; }
.ghc-trigger-label { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ghc-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-border-l2, rgba(127,127,127,.5)); flex: none; }
.ghc-dot.ghc-dot-on { background: var(--dsw-alias-state-success-primary, #3fb950); }
.ghc-trigger.ghc-connected .ghc-dot { background: var(--dsw-alias-state-success-primary, #3fb950); }
.ghc-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
.ghc-panel { box-sizing: border-box; width: 500px; max-width: calc(100vw - 48px); max-height: min(88vh, 800px); overflow-y: auto; background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #1c1c1f)); border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25)); border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.4); padding: 16px 18px 18px; color: var(--dsw-alias-label-primary, #eee); font-family: inherit; font-size: 13px; line-height: 1.55; text-align: left; }
.ghc-panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ghc-panel-head .ghc-icon { width: 16px; height: 16px; flex: none; color: var(--dsw-alias-label-primary, #eee); }
.ghc-panel-title { font-weight: 600; font-size: 14px; }
.ghc-close { margin-left: auto; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #888); font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 6px; cursor: pointer; font-family: inherit; }
.ghc-close:hover { color: var(--dsw-alias-label-primary, #eee); background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); }
.ghc-hint { color: var(--dsw-alias-label-secondary, #999); font-size: 12px; margin: 6px 0; }
.ghc-success { color: var(--dsw-alias-state-success-primary, #3fb950); }
.ghc-warn { color: var(--dsw-alias-state-warn-primary, #d29922); }
.ghc-error { color: var(--dsw-alias-state-error-primary, #f85149); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f85149) 12%, transparent); border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #f85149) 35%, transparent); border-radius: 8px; padding: 6px 10px; font-size: 12px; margin: 8px 0; }
.ghc-tabs { display: flex; gap: 4px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); border-radius: 9px; padding: 3px; margin: 10px 0; }
/* Selected-tab styling is theme-native by inversion: the pill uses the
   theme's primary label color as its fill and the theme's base surface color
   as its text. Light themes therefore get the same dark pill + light text the
   app's own primary buttons use, dark themes get the reverse, and no skin or
   theme change can produce an unreadable pair. */
.ghc-tab { flex: 1; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #888); font-family: inherit; font-size: 12px; font-weight: 500; padding: 5px 8px; border-radius: 7px; cursor: pointer; }
.ghc-tab:hover:not(.ghc-tab-active) { background: color-mix(in srgb, var(--dsw-alias-label-primary, #111) 10%, transparent); color: var(--dsw-alias-label-primary, #111); }
.ghc-tab-active { background: var(--dsw-alias-label-primary, #111); color: var(--dsw-alias-bg-base, #fff); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.ghc-field { display: block; margin: 10px 0 4px; }
.ghc-label { display: block; color: var(--dsw-alias-label-secondary, #999); font-size: 12px; margin-bottom: 4px; }
.ghc-input { box-sizing: border-box; width: 100%; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25)); border-radius: 8px; color: var(--dsw-alias-label-primary, #eee); font-family: inherit; font-size: 13px; padding: 7px 10px; outline: none; }
.ghc-input:focus { border-color: var(--ghc-accent, #4d6bfe); }
.ghc-btn { flex: none; white-space: nowrap; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.45)); background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, #eee); font-family: inherit; font-size: 12px; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
.ghc-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-1, #26262b); }
.ghc-btn:disabled { opacity: .55; cursor: default; }
.ghc-btn-primary { background: var(--dsw-alias-brand-primary, #4d6bfe); border-color: var(--dsw-alias-brand-primary, #4d6bfe); color: #fff; }
.ghc-btn-stack { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.25; padding: 6px 12px; min-width: max-content; }
.ghc-btn-line { white-space: nowrap; }
.ghc-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 85%, #000); border-color: transparent; }
.ghc-btn-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f85149) 50%, transparent); color: var(--dsw-alias-state-error-primary, #f85149); background: transparent; }
.ghc-btn-danger.ghc-btn-confirm { background: var(--dsw-alias-state-error-primary, #f85149); color: #fff; }
.ghc-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.ghc-link { display: inline-block; color: var(--ghc-accent, #4d6bfe); font-size: 12px; margin: 2px 0; text-decoration: none; }
.ghc-link:hover { text-decoration: underline; }
.ghc-code-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.ghc-code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 22px; font-weight: 700; letter-spacing: 6px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); border: 1px dashed var(--dsw-alias-border-l2, rgba(127,127,127,.45)); border-radius: 10px; padding: 8px 14px; }
.ghc-user-line { display: flex; align-items: center; gap: 10px; }
.ghc-avatar { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25)); }
.ghc-avatar-fallback { display: inline-flex; align-items: center; justify-content: center; font-size: 20px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); }
.ghc-user-meta { display: flex; flex-direction: column; min-width: 0; }
.ghc-user-name { font-weight: 600; font-size: 14px; }
.ghc-user-kind { color: var(--dsw-alias-label-secondary, #999); font-size: 12px; }
.ghc-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.ghc-chip { font-size: 11px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25)); border-radius: 999px; padding: 2px 8px; color: var(--dsw-alias-label-secondary, #999); }

/* Skin-proofing: this panel is a plugin-owned surface. Skinned hosts
   (e.g. whale-girl skins) restyle button/input inside the composer
   card, so the plugin's own colors are declared with !important.
   Idle tabs stay flat (transparent) so no host button surface leaks
   through; the selected tab keeps the inverted theme pair. */
.ghc-tab { background: transparent !important; color: var(--dsw-alias-label-secondary, #888) !important; }
.ghc-tab:hover:not(.ghc-tab-active) { background: color-mix(in srgb, var(--dsw-alias-label-primary, #111) 10%, transparent) !important; color: var(--dsw-alias-label-primary, #111) !important; }
.ghc-tab-active { background: var(--dsw-alias-label-primary, #111) !important; color: var(--dsw-alias-bg-base, #fff) !important; border: 0 !important; box-shadow: 0 1px 3px rgba(0,0,0,.18) !important; }
.ghc-panel { background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #1c1c1f)) !important; color: var(--dsw-alias-label-primary, #eee) !important; }
.ghc-input { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)) !important; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25)) !important; color: var(--dsw-alias-label-primary, #eee) !important; }
.ghc-btn { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)) !important; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.45)) !important; color: var(--dsw-alias-label-primary, #eee) !important; }
.ghc-btn-stack { display: inline-flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; }
.ghc-btn-primary { background: var(--dsw-alias-brand-primary, #4d6bfe) !important; border-color: var(--dsw-alias-brand-primary, #4d6bfe) !important; color: #fff !important; }
.ghc-btn-danger { background: transparent !important; border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #f85149) 50%, transparent) !important; color: var(--dsw-alias-state-error-primary, #f85149) !important; }
.ghc-link { color: var(--ghc-accent, #4d6bfe) !important; }
.ghc-close { color: var(--dsw-alias-label-secondary, #888) !important; background: transparent !important; }
.ghc-trigger { background: transparent !important; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3)) !important; color: var(--dsw-alias-label-secondary, #888) !important; }
.ghc-trigger:hover { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)) !important; color: var(--dsw-alias-label-primary, #eee) !important; }
`

    // ── plugin entry ───────────────────────────────────────────────────────

    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.setAttribute('data-plugin', NS)
        tag.textContent = STYLES
        document.head.appendChild(tag)
        return () => {
          if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
        }
      }, NS + ': styles')

      ctx.slots.inject('conversation.input.left', () => {
        return ctx.slots.register(
          { name: 'conversation.input.left', id: 'github-connect', order: 90, label: () => 'GitHub' },
          (props) => React.createElement(LeftButton, props))
      })

      ctx.slots.inject('conversation.input.overlay', () => {
        return ctx.slots.register(
          { name: 'conversation.input.overlay', id: 'github-connect-panel', order: 25, label: () => 'GitHub 连接' },
          (props) => React.createElement(Panel, props))
      })
    }

    module.exports = { name: NS, inject: ['slots'], apply }
    return module.exports
  },
})
