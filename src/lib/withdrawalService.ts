import { verifiedProfileRpc } from './profileWriteGuard'
import { buildWithdrawalAssessment, validateWithdrawalSnapshot, type WithdrawalFact, type WithdrawalSnapshot } from './withdrawalAssessment'

export class WithdrawalConflictError extends Error {
  constructor() { super('Underlaget har ändrats. Aktuella uppgifter laddas om; kontrollera dem innan du sparar igen.') }
}

export async function loadWithdrawal(owner: string, asOf: string) {
  const { userId, rpc } = await verifiedProfileRpc()
  if (userId !== owner) throw new Error('Inloggningen har ändrats.')
  const { data, error } = await rpc('get_withdrawal_context', { p_as_of: asOf })
  if (error) throw new Error('Uttagsunderlaget kunde inte hämtas. Databasstödet kan behöva förberedas innan funktionen används.')
  const snapshot = data as WithdrawalSnapshot
  validateWithdrawalSnapshot(snapshot, owner, asOf)
  return { snapshot, assessment: buildWithdrawalAssessment(snapshot) }
}
export async function saveWithdrawal(owner: string, snapshot: WithdrawalSnapshot, facts: WithdrawalFact[]) {
  const { userId, rpc } = await verifiedProfileRpc()
  if (userId !== owner || snapshot.user_id !== owner) throw new Error('Inloggningen har ändrats.')
  // Validate the same prospective assessment the caller will see. Critical
  // accounting conflicts are not erased by saving advisory information.
  buildWithdrawalAssessment({ ...snapshot, revision: { id: '', user_id: owner, as_of_date: snapshot.as_of, recorded_at: '', facts } })
  const { error } = await rpc('save_withdrawal_assessment', {
    p_as_of: snapshot.as_of, p_previous: snapshot.revision?.id ?? null,
    p_signature: snapshot.signature, p_facts: facts.map(({ key, value }) => ({ key, value })),
  })
  if (error?.code === '40001') throw new WithdrawalConflictError()
  if (error) throw new Error('Uppgifterna kunde inte sparas. Försök igen.')
}
