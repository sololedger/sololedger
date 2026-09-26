# Legacy Manually-Applied SQL Archive

This folder preserves the historical SQL files from the pre-`20260925000000`
SoloLedger migration era.

These files were not applied to production by Supabase CLI migration tracking.
They were generated as SQL, applied manually in the Supabase SQL Editor, and
then saved in `supabase/migrations/` as a Git record of what had been run.

Because the files were not CLI-applied, their old date-only filenames are not a
valid Supabase CLI migration ledger. Several files shared the same date prefix,
and Supabase's migration history stores one row per migration version. They
therefore cannot be repaired into production history as individual historical
CLI migrations without inventing ledger identity that never existed.

The active CLI cutover baseline is:

`supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql`

That baseline reconstructs the production schema state after the manually
applied legacy SQL through `20260920` and immediately before KAN-17A, which is
recorded remotely as `20260925050113`.

Do not run the archived files against current production. They are retained for
audit, provenance, comparison, and emergency reconstruction context only.
