# SoloLedger DB Regression Guard

Run the database regression guard after changing critical database functions,
bookkeeping RPCs, lifecycle triggers, VAT/VAT V2 logic, customer invoices,
fixed assets, or migration ordering.

The guard is intentionally write-capable and must only run against an isolated
local PostgreSQL regression database:

```powershell
$env:SOLOLEDGER_LOCAL_TEST_DATABASE_URL = "postgresql://..."
npm run test:db-invariants
npm run test:db-regression
```

`npm run test:db-regression` refuses to run when the database URL points at a
Supabase host or at the known SoloLedger Production/Staging refs. It verifies
the local destination before each write-capable step, applies the local
`db_regression_schema_prerequisites.sql` setup derived from the current
migration-chain transaction source taxonomy, applies the current KAN-56/KAN-57
repair migration to the local test database, then runs rollback SQL fixtures for
the repaired delete/year-close behavior and selected older KAN-30, KAN-36,
KAN-46, KAN-54, and KAN-55 protections.

Do not run these SQL tests against Production, Staging, or ordinary user data.
If the isolated local database is not available, run `npm run test:db-invariants`
and report the DB behavior tests as blocked.

Admin-delete staging/production verification must not query
`delete_user_data_atomic_lifecycle_context` through REST or Supabase client APIs.
That table is intentionally private, including from `service_role` table grants.
Use `npm run test:admin-delete-lifecycle-postcheck` with
`SOLOLEDGER_ADMIN_DELETE_POSTCHECK_DATABASE_URL` for the separate read-only SQL
postcheck when a deletion harness needs to verify that lifecycle context rows
are cleaned up. The postcheck refuses Production and only allows localhost or
the known hosted staging ref.

## KAN-72 standard booking integrity

The local guard also applies 20261014100000_kan72_standard_booking_integrity.sql
and runs kan72_standard_booking_integrity_candidate.sql with rollback.
The fixture covers standard and periodized amount validation, stored journal
identity/balance, deliberately injected journal faults (including cancelling
imbalances across two verifications), atomic number rollback, known VAT rounding,
profile/year/period guards, attachment metadata and existing correction paths.
It also exercises real authenticated and anonymous caller roles. Do not run the
fixture directly against hosted or ordinary user data.

To reproduce the pre-fix behavior on an isolated local baseline, run the fixture
with psql variable apply_kan72_migration=0; use =1 to apply the candidate inside
its rollback transaction. The guarded suite uses =0 after its local-only apply.

The review follow-up also injects extra journal rows on another transaction
with the same owner and verification number. It checks ordinary and both
periodized verifications, NULL/zero/balanced extra rows and number rollback.
Rows for another user with the same number must not affect the check.
The domain regression exercises Chromium number-input strings and exact
decimal/exponent normalization before any Number/valueAsNumber conversion.
