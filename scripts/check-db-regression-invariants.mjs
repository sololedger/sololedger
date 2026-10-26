import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationDir = 'supabase/migrations'
const repairMigration =
  '20261009203900_kan56_kan57_db_regression_repair.sql'
const customerInvoiceBookingDeleteContextMigration =
  '20261009220552_kan56_customer_invoice_booking_delete_context.sql'
const receiptDeletionMigration = '20261015121000_kan74_sie_receipt_deletion.sql'
const neMigration = '20261017122027_kan88_ne_sales_classification.sql'
const neSource = readFileSync(join(migrationDir, neMigration), 'utf8')
const receiptDeletion = readFileSync(join('supabase/migrations', receiptDeletionMigration), 'utf8')
const edgeFunctionPath = 'supabase/functions/delete-user/index.ts'
const adminDryRunPath = 'src/lib/adminDeleteDryRun.ts'
const lifecyclePostcheckPath = 'scripts/check-admin-delete-lifecycle-postcheck.mjs'

const failures = []

function fail(message) {
  failures.push(message)
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    fail(`${label} saknar ${needle}`)
  }
}

function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    fail(`${label} innehaller forbjudet monster ${needle}`)
  }
}

function latestMigrationTouching(pattern) {
  return readdirSync(migrationDir)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .filter(name => pattern.test(read(join(migrationDir, name))))
    .at(-1)
}

const repair = read(join(migrationDir, repairMigration))
const customerInvoiceBookingDeleteContextRepair = read(
  join(migrationDir, customerInvoiceBookingDeleteContextMigration),
)
const edge = read(edgeFunctionPath)
const adminDryRun = read(adminDryRunPath)
const lifecyclePostcheck = read(lifecyclePostcheckPath)

