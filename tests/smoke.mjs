/**
 * dsh-github-connect — host-half smoke test (no framework needed).
 *
 * Run from the plugin root:  node tests/smoke.mjs
 * Covers: route registration, same-origin guard, route wiring, the
 * github_api tool registration, the no-token execution path, and the
 * portable network layer (proxy resolution / NO_PROXY / CA / dispatcher).
 */
import assert from 'node:assert/strict'
import { apply, name } from '../lib/index.js'
import {
  bypassesProxy,
  dispatcherFor,
  envProxy,
  normalizeProxyUrl,
  parseNoProxy,
  resolveProxy,
  systemCaPem,
} from '../lib/net.js'

const waiting = {}
const ctx = {
  inject(services, callback) {
    waiting[services.join('|')] = callback
  },
}

apply(ctx, {})
assert.equal(name, 'dsh-github-connect')
console.log('PASS  plugin entry: name exported, apply() ran')

let captured = null
const webServerCtx = {
  webServer: {
    register(route) {
      captured = route
      return () => {}
    },
  },
  effect() {},
}
assert.ok(waiting['webServer'], 'webServer inject declared')
waiting['webServer'](webServerCtx)
assert.ok(captured, 'route registered')
assert.equal(captured.kind, 'prefix')
assert.equal(captured.path, '/dsh-github')
console.log('PASS  http routes: prefix /dsh-github registered')

let tool = null
const sections = []
const agentCtx = {
  tools: { register(definition) { tool = definition } },
  systemPrompt: { section(entry) { sections.push(entry) } },
}
assert.ok(waiting['tools|systemPrompt'], 'tools+systemPrompt inject declared')
waiting['tools|systemPrompt'](agentCtx)
assert.ok(tool, 'github_api registered')
assert.equal(tool.name, 'github_api')
assert.ok(sections.some((entry) => entry.name === 'tool:github_api'), 'prompt section registered')
console.log('PASS  agent plane: github_api tool + prompt section registered')

class FakeResponse {
  constructor() {
    this.statusCode = 0
    this.headers = {}
    this.chunks = []
  }

  writeHead(status, headers) {
    this.statusCode = status
    Object.assign(this.headers, headers)
  }

  end(body) {
    if (body !== undefined) this.chunks.push(Buffer.from(body))
    this.body = Buffer.concat(this.chunks).toString('utf8')
  }
}

function makeRequest(method, path, { origin, body } = {}) {
  const headers = { host: '127.0.0.1:3080' }
  if (origin !== undefined) headers.origin = origin
  return {
    method,
    url: path,
    headers,
    [Symbol.asyncIterator]: async function* () {
      if (body !== undefined) yield Buffer.from(body)
    },
  }
}

async function call(method, path, opts = {}) {
  const response = new FakeResponse()
  await captured.handler(makeRequest(method, path, opts), response)
  let json = null
  try {
    json = JSON.parse(response.body)
  } catch {
    /* keep null */
  }
  return { status: response.statusCode, json }
}

{
  const { status, json } = await call('GET', '/dsh-github/status')
  assert.equal(status, 200)
  assert.equal(typeof json.connected, 'boolean')
  console.log('PASS  GET /dsh-github/status -> connected=' + json.connected)
}

// The smoke test must never touch a live credential file: some cases are
// skipped while a connection exists (they would mutate or drop it).
const initiallyConnected = (await call('GET', '/dsh-github/status')).json.connected === true

{
  // The verify route re-validates the stored token against GitHub. It is
  // read-only for the connection itself (only refreshes lastVerifiedAt on
  // success, clears only on a definitive 401).
  const { status, json } = await call('POST', '/dsh-github/verify', {
    body: JSON.stringify({}),
  })
  assert.equal(status, 200)
  assert.equal(typeof json.connected, 'boolean')
  if (json.connected === true) {
    assert.equal(json.verified, true)
    assert.equal(typeof json.lastVerifiedAt, 'string')
    console.log('PASS  POST /dsh-github/verify -> re-validated, lastVerifiedAt=' + json.lastVerifiedAt)
  } else {
    assert.equal(json.lastVerifiedAt, null)
    console.log('PASS  POST /dsh-github/verify -> not connected (lastVerifiedAt=' + json.lastVerifiedAt + ')')
  }
}

{
  const { status, json } = await call('GET', '/dsh-github/does-not-exist')
  assert.equal(status, 404)
  console.log('PASS  unknown route -> 404')
}

{
  const { status } = await call('GET', '/dsh-github/pat')
  assert.equal(status, 404)
  console.log('PASS  wrong method on mutation route -> 404')
}

{
  const { status, json } = await call('POST', '/dsh-github/device/start', {
    body: JSON.stringify({ clientId: '', scopes: 'repo' }),
  })
  assert.equal(status, 200)
  assert.ok(typeof json.error === 'string' && json.error.length > 0)
  console.log('PASS  device/start with empty clientId -> error message')
}

{
  const { status, json } = await call('POST', '/dsh-github/device/start', {
    body: JSON.stringify({ clientId: 'abc', scopes: 'repo' }),
  })
  assert.equal(status, 200)
  assert.ok(typeof json.error === 'string')
  console.log('PASS  device/start with malformed clientId -> error message')
}

{
  const { status, json } = await call('POST', '/dsh-github/pat', {
    body: JSON.stringify({ token: 'short' }),
  })
  assert.equal(status, 200)
  assert.ok(typeof json.error === 'string')
  console.log('PASS  pat route rejects a too-short token without network')
}

