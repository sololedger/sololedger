import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const productionRef = 'wbaxmuvudpnkvuliicuy'
const stagingRef = 'fzxqiqenqjzhlyxxpvhg'
const databaseUrl = process.env.SOLOLEDGER_ADMIN_DELETE_POSTCHECK_DATABASE_URL
const expectedRows = process.env.SOLOLEDGER_ADMIN_DELETE_EXPECTED_LIFECYCLE_ROWS ?? '0'

if (!databaseUrl) {
  console.error(
    'Missing SOLOLEDGER_ADMIN_DELETE_POSTCHECK_DATABASE_URL for read-only admin-delete lifecycle postcheck.',
  )
  process.exit(2)
}

if (!/^\d+$/.test(expectedRows)) {
  console.error('SOLOLEDGER_ADMIN_DELETE_EXPECTED_LIFECYCLE_ROWS must be a non-negative integer.')
  process.exit(2)
}

let parsedUrl
try {
  parsedUrl = new URL(databaseUrl)
} catch {
  console.error('SOLOLEDGER_ADMIN_DELETE_POSTCHECK_DATABASE_URL is not a valid URL.')
  process.exit(2)
}

if (databaseUrl.includes(productionRef)) {
  console.error('Refusing admin-delete lifecycle postcheck against Production.')
  process.exit(2)
}

const isKnownStaging = databaseUrl.includes(stagingRef)
const isLocal = new Set(['localhost', '127.0.0.1', '::1']).has(parsedUrl.hostname)

if (!isLocal && !isKnownStaging) {
  console.error(
    `Refusing admin-delete lifecycle postcheck against unapproved host: ${parsedUrl.hostname}`,
  )
  process.exit(2)
}

const defaultWindowsPsql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const psql =
  process.env.PSQL_PATH ??
  (existsSync(defaultWindowsPsql) ? defaultWindowsPsql : 'psql')

const readOnlySql = `
BEGIN READ ONLY;
SET LOCAL ROLE postgres;
DO $$
DECLARE
  v_count integer;
  v_expected integer := ${expectedRows};
BEGIN
  SELECT count(*)::integer
    INTO v_count
  FROM public.delete_user_data_atomic_lifecycle_context;

  IF v_count <> v_expected THEN
    RAISE EXCEPTION
      'Admin-delete lifecycle postcheck failed: lifecycle context row count %, expected %',
      v_count,
      v_expected;
  END IF;
END;
$$;
COMMIT;
`

const result = spawnSync(psql, [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', readOnlySql], {
  env: process.env,
  stdio: 'inherit',
  shell: false,
})

if (result.status !== 0) {
  const code = result.status ?? result.signal ?? 'unknown'
  console.error(`Admin-delete lifecycle postcheck failed with exit ${code}.`)
  process.exit(1)
}

console.log('Admin-delete lifecycle postcheck passed.')