const latestCriticalDefinitions = {
  delete_user_data_atomic: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.delete_user_data_atomic\(/,
  ),
  close_year_atomic: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.close_year_atomic\(/,
  ),
  prevent_fixed_asset_event_mutation: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.prevent_fixed_asset_event_mutation\(/,
  ),
  prevent_tax_account_event_mutation: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.prevent_tax_account_event_mutation\(/,
  ),
  prevent_tax_account_movement_mutation: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.prevent_tax_account_movement_mutation\(/,
  ),
  prevent_customer_invoice_booking_mutation: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.prevent_customer_invoice_booking_mutation\(/,
  ),
  book_fixed_asset_acquisition_atomic: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.book_fixed_asset_acquisition_atomic\(/,
  ),
  resolve_purchase_input_vat_deduction: latestMigrationTouching(
    /CREATE OR REPLACE FUNCTION public\.resolve_purchase_input_vat_deduction\(/,
  ),
}

for (const name of [
  'prevent_fixed_asset_event_mutation',
  'prevent_tax_account_event_mutation',
  'prevent_tax_account_movement_mutation',
]) {
  if (latestCriticalDefinitions[name] !== repairMigration) {
    fail(
      `${name} senaste definition finns i ${latestCriticalDefinitions[name]}, inte ${repairMigration}`,
    )
  }
}

for (const name of [
  'prevent_customer_invoice_booking_mutation',
]) {
  const expected = name === 'delete_user_data_atomic' ? neMigration : customerInvoiceBookingDeleteContextMigration
  if (latestCriticalDefinitions[name] !== expected) {
    fail(
      `${name} senaste definition finns i ${latestCriticalDefinitions[name]}, inte ${expected}`,
    )
  }
}

// Inspect the actual last complete body, rather than checking an old file's
// contents after a newer definition has superseded it. KAN-75 additionally
// transforms exact guarded preimages; that dynamic SQL still needs PG testing.
function latestBody(name, beforeFile) {
  const file = beforeFile ? readdirSync(migrationDir).filter(file => file.endsWith('.sql') && file < beforeFile).sort()
    .filter(file => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).test(read(join(migrationDir,file)))).at(-1)
    : latestCriticalDefinitions[name] ?? latestMigrationTouching(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`))
  if (!file) { fail(`Missing definition: ${name}`); return '' }
  const source = read(join(migrationDir, file))
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS (\\$[a-zA-Z_]*\\$)([\\s\\S]*?)\\1\\s*;`))
  if (!match) { fail(`Cannot inspect complete body: ${name} in ${file}`); return '' }
  return match[2]
}
let currentDelete = latestBody('delete_user_data_atomic')
if (latestCriticalDefinitions.delete_user_data_atomic === '20261026092741_kan112_year_end_checklist.sql') {
  // KAN-112 extends the released wrapper; retain checks on the real preserved
  // inner deletion boundary rather than requiring duplicated security logic.
  for (const needle of ['public.lock_accounting_year_boundary(p_user_id,true)',
    'DELETE FROM public.year_end_checklist WHERE user_id=p_user_id',
    'public.delete_user_data_atomic_pre_kan98(p_user_id)',
    'IF EXISTS(SELECT 1 FROM public.year_end_checklist',
    "'year_end_checklist',checklist_count"]) assertIncludes(currentDelete, needle, 'KAN112 deletion wrapper')
  currentDelete = latestBody('delete_user_data_atomic_pre_kan98')
}
for (const needle of [
  'PERFORM public.lock_accounting_year_boundary(p_user_id, true)',
  "IF v_role = 'admin'", 'public.delete_user_data_atomic_lifecycle_context',
  'backend_pid', 'pg_backend_pid()', 'DELETE FROM public.profiles WHERE id = p_user_id',
  'EXCEPTION',
]) assertIncludes(currentDelete, needle, 'current delete_user_data_atomic')
for (const table of ['withdrawal_assessment_facts', 'withdrawal_assessment_revisions', 'ne_sales_classifications', 'sie_import_inputs', 'journal_entries', 'transactions']) {
  assertIncludes(currentDelete, `DELETE FROM public.${table} WHERE user_id = p_user_id`, 'current delete_user_data_atomic')
  assertIncludes(currentDelete, `GET DIAGNOSTICS v_${table} = ROW_COUNT`, 'current delete_user_data_atomic')
  assertIncludes(currentDelete, `'${table}', v_${table}`, 'current delete_user_data_atomic')
}
for (const [child, parent] of [['withdrawal_assessment_facts', 'withdrawal_assessment_revisions'], ['withdrawal_assessment_revisions', 'profiles'], ['journal_entries', 'transactions']]) {
  if (currentDelete.indexOf(`DELETE FROM public.${child}`) >= currentDelete.indexOf(`DELETE FROM public.${parent}`)) fail(`delete order: ${child} must precede ${parent}`)
}
let currentClose = latestBody('close_year_atomic')
let currentCloseFile = latestCriticalDefinitions.close_year_atomic
const dateGuardMigration = '20261026162305_kan113_calendar_year_close_guard.sql'
const coverageMigration = '20261026090000_kan110_vat_year_coverage.sql'
if (currentCloseFile === dateGuardMigration) {
  for (const needle of ["clock_timestamp() AT TIME ZONE 'Europe/Stockholm'", 'p_year >= extract(year',
    'p_year IS NULL OR p_year < 1900 OR p_year > 9999', "USING ERRCODE='23514'", '1 januari']) {
    assertIncludes(currentClose, needle, 'KAN113 server date guard')
  }
  const previous = latestBody('close_year_atomic', dateGuardMigration)
  const downstream = body => body.slice(body.indexOf('  PERFORM public.assert_vat_year_coverage'))
  if (downstream(currentClose) !== downstream(previous)) fail('KAN113 changed downstream year-close checks')
  if (currentClose.indexOf('lock_accounting_year_boundary') >= currentClose.indexOf('clock_timestamp()')) fail('KAN113 must check the clock after the accounting gate')
  assertIncludes(read(join(migrationDir,dateGuardMigration)), '9a93f74704913fc47ed5fff93223e236', 'KAN113 reviewed preimage')
  currentClose = previous
  currentCloseFile = coverageMigration
}
if (currentCloseFile === coverageMigration) {
  assertIncludes(currentClose, 'PERFORM public.assert_vat_year_coverage(p_year)', 'KAN110 coverage wrapper')
  currentClose = latestBody('close_year_atomic', coverageMigration)
  currentCloseFile = '20261021120000_inventory_k1_depreciation_contract.sql'
}
if (currentClose.includes('RETURN public.close_year_unchecked_inventory(p_year)')) {
  const file = '20261021120000_inventory_k1_depreciation_contract.sql'
  if (currentCloseFile !== file) fail('Unexpected close-year delegate transformation')
  for (const needle of ['lock_accounting_year_boundary(auth.uid(),true)', 'inventory_depreciation_state(p_year)',
    "s->>'status'='ready'", 'public.lock_inventory_boundary()']) assertIncludes(currentClose,needle,'inventory close-year wrapper')
  const migration = read(join(migrationDir,file))
  for (const needle of ["pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure)",
    "EXECUTE replace(d,'public.close_year_atomic(', 'public.close_year_unchecked_inventory(')",
    'REVOKE ALL ON FUNCTION public.close_year_unchecked_inventory(integer) FROM PUBLIC,anon,authenticated,service_role;']) {
    assertIncludes(migration,needle,'private preserved close-year delegate')
  }
  // Check every original invariant too; the wrapper must not replace them.
  // Actual transformed definition/grants and year-close races are checked in PostgreSQL.
  currentClose=latestBody('close_year_atomic',file)
}
for (const needle of ['v_user_id := auth.uid()', 'IF v_user_id IS NULL', 'FOR UPDATE', 'public.closed_years', 'public.vat_periods', 'public.customer_invoices', 'public.fixed_assets', 'AS cumulative_result', "WHERE account_class IN ('3', '4', '5', '6', '7', '8')", 'INSERT INTO public.closed_years']) {
  assertIncludes(currentClose, needle, 'current close_year_atomic')
}
const boundary = read(join(migrationDir, '20261019120000_kan75_year_close_concurrency.sql'))
for (const needle of ["('public.close_year_atomic(integer)'", "('public.delete_user_data_atomic(uuid)'", "IF md5(replace(v_original", 'r.preimage_md5', 'public.lock_accounting_year_boundary', 'r.exclusive_gate', 'EXECUTE v_definition']) {
  assertIncludes(boundary, needle, 'KAN-75 guarded lock transformation')
}