{
  // Real round trip with a well-formed but fake token. GitHub must answer
  // 401 and the route must surface the diagnostics, not a generic message.
  // On a host without the system CA (NODE_OPTIONS=--use-system-ca) the TLS
  // handshake fails first — the route must report THAT honestly instead.
  const { status, json } = await call('POST', '/dsh-github/pat', {
    body: JSON.stringify({ token: 'ghp_fake0123456789fake0123456789fake00' }),
  })
  assert.equal(status, 200)
  assert.ok(typeof json.error === 'string', 'error field present')
  assert.ok(json.error.includes('Bad credentials') || json.error.includes('无法连接 GitHub API'),
    'diagnostics surface the real cause: ' + json.error.slice(0, 80))
  console.log('PASS  pat route surfaces real diagnostics: ' + json.error.slice(0, 70) + '…')
}

{
  const { status, json } = await call('POST', '/dsh-github/disconnect', {
    origin: 'http://evil.example',
  })
  assert.equal(status, 403)
  console.log('PASS  cross-origin mutation -> 403 (state untouched)')
}

if (!initiallyConnected) {
  const { status, json } = await call('POST', '/dsh-github/disconnect', {
    body: JSON.stringify({}),
  })
  assert.equal(status, 200)
  assert.equal(json.connected, false)
  console.log('PASS  disconnect (same-origin) -> ok')
} else {
  console.log('SKIP  plain disconnect (would drop the live connection)')
}

if (!initiallyConnected) {
  const result = await tool.execute({ method: 'GET', path: '/user' }, {})
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.ok(String(result.error).includes('GitHub'))
  console.log('PASS  github_api without a token -> structured 401')
} else {
  console.log('SKIP  github_api no-token path (a connection is live)')
}

if (!initiallyConnected) {
  // Real round trip to github.com with a well-formed but fake client id.
  // Either github.com rejects it (error field) or, in the unlikely event it
  // is a live id, a device flow begins (userCode field). Both prove the
  // route plumbing works end to end.
  const { status, json } = await call('POST', '/dsh-github/device/start', {
    body: JSON.stringify({ clientId: '0123456789abcdef0123', scopes: 'repo' }),
  })
  assert.equal(status, 200)
  assert.ok(typeof json.error === 'string' || typeof json.userCode === 'string')
  console.log('PASS  device/start round trip to github.com handled: ' + (json.error ? 'rejected (expected for fake id)' : 'flow started'))
} else {
  console.log('SKIP  device/start round trip (would overwrite the remembered client id)')
}

// ── portable network layer ─────────────────────────────────────────────────

{
  assert.deepEqual(parseNoProxy('localhost, 127.0.0.1 , .internal'), ['localhost', '127.0.0.1', '.internal'])
  assert.deepEqual(parseNoProxy(''), [])
  assert.equal(bypassesProxy('api.github.com', ['localhost']), false)
  assert.equal(bypassesProxy('api.github.com', ['api.github.com']), true)
  assert.equal(bypassesProxy('api.github.com', ['api.github.com:443']), true)
  assert.equal(bypassesProxy('api.github.com', ['.github.com']), true)
  assert.equal(bypassesProxy('github.com', ['.github.com']), true)
  assert.equal(bypassesProxy('evil.com', ['.github.com']), false)
  assert.equal(bypassesProxy('anything', ['*']), true)
  console.log('PASS  NO_PROXY parsing and host matching')
}

{
  assert.equal(normalizeProxyUrl('127.0.0.1:7897'), 'http://127.0.0.1:7897')
  assert.equal(normalizeProxyUrl('http://127.0.0.1:7897'), 'http://127.0.0.1:7897')
  assert.equal(normalizeProxyUrl('direct'), undefined)
  assert.equal(normalizeProxyUrl(''), undefined)
  assert.equal(normalizeProxyUrl(undefined), undefined)
  console.log('PASS  proxy url normalization')
}

{
  const saved = {
    https: process.env.HTTPS_PROXY,
    no: process.env.NO_PROXY,
  }
  try {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890'
    process.env.NO_PROXY = 'localhost,.internal'
    const env = envProxy()
    assert.equal(env.https, 'http://127.0.0.1:7890')
    assert.deepEqual(env.noProxy, ['localhost', '.internal'])
    assert.equal(await resolveProxy('api.github.com', {}), 'http://127.0.0.1:7890')
    assert.equal(await resolveProxy('github.com', {}), 'http://127.0.0.1:7890')
    assert.equal(await resolveProxy('host.internal', {}), undefined) // NO_PROXY .suffix
    assert.equal(await resolveProxy('localhost', {}), undefined) // default + env NO_PROXY
    assert.equal(await resolveProxy('api.github.com', { proxy: 'direct' }), undefined)
    assert.equal(await resolveProxy('api.github.com', { proxy: 'proxy.example:8080' }), 'http://proxy.example:8080')
  } finally {
    if (saved.https === undefined) delete process.env.HTTPS_PROXY
    else process.env.HTTPS_PROXY = saved.https
    if (saved.no === undefined) delete process.env.NO_PROXY
    else process.env.NO_PROXY = saved.no
  }
  console.log('PASS  proxy resolution: env > config > direct, NO_PROXY honored')
}

{
  const ca = await systemCaPem()
  assert.ok(ca === undefined || (typeof ca === 'string' && ca.includes('BEGIN CERTIFICATE')))
  if (ca !== undefined) console.log('PASS  system CA bundle loaded (' + ca.length + ' bytes)')
  else console.log('PASS  system CA bundle unavailable — falling back to Node defaults (expected on this platform)')
}

{
  const dispatcher = await dispatcherFor('api.github.com', {})
  assert.ok(dispatcher === undefined || typeof dispatcher === 'object')
  console.log('PASS  dispatcherFor returns a usable dispatcher: ' + (dispatcher === undefined ? 'global fetch' : dispatcher.constructor.name))
}

console.log('\nAll smoke tests passed.')
