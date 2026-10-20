// Static contract review only. This does NOT parse/execute PostgreSQL or prove RLS.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const sql=readFileSync('supabase/migrations/20261019200000_kan97_withdrawal_assessments.sql','utf8')
const edge=readFileSync('supabase/functions/delete-user/index.ts','utf8')
const labels=readFileSync('src/lib/adminDeleteDryRun.ts','utf8')
for(const table of ['withdrawal_assessment_facts','withdrawal_assessment_revisions']) {
 assert(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`))
 assert(sql.includes(`DELETE FROM public.${table} WHERE user_id = p_user_id`))
 assert(sql.includes(`'${table}', v_${table}`))
 assert(edge.includes(`'${table}'`));assert(labels.includes(`'${table}'`))
}
assert(sql.includes('FOREIGN KEY (user_id, revision_id)'))
assert(sql.includes('FOREIGN KEY (user_id, previous_revision_id)'))
assert(sql.includes('ON DELETE CASCADE'))
assert(sql.includes('p_signature'))
assert(sql.includes('head.id IS DISTINCT FROM p_previous'))
assert(sql.includes('REVOKE ALL ON FUNCTION public.save_withdrawal_assessment(date,uuid,text,jsonb) FROM PUBLIC, anon'))
assert(sql.indexOf('DELETE FROM public.withdrawal_assessment_facts')<sql.indexOf('DELETE FROM public.withdrawal_assessment_revisions'))
assert(!/ALTER TABLE public\.(journal_entries|transactions|vat_periods)/.test(sql))
console.log('PASS KAN-97 static migration inventory/ACL/ownership/deletion contracts; NOT a database execution test')
