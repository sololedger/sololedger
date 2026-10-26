import { ESLint } from 'eslint'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// Existing compiler diagnostics contain source excerpts with shifted line numbers.
// Compare rule + first diagnostic line, preserving counts, rather than their locations.
const eslint = new ESLint()
const base = '53b9c828eed71d0be17043e4aaf7b95d99d0ad35'
const files = ['src/components/YearEndGuide.tsx', 'src/components/Layout.tsx', 'src/app/page.tsx', 'scripts/test-year-end-guide.mjs', 'scripts/check-year-end-guide-lint.mjs']
const errors = result => result.messages.filter(m => m.severity === 2).map(m => m.ruleId + ': ' + m.message.split('\n')[0]).sort()
const results = []
for (const file of files) {
  const [current] = await eslint.lintFiles([file])
  let baseline = []
  if (['src/components/Layout.tsx', 'src/app/page.tsx'].includes(file)) {
    const source = execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' })
    const [before] = await eslint.lintText(source, { filePath: file })
    baseline = errors(before)
  }
  const remaining = [...baseline]
  for (const error of errors(current)) {
    const index = remaining.indexOf(error)
    assert(index >= 0, file + ' introduces lint error: ' + error)
    remaining.splice(index, 1)
  }
  results.push({ file, errors: current.errorCount, baselineErrors: baseline.length, warnings: current.warningCount, noNewErrors: true })
}
mkdirSync('coverage/kan99-evidence', { recursive: true })
writeFileSync('coverage/kan99-evidence/lint-comparison.json', JSON.stringify({ status: 'PASS_NO_NEW_ERRORS', base, results }, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
