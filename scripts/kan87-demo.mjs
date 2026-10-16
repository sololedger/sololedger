// Local-only manual acceptance harness. Not imported by src/ or a Next route.
// Reuses the exact synthetic entry point from the existing component regression.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

const root = fileURLToPath(new URL('../', import.meta.url))
const test = await readFile(path.join(root, 'scripts/test-transaction-presentation-ui.mjs'), 'utf8')
const fixture = test.match(/const fixture = `([\s\S]*?)`\r?\nconst bundle =/)
assert.ok(fixture, 'The tested synthetic entry point changed; review instead of guessing')
const result = await build({
  stdin: { contents: fixture[1], resolveDir: root, loader: 'tsx' },
  tsconfig: path.join(root, 'tsconfig.json'), bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'no-live-storage', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'no-live-storage', namespace: 'demo' }))
    builder.onLoad({ filter: /.*/, namespace: 'demo' }, () => ({ contents: `
      export const supabase={storage:{from:bucket=>({createSignedUrl:async(file,ttl)=>{
        window.fixtureCalls.push(['synthetic-attachment',bucket,file,ttl]);
        document.getElementById('demo-status').textContent='Syntetisk bilaga: ingen fil eller databas öppnas i demonstrationen.';
        return {data:{signedUrl:'about:blank'}};
      }})}}` }))
  } }],
})
const styles = (await readFile(path.join(root, 'src/app/globals.css'), 'utf8')).replace('@import "tailwindcss";',
  '@import "tailwindcss" source(none);\n@source "./src/components/TransactionTable.tsx";\n@source "./src/components/AttachmentTransactionGroup.tsx";\n@source "./src/components/TransactionPresentation.tsx";')
const css = await postcss([tailwindcss()]).process(styles, { from: path.join(root, 'kan87-demo.css') })
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"
const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}"><title>KAN-87 – syntetisk lokal demonstration</title><style>${css.css}</style></head>
<body><main class="mx-auto max-w-7xl p-4"><header class="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-gray-800">
<h1 class="text-xl font-bold">KAN-87 – syntetisk lokal demonstration</h1>
<p>Endast på denna dator. Verkliga UI-komponenter och presentationsregler, påhittade data. Ingen inloggning, databas eller riktig bilaga.</p>
<ol class="ml-5 mt-3 list-decimal space-y-1 text-sm"><li>Kontrollera fyra ”Omfört 285 kr” med Bokföringsrättelse och Ingen ny bankbetalning.</li>
<li>Kontrollera fem gröna ”+57 kr” och Inbetalning till bank samt fem EU-tjänstemånader.</li>
<li>Sök Adobe: 19 av 24 poster. Öppna Visa originalbeskrivning och jämför med journalens konton.</li>
<li>Rensa sökningen, aktivera gruppering och expandera de 15 verifikationerna. Prova även mobilbredd.</li></ol>
<p id="demo-status" role="status" class="mt-3 text-sm">Bilage- och åtgärdsknappar är ofarliga testkopplingar; de sparar inget.</p></header><div id="root"></div></main>
<script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
const output = path.join(root, 'test-results/kan87-demo')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'index.html'), html)
if (process.argv.includes('--build-only')) {
  console.log('KAN-87 local-only synthetic demo built: test-results/kan87-demo/index.html')
} else {
  const server = createServer((request, response) => {
    if (!['/', '/index.html'].includes(request.url) || request.method !== 'GET') {
      response.writeHead(404); response.end(); return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': csp })
    response.end(html)
  })
  server.listen(3097, '127.0.0.1', () => console.log('KAN-87 synthetic local demo: http://127.0.0.1:3097 (Ctrl+C stops it)'))
}
