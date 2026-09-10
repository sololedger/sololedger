SoloLedger Supabase production baseline

Snapshot date: 2026-09-10

This folder exists to document the verified deployed database state independently of the historical migration chain.

Important

20260910_production_schema_baseline.sql is not a migration for the existing production database. Do not run it against the current SoloLedger Supabase project.

The existing files in supabase/migrations/ should remain in place. They are historical migrations and must not be deleted merely because this baseline exists.

What this baseline contains

The snapshot was assembled from SQL exported from the deployed Supabase project and contains:

the eight current public tables and their visible PK/FK/check constraints;

the deployed RLS-enabled state for all eight tables;

the deployed RLS policies;

the deployed table grants for authenticated and service_role;

the verified column-level UPDATE restriction on profiles (company_name and org_nr only for authenticated);

the ten current functions/RPCs in public, using their deployed definitions.

The purpose is to make audits and recovery work compare against the actual deployed state, rather than infer the final state only from old migration-file ordering.

Known boundaries

The exports used for this snapshot did not include every Supabase/PostgreSQL object. In particular, this snapshot does not yet prove or recreate:

trigger definitions in auth that call trigger functions such as handle_new_user();

event-trigger bindings, if any, for rls_auto_enable();

Storage bucket configuration and Storage RLS policies;

non-PK/FK indexes;

per-function EXECUTE grants/revokes;

extensions and project-level Supabase configuration.

For that reason, this baseline is a production-state audit/recovery snapshot, not yet a guaranteed one-command installer for a completely empty Supabase project.

Recommended workflow

Keep normal future database changes as new files under supabase/migrations/.

Use this baseline when:

auditing what production looked like on 2026-09-10;

reconciling old migrations against deployed state;

preparing disaster recovery;

preparing a future clean-schema rebuild.

Before using it to build a new Supabase project from scratch, capture and verify the known-boundary items above and test the complete rebuild in a disposable project first.