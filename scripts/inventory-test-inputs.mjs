import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
export function saveInventoryInputs(run) {
  const files=['scripts/run-inventory-local-db.mjs','scripts/test-inventory-concurrency.mjs','scripts/test-inventory-reports.ts',
    'supabase/tests/inventory_k1_regression.sql','src/lib/vatReportAggregation.ts','src/lib/vatReportService.ts',
    'src/lib/accountingService.ts','src/lib/transactionHistoryLoader.ts','src/components/FixedAssetsPanel.tsx','src/components/TransactionTable.tsx']
  const manifest=JSON.parse(readFileSync(new URL('../docs/reviews/INVENTORY-LOCAL-MIGRATIONS.json',import.meta.url)))
  files.push(...manifest.files.map(f=>f.file))
  run.save('inventory-inputs.json',{files:files.map(file=>({file,sha256:createHash('sha256')
    .update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex')}))})
}
