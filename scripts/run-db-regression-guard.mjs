import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const productionRef = 'wbaxmuvudpnkvuliicuy'
const stagingRef = 'fzxqiqenqjzhlyxxpvhg'
const databaseUrl =
  process.env.SOLOLEDGER_LOCAL_TEST_DATABASE_URL ?? process.env.DATABASE_URL

if (!databaseUrl) {
  console.error(
    'Missing SOLOLEDGER_LOCAL_TEST_DATABASE_URL or DATABASE_URL for an isolated local regression database.',
  )
  process.exit(2)
}

if (
  databaseUrl.includes(productionRef) ||
  databaseUrl.includes(stagingRef) ||
  databaseUrl.includes('supabase.co')
) {
  console.error('Refusing to run write-capable DB regression tests against Supabase.')
  process.exit(2)
}

let parsed
try {
  parsed = new URL(databaseUrl)
} catch {
  console.error('Database URL is not a valid URL.')
  process.exit(2)
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
if (!localHosts.has(parsed.hostname)) {
  console.error(
    `Refusing to run write-capable DB regression tests against non-local host: ${parsed.hostname}`,
  )
  process.exit(2)
}

const defaultWindowsPsql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const psql =
  process.env.PSQL_PATH ??
  (existsSync(defaultWindowsPsql) ? defaultWindowsPsql : 'psql')

const preflightSql =
  "select current_database() as database, inet_server_addr() as server_addr, inet_server_port() as server_port"

function runPsql(args, label) {
  console.log(`\n== ${label} ==`)
  const result = spawnSync(psql, [databaseUrl, ...args], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })

  if (result.status !== 0) {
    const code = result.status ?? result.signal ?? 'unknown'
    throw new Error(`${label} failed with exit ${code}`)
  }
}

function verifyLocalDestination(label) {
  runPsql(['-v', 'ON_ERROR_STOP=1', '-c', preflightSql], `${label} destination preflight`)
}

try {
  verifyLocalDestination('initial local database')

  runPsql(
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/tests/db_regression_schema_prerequisites.sql',
    ],
    'apply DB regression schema prerequisites to local test DB',
  )

  verifyLocalDestination('repair migration')
  runPsql(
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261009203900_kan56_kan57_db_regression_repair.sql',
    ],
    'apply KAN-56/KAN-57 repair migration to local test DB',
  )

  verifyLocalDestination('customer invoice booking delete-context migration')
  runPsql(
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261009220552_kan56_customer_invoice_booking_delete_context.sql',
    ],
    'apply KAN-56 customer invoice booking delete-context migration to local test DB',
  )

  const rollbackTests = [
    ['supabase/tests/kan56_kan57_db_regression_candidate.sql'],
    ['-v', 'skip_migration=1', '-f', 'supabase/tests/kan30_delete_user_data_vat_lifecycle_red_candidate.sql'],
    ['supabase/tests/kan36_fixed_assets_candidate.sql'],
    ['-v', 'skip_migration=1', '-f', 'supabase/tests/kan46_customer_invoice_lifecycle_candidate.sql'],
    ['supabase/tests/kan54_fixed_asset_vat_deduction_guard_candidate.sql'],
    ['supabase/tests/kan55_purchase_input_vat_deduction_candidate.sql'],
  ]

  for (const testArgs of rollbackTests) {
    const file = testArgs.at(-1)
    const args = testArgs.includes('-f') ? testArgs : ['-v', 'ON_ERROR_STOP=1', '-f', file]
    verifyLocalDestination(file)
    runPsql(args, file)
  }
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

console.log('\nDB regression guard passed.')
