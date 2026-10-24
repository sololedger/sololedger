// Offline transport regression: actual client, synthetic session/responses only.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'
const token = 'synthetic-access-token'
const originalFetch = globalThis.fetch
const originalSession = globalThis.__kan100ClientSession
const calls = []
let reply
let sessionCalls = 0
let sessionMode = 'valid'
const bundle = await build({
  stdin: {
    contents: "export * from './src/lib/declarationArchiveClient'; export {emptyDeclarationCommand} from './src/lib/declarationArchiveView'",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'synthetic-session', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'session', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: 'export const supabase={auth:{getSession:()=>globalThis.__kan100ClientSession()}}',
    }))
  } }],
})
const mod = { exports: {} }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url))
const api = mod.exports
function reset(response) {
  calls.length = 0
  sessionCalls = 0
  sessionMode = 'valid'
  reply = response
}
function transport(expectedPath, method = 'GET') {
  assert.equal(calls.length, 1)
  const { url, init } = calls[0]
  assert.equal(url, '/api/declaration-archive' + expectedPath)
  assert.equal(init.credentials, 'same-origin', 'Own API must retain same-origin platform access cookies')
  assert.equal(init.headers.Authorization, 'Bearer ' + token)
  assert.equal(init.cache, 'no-store')
  assert.equal(init.method ?? 'GET', method)
  assert(init.signal instanceof AbortSignal)
  assert.equal(init.headers['Content-Type'], method === 'POST' ? 'application/json' : undefined)
}
const errorIs = (status, code, uncertain) => error => {
  assert.equal(error.status, status)
  assert.equal(error.code, code)
  assert.equal(Boolean(error.uncertain), uncertain)
  return true
}
try {
  globalThis.__kan100ClientSession = async () => {
    sessionCalls++
    if (sessionMode === 'expired') return { data: { session: null }, error: null }
    return { data: { session: { user: { id: sessionMode === 'changed' && sessionCalls > 1 ? other : owner }, access_token: token } }, error: null }
  }
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    if (reply instanceof Error) throw reply
    return reply
  }

  reset(Response.json({ owner, versions: [] }))
  assert.deepEqual(await api.loadDeclarationIndex(owner), [])
  transport('?view=index')

  reset(Response.json({ owner, version: { id } }))
  assert.equal((await api.loadDeclarationVersion(owner, id)).id, id)
  transport('?view=version&id=' + id)

  reset(Response.json({ owner, preview: { income_year: 2026 } }))
  assert.equal((await api.loadDeclarationPreview(owner, 2026)).income_year, 2026)
  transport('?view=preview&year=2026')

  reset(new Response('<!doctype html><p>Synthetic export</p>'))
  assert.match(await api.loadDeclarationExport(owner, id), /Synthetic export/)
  transport('?view=export&id=' + id)

  const command = api.emptyDeclarationCommand(2026)
  reset(Response.json({ owner, receipt: { id, revision_no: 1, status: 'saved' } }))
  assert.equal((await api.submitDeclarationVersion(owner, id, command)).id, id)
  transport('', 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), { request_id: id, command })

  reset(Response.json({ error: 'Logga in igen.', code: 'unauthorized', uncertain: false }, { status: 401 }))
  await assert.rejects(api.loadDeclarationIndex(owner), errorIs(401, 'unauthorized', false))
  transport('?view=index')

  reset(Response.json({ error: 'Underlaget kunde inte läsas.', code: 'unavailable', uncertain: false }, { status: 503 }))
  await assert.rejects(api.loadDeclarationIndex(owner), errorIs(503, 'unavailable', false))

  reset(new Response('<p>Proxy failure</p>', { status: 502 }))
  await assert.rejects(api.loadDeclarationIndex(owner), error => {
    errorIs(502, 'unavailable', false)(error)
    assert.equal(error.message, 'Arkivet kunde inte läsas.')
    return true
  })

  reset(new Response('not JSON'))
  await assert.rejects(api.loadDeclarationIndex(owner), errorIs(503, 'uncertain', false))

  reset(new TypeError('Synthetic network/CORS failure'))
  await assert.rejects(api.loadDeclarationIndex(owner), error => {
    errorIs(503, 'unavailable', false)(error)
    assert.equal(error.message, 'Historiken kunde inte hämtas.')
    return true
  })

  reset(new TypeError('Synthetic lost save response'))
  await assert.rejects(api.submitDeclarationVersion(owner, id, command), errorIs(503, 'uncertain', true))
  transport('', 'POST')

  reset(Response.json({ owner: other, versions: [] }))
  await assert.rejects(api.loadDeclarationIndex(owner), errorIs(403, 'forbidden', false))

  reset(Response.json({ owner, versions: [] }))
  sessionMode = 'expired'
  await assert.rejects(api.loadDeclarationIndex(owner), errorIs(401, 'unauthorized', false))
  assert.equal(calls.length, 0)

  reset(Response.json({ owner, versions: [] }))
  sessionMode = 'changed'
  await assert.rejects(api.loadDeclarationIndex(owner), errorIs(401, 'unauthorized', false))

  console.log('PASS archive client: same-origin cookies on index/version/preview/export/save; bearer and request identity preserved; empty success, API 401/503, proxy/JSON/network errors, uncertain saves and owner/session isolation remain distinct. Offline only.')
} finally {
  globalThis.fetch = originalFetch
  if (originalSession === undefined) delete globalThis.__kan100ClientSession
  else globalThis.__kan100ClientSession = originalSession
}
