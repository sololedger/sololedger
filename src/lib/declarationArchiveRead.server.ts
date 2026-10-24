import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveUuid, declarationRisk, parseDeclarationCommand } from './declarationArchive'
import { DeclarationArchiveError, type DeclarationSourceView, type DeclarationSummary, type DeclarationVersion } from './declarationArchiveView'
import { readNeSourceSnapshot } from './neSourceReader.server'

const unavailable=()=>new DeclarationArchiveError('Historiken kunde inte läsas fullständigt. Försök läsa igen.')
function sourceView(row: Record<string, unknown>, owner: string, year: number): DeclarationSourceView {
  if (row.user_id!==owner || row.income_year!==year || row.schema_version!==1) throw unavailable()
  const raw=row.source_payload as Record<string, unknown>, risk=row.risk_payload as DeclarationSourceView['risk']
  if(!raw || raw.owner!==owner || raw.income_year!==year || !raw.company || !row.computed_payload || typeof row.computed_payload!=='object'
    || !risk || risk.verification!=='not_verified' || !['limited','not_assessed'].includes(risk.assessment) || !Array.isArray(risk.reasons)) throw unavailable()
  return {id:archiveUuid(row.id),income_year:year,captured_at:String(row.captured_at),calculation_version:String(row.calculation_version),
    app_revision:String(row.app_revision),source_fingerprint:String(row.source_fingerprint),company:raw.company as DeclarationSourceView['company'],
    locked:raw.year_lock!==null,report:row.computed_payload as Record<string,unknown>,risk}
}
export async function previewDeclaration(client: SupabaseClient, token: string, year: number): Promise<DeclarationSourceView> {
  const source=await readNeSourceSnapshot(client,token,year)
  return {id:null,income_year:year,captured_at:String(source.raw.captured_at),calculation_version:'ne-existing-v1',app_revision:'',
    source_fingerprint:source.sourceFingerprint,company:source.raw.company as DeclarationSourceView['company'],
    locked:source.raw.year_lock!==null,report:source.report,risk:declarationRisk(source)}
}
export async function listDeclarationVersions(client: SupabaseClient, owner: string): Promise<DeclarationSummary[]> {
  // Append-only rows + exact counts per page and an end count. Never return a
  // truncated/shifted list if another request appends/deletes while paging.
  const rows: DeclarationSummary[]=[],seen=new Set<string>();let expected: number | null=null
  for(let offset=0;;offset+=500) {
    const {data,error,count}=await client.from('declaration_revisions')
      .select('id,user_id,income_year,revision_no,previous_revision_id,source_snapshot_id,submission_source_snapshot_id,recorded_at,change_kind,reason,submission_status:submission_payload->>status',{count:'exact'})
      .eq('user_id',owner).order('income_year',{ascending:false}).order('revision_no',{ascending:false}).range(offset,offset+499)
    if(error || count===null || count>10000 || (expected!==null && expected!==count)) throw unavailable()
    expected=count
    for(const row of data??[]) {
      if(row.user_id!==owner || seen.has(row.id)) throw unavailable()
      seen.add(row.id);const {user_id:_owner,...summary}=row;void _owner
      rows.push(summary as DeclarationSummary)
    }
    if(rows.length===expected) break
    if(rows.length>expected || !data?.length) throw unavailable()
  }
  const end=await client.from('declaration_revisions').select('id',{head:true,count:'exact'}).eq('user_id',owner)
  if(end.error || end.count!==expected) throw unavailable()
  return rows
}
export async function readDeclarationVersion(client: SupabaseClient, owner: string, id: string): Promise<DeclarationVersion> {
  const {data:row,error}=await client.from('declaration_revisions').select('*').eq('user_id',owner).eq('id',archiveUuid(id)).maybeSingle()
  if(error) throw unavailable()
  if(!row) throw new DeclarationArchiveError('Versionen finns inte eller är inte tillgänglig för dig.',404,'not_found')
  if(row.user_id!==owner || row.schema_version!==1) throw unavailable()
  // Validate documented payloads without recalculating any historical values.
  const original=parseDeclarationCommand(row.request_payload)
  if(original.income_year!==row.income_year || original.change_kind!==row.change_kind || original.expected_previous_id!==row.previous_revision_id) throw unavailable()
  const documented=parseDeclarationCommand({...original,manual:row.manual_payload,submission:row.submission_payload})
  async function getSource(sourceId: string | null) {
    if(!sourceId) return null
    const {data,error}=await client.from('declaration_source_snapshots').select('*').eq('user_id',owner).eq('income_year',row.income_year).eq('id',sourceId).maybeSingle()
    if(error || !data) throw unavailable()
    return sourceView(data,owner,row.income_year)
  }
  const sameSource=row.submission_source_snapshot_id===row.source_snapshot_id
  const [source,otherSource]=await Promise.all([getSource(row.source_snapshot_id),sameSource?Promise.resolve(null):getSource(row.submission_source_snapshot_id)])
  const submittedSource=sameSource?source:otherSource
  if(documented.submission.source_snapshot_id!==row.submission_source_snapshot_id) throw unavailable()
  return {id:row.id,income_year:row.income_year,revision_no:row.revision_no,previous_revision_id:row.previous_revision_id,
    source_snapshot_id:row.source_snapshot_id,submission_source_snapshot_id:row.submission_source_snapshot_id,recorded_at:row.recorded_at,
    change_kind:row.change_kind,reason:row.reason,submission_status:documented.submission.status,
    manual:documented.manual,submission:documented.submission,source,submitted_source:submittedSource}
}
