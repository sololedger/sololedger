# SoloLedger Supabase production baseline

**Snapshot date: 2026-09-11**

This folder documents the verified deployed SoloLedger database state
independently of the historical migration chain.

## Important

`20260911_production_schema_baseline.sql` is **not a migration for the
existing production database**. Do not run it against the current
SoloLedger Supabase project.

The existing files in `supabase/migrations/` must remain in place. They
are historical migrations and should not be deleted merely because this
baseline exists.

The previous `20260910_production_schema_baseline.sql` may be replaced
by this newer snapshot in `supabase/baseline/`; the migration history
remains the source of chronological database changes.

## What this baseline contains

The 2026-09-11 snapshot was assembled from fresh SQL exports of the
deployed Supabase project and contains:

-   the eight current `public` tables and their visible PK/FK/check
    constraints;
-   RLS enabled state for all eight `public` tables;
-   the 15 live `public` RLS policies;
-   the 5 live `storage.objects` RLS policies for the `attachments`
    bucket;
-   deployed table grants for `authenticated` and `service_role`;
-   the verified column-level `UPDATE` restriction on `profiles`
    (`company_name` and `org_nr` only for `authenticated`);
-   all 12 current functions/RPCs in `public`, using their deployed
    definitions;
-   all 17 live `public` indexes, including
    `transactions_one_correction_per_original`;
-   the live non-internal `public` trigger
    `prevent_deleting_used_account`;
-   verified `attachments` bucket settings: private, 10 MiB limit, and
    MIME types `image/jpeg`, `image/png`, `image/webp`,
    `application/pdf`.

The purpose is to make audits and recovery work compare against the
actual deployed state rather than infer the final state only from
historical migration ordering.

## Known boundaries

This snapshot still does not prove or recreate every Supabase/PostgreSQL
object. In particular:

-   trigger bindings in the `auth` schema, such as any trigger calling
    `handle_new_user()`;
-   event-trigger bindings, if any, for `rls_auto_enable()`;
-   per-function `EXECUTE` grants/revokes;
-   extensions and project-level Supabase configuration.

For that reason, this remains a production-state audit/recovery snapshot
rather than a guaranteed one-command installer for a completely empty
Supabase project.

## Recommended workflow

Keep all future database changes as new files under
`supabase/migrations/`. Do not edit already-applied historical
migrations merely to make them resemble the current deployed function
bodies.

Use this baseline when auditing the current production state,
reconciling historical migrations against deployed state, preparing
disaster recovery, or preparing a future clean-schema rebuild.

After meaningful database changes, refresh the baseline from the
deployed database rather than manually patching old function bodies.
Before using it to build a new Supabase project from scratch, verify the
remaining boundary items and test the complete rebuild in a disposable
project first.
