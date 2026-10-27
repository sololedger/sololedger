import { ESLint } from 'eslint'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const eslint = new ESLint()
const base = 'fff33fc4025a7ccee830e89608b97a04a3defdbf'
const changed = ['src/app/page.tsx', 'src/hooks/useAuth.ts', 'src/components/Layout.tsx', 'src/components/NEDeclarationGuide.tsx', 'src/components/ProfileSettings.tsx', 'src/components/TransactionForm.tsx', 'scripts/test-ne-declaration-guide.mjs', 'tests/e2e/public-auth.spec.ts']
const added = ['src/components/FAQ.tsx', 'src/lib/helpContent.ts', 'src/lib/helpNavigation.ts', 'src/hooks/useHelpNavigation.ts', 'scripts/test-help-center.ts', 'scripts/test-help-center-browser.mjs', 'scripts/check-help-center-lint.mjs']
const diagnostics = result => result.messages.map(m => `${m.severity}:${m.ruleId}:${m.message.split('\n')[0]}`).sort()
const results = []
for (const file of [...changed, ...added]) {
  const [current] = await eslint.lintFiles([file])
  const baseline = changed.includes(file) ? diagnostics((await eslint.lintText(execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }), { filePath: file }))[0]) : []
  const remaining = [...baseline]
  for (const message of diagnostics(current)) {
    const index = remaining.indexOf(message)
    assert(index >= 0, file + ' introduces lint diagnostic: ' + message)
    remaining.splice(index, 1)
  }
  results.push({file,baseline:baseline.length,current:current.messages.length,noNewDiagnostics:true})
}
mkdirSync('coverage/kan102-help', {recursive:true})
writeFileSync('coverage/kan102-help/lint.json', JSON.stringify({status:'PASS_NO_NEW_DIAGNOSTICS',base,results}, null, 2))
console.log('PASS KAN-102 lint: no new diagnostics; pre-existing diagnostics retained in evidence')