if (
  latestCriticalDefinitions.book_fixed_asset_acquisition_atomic !==
  '20261008170000_kan54_fixed_asset_vat_deduction_guard.sql'
) {
  fail('KAN-54 fixed-asset VAT wrapper ar inte senaste acquisition-definition')
}

if (
  latestCriticalDefinitions.resolve_purchase_input_vat_deduction !==
  '20261008175927_kan55_purchase_input_vat_deduction.sql'
) {
  fail('KAN-55 purchase VAT deduction helper ar inte senaste definition')
}

assertIncludes(neSource, 'DELETE FROM public.ne_sales_classifications WHERE user_id = p_user_id', neMigration)
assertIncludes(neSource, "'ne_sales_classifications', v_ne_sales_classifications", neMigration)
assertIncludes(neSource, 'DELETE FROM public.sie_import_inputs WHERE user_id = p_user_id', neMigration)
assertIncludes(neSource, 'public.delete_user_data_atomic_lifecycle_context', neMigration)
assertIncludes(receiptDeletion, 'DELETE FROM public.sie_import_inputs WHERE user_id = p_user_id', receiptDeletionMigration)
assertIncludes(receiptDeletion, "'sie_import_inputs', v_sie_import_inputs", receiptDeletionMigration)
assertIncludes(receiptDeletion, "v_role = 'admin'", receiptDeletionMigration)
assertIncludes(receiptDeletion, 'public.delete_user_data_atomic_lifecycle_context', receiptDeletionMigration)
assertIncludes(edge, 'const remainingCounts = await getUserCounts', edgeFunctionPath)
assertIncludes(repair, 'backend_pid', repairMigration)
assertNotIncludes(repair, 'ctx.pid', repairMigration)
assertNotIncludes(repair, 'ON CONFLICT (pid, user_id)', repairMigration)
assertIncludes(repair, 'CREATE OR REPLACE FUNCTION public.prevent_tax_account_event_mutation()', repairMigration)
assertIncludes(repair, 'CREATE OR REPLACE FUNCTION public.prevent_tax_account_movement_mutation()', repairMigration)
assertIncludes(repair, "v_role = 'admin'", repairMigration)
assertIncludes(repair, 'GET DIAGNOSTICS v_profiles = ROW_COUNT', repairMigration)
assertIncludes(repair, "'profiles', v_profiles", repairMigration)
assertIncludes(
  repair,
  'public.customer_invoice_year_end_fiscal_year(ci.invoice_date, ci.service_date) = p_year',
  repairMigration,
)
assertIncludes(repair, 'fixed_asset_depreciation_runs r', repairMigration)
assertIncludes(
  repair,
  'REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated',
  repairMigration,
)
assertIncludes(
  repair,
  'GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role',
  repairMigration,
)
assertIncludes(
  repair,
  'GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO authenticated',
  repairMigration,
)

assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'CREATE OR REPLACE FUNCTION public.prevent_customer_invoice_booking_mutation()',
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  "IF TG_OP = 'DELETE'",
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'ctx.backend_pid = pg_backend_pid()',
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'ctx.user_id = OLD.user_id',
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;',
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'DELETE FROM public.delete_user_data_atomic_lifecycle_context',
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM authenticated',
  customerInvoiceBookingDeleteContextMigration,
)
assertIncludes(
  customerInvoiceBookingDeleteContextRepair,
  'REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated',
  customerInvoiceBookingDeleteContextMigration,
)

const dryRunKeys = [
  'withdrawal_assessment_facts',
  'withdrawal_assessment_revisions',
  'profiles',
  'fixed_asset_depreciation_runs',
  'fixed_asset_events',
  'fixed_asset_acquisition_idempotency',
  'fixed_assets',
  'fixed_asset_acquisition_groups',
  'customer_invoice_bookings',
  'customer_invoices',
  'tax_account_movements',
  'tax_account_events',
  'vat_v2_booking_idempotency',
  'vat_audit_snapshots',
  'vat_periods',
  'company_payment_account_roles',
  'journal_entries',
  'transactions',
  'favorites',
  'import_batches',
  'sie_import_inputs',
  'accounts',
  'closed_years',
  'ver_nr_sequences',
]

for (const key of dryRunKeys) {
  assertIncludes(adminDryRun, `'${key}'`, adminDryRunPath)
}

for (const key of dryRunKeys.filter(key => key !== 'profiles')) {
  assertIncludes(edge, `'${key}'`, edgeFunctionPath)
}
assertIncludes(edge, 'profiles: 1', edgeFunctionPath)
assertIncludes(edge, "targetProfile.role === 'admin'", edgeFunctionPath)
assertIncludes(edge, 'userId === caller.id', edgeFunctionPath)

assertIncludes(
  lifecyclePostcheck,
  'BEGIN READ ONLY',
  lifecyclePostcheckPath,
)
assertIncludes(
  lifecyclePostcheck,
  'SET LOCAL ROLE postgres',
  lifecyclePostcheckPath,
)
assertIncludes(
  lifecyclePostcheck,
  'delete_user_data_atomic_lifecycle_context',
  lifecyclePostcheckPath,
)
assertIncludes(
  lifecyclePostcheck,
  'Refusing admin-delete lifecycle postcheck against Production',
  lifecyclePostcheckPath,
)
assertIncludes(
  lifecyclePostcheck,
  'wbaxmuvudpnkvuliicuy',
  lifecyclePostcheckPath,
)
assertIncludes(
  lifecyclePostcheck,
  'fzxqiqenqjzhlyxxpvhg',
  lifecyclePostcheckPath,
)
assertNotIncludes(lifecyclePostcheck, "from('delete_user_data_atomic_lifecycle_context')", lifecyclePostcheckPath)
assertNotIncludes(lifecyclePostcheck, '.from("delete_user_data_atomic_lifecycle_context")', lifecyclePostcheckPath)

if (failures.length > 0) {
  console.error('DB regression invariant check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('DB regression invariant check passed.')
