import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

// Run the real service and shared paging helper against a synthetic transport.
// No environment files, Supabase network or credentials are used.
const owner = 'synthetic-owner'
let rows = [], mode = 'normal', pages = 0, sent, profileFailure = false
const fixture = {
  auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
  from(table) {
    assert(['fixed_assets','fixed_asset_depreciation_runs'].includes(table))
    const filters = {}
    return {
      select(_columns, options) { assert.equal(options.count, 'exact'); return this },
      eq(column, value) { filters[column] = value; return this },
      lte(column, value) { filters[column] = value; return this },
      order() { return this },
      async range(from, to) {
        pages++
        assert.equal(filters.user_id, owner); assert.equal(filters.fiscal_year, 2026)
        return { data: mode === 'truncated' ? [] : rows.slice(from, to + 1), error: null,
          count: mode === 'no-count' ? null : rows.length }
      },
    }
  },
}
globalThis.__kan62Fixture = fixture
globalThis.__kan62VerifiedRpc = async () => {
  if (profileFailure) throw Error('synthetic unverified profile')
  return { rpc: async (name, args) => {
    sent = { name, args }
    return { data: { success: true, asset_id: 'synthetic-asset', transaction_id: 'synthetic-tx',
      expected: true, threshold_basis_amount: args.p_payload.expected_threshold_basis_amount }, error: null }
  } }
}
const bundle = await build({ stdin: { contents: "export { getFixedAssets, getFixedAssetDepreciationRuns, bookFixedAssetAcquisition } from './src/lib/accountingService.ts'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'synthetic-only', setup(b) {
    b.onResolve({ filter: /(?:supabaseClient|profileWriteGuard)(?:\.ts)?$/ }, args => ({ path: args.path, namespace: 'synthetic' }))
    b.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: args.path.includes('supabaseClient')
      ? 'export const supabase = globalThis.__kan62Fixture'
      : 'export const verifiedProfileRpc = globalThis.__kan62VerifiedRpc' }))
  } }] })
const output = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), output, output.exports)
const service = output.exports
const row = i => ({ id: String(i), user_id: owner, fiscal_year: 2026, acquisition_date: '2026-01-01',
  name: 'Synthetic asset', taxable_base_amount: 10000, supplier_vat_amount: 2500, deductible_vat_amount: 0,
  non_deductible_vat_amount: 2500, expensed_amount: 12500, capitalized_amount: 0 })
rows = Array.from({ length: 1001 }, (_, i) => row(i))
assert.equal((await service.getFixedAssets(2026)).length, 1001)
assert.equal(pages, 2, 'register must page beyond former 200-row limit')
rows = [{ ...row(0), audit_snapshot: { rule: { thresholdBasisDefinition: 'excluding_supplier_vat' }, facts: { plannedGroupBasisAmount: 30000 } } }]
assert.equal((await service.getFixedAssets(2026))[0].plannedGroupBasisAmount, 30000)
rows = [{ ...row(0), audit_snapshot: { facts: { plannedGroupBasisAmount: 30000 } } }]
assert.equal((await service.getFixedAssets(2026))[0].groupPlanRequiresReview, true)
mode = 'no-count'; await assert.rejects(service.getFixedAssets(2026), /exact row count/)
mode = 'truncated'; await assert.rejects(service.getFixedAssets(2026), /paging stopped/)
mode = 'normal'; rows = [{ ...row(0), user_id: 'other-owner' }]
await assert.rejects(service.getFixedAssets(2026), /användaren och året/)
rows = [{ ...row(0), fiscal_year: 2027 }]
await assert.rejects(service.getFixedAssets(2026), /användaren och året/)
rows = [row(0), row(0)]; await assert.rejects(service.getFixedAssets(2026), /användaren och året/)
const input = { date: '2026-01-01', description: 'Synthetic purchase', supplierCountry: 'SE',
  idempotencyKey: 'synthetic-attempt', paymentAccountRole: 'business_payment_account',
  grossAmount: 35000, vatRate: 25, vatDeductionEntitlement: 'none', connectionAssessment: 'standalone',
  thresholdBasisAmount: 28000, expectedPriorAssetIds: [], expectedReclassificationAmount: 0 }
await service.bookFixedAssetAcquisition(input)
assert.equal(sent.name, 'book_fixed_asset_acquisition_atomic')
assert.equal(sent.args.p_payload.booking_contract_version, 'kan62-rule-contract-v1')
assert.equal(sent.args.p_payload.expected_threshold_basis_amount, 28000)
assert.equal(sent.args.p_payload.gross_amount, 35000)
assert.equal(sent.args.p_payload.vat_rate, 25)
assert.equal('supplier_vat_amount' in sent.args.p_payload, false)
assert.deepEqual(sent.args.p_payload.expected_prior_asset_ids, [])
profileFailure = true; sent = null
await assert.rejects(service.bookFixedAssetAcquisition(input), /unverified profile/)
assert.equal(sent, null)
profileFailure=false;mode='normal';pages=0
rows=Array.from({length:1001},(_,i)=>({...row(i),basis_amount:100000,depreciation_amount:30000,method:'k1_main_rule_30_percent'}))
assert.equal((await service.getFixedAssetDepreciationRuns(2026)).length,1001)
assert.equal(pages,2,'annual history is complete beyond the former 50-run cap')
rows=[{...rows[0],user_id:'other-owner'}]
await assert.rejects(service.getFixedAssetDepreciationRuns(2026),/användaren och året/)
delete globalThis.__kan62Fixture; delete globalThis.__kan62VerifiedRpc
console.log('KAN-62 actual service: complete paging, owner/year checks, profile guard and RPC preview contract PASS')
