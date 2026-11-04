import { requireProfileContext } from './profileContext'
import { verifyProfileWrite } from './profileWriteGuard'
import { supabase } from './supabaseClient'

const revisionFields = 'id,revision_no,as_of_date,recorded_at'
const pageSize = 10

export type HistoryRevision = {
  id: string
  revision_no: number
  as_of_date: string
  recorded_at: string
}

export type HistoryFact = {
  fact_key: string
  payload: Record<string, unknown>
  observed_on: string
  source_kind: string
}

async function historySession(owner: string, sequence: number) {
  const ticket = requireProfileContext()
  if (ticket.userId !== owner || ticket.sequence !== sequence) throw new Error('Inloggningen har ändrats.')
  const token = await verifyProfileWrite(ticket)
  const check = () => requireProfileContext(ticket)
  check()
  return { authorization: `Bearer ${token}`, check }
}

export async function loadWithdrawalHistory(owner: string, sequence: number, before: number | undefined, signal: AbortSignal) {
  const { authorization, check } = await historySession(owner, sequence)
  const query = supabase.from('withdrawal_assessment_revisions')
    .select(revisionFields).eq('user_id', owner).order('revision_no', { ascending: false })
    .limit(pageSize + 1).setHeader('Authorization', authorization).abortSignal(signal)
  if (before !== undefined) query.lt('revision_no', before)
  const { data, error } = await query.returns<HistoryRevision[]>()
  check()
  if (error || !data) throw new Error('Historiken kunde inte hämtas.')
  return { revisions: data.slice(0, pageSize), hasMore: data.length > pageSize }
}

export async function loadWithdrawalHistoryRevision(owner: string, sequence: number, id: string, signal: AbortSignal) {
  const { authorization, check } = await historySession(owner, sequence)
  const { data: revision, error } = await supabase.from('withdrawal_assessment_revisions')
    .select(`${revisionFields},schema_version`).eq('user_id', owner).eq('id', id)
    .setHeader('Authorization', authorization).abortSignal(signal)
    .maybeSingle<HistoryRevision & { schema_version: number }>()
  check()
  if (error || revision?.id !== id || revision.schema_version !== 1) throw new Error('Versionen kunde inte visas.')

  const { data: facts, error: factsError } = await supabase.from('withdrawal_assessment_facts')
    .select('fact_key,payload,observed_on,source_kind').eq('user_id', owner).eq('revision_id', id)
    .order('fact_key').setHeader('Authorization', authorization).abortSignal(signal).returns<HistoryFact[]>()
  check()
  if (factsError || !facts) throw new Error('Versionen kunde inte visas.')
  return { revision, facts }
}
