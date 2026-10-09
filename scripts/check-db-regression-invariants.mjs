import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationDir = 'supabase/migrations'
const repairMigration =
  '20261009203900_kan56_kan57_db_regression_repair.sql'
const customerInvoiceBookingDeleteContextMigration =
  '20261009220552_kan56_customer_invoice_booking_delete_context.sql'
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
  'close_year_atomic',
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
  'delete_user_data_atomic',
  'prevent_customer_invoice_booking_mutation',
]) {
  if (latestCriticalDefinitions[name] !== customerInvoiceBookingDeleteContextMigration) {
    fail(
      `${name} senaste definition finns i ${latestCriticalDefinitions[name]}, inte ${customerInvoiceBookingDeleteContextMigration}`,
    )
  }
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
