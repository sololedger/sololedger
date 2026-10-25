// Internal server module only. No public action/route and no browser service key.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveUuid, declarationRisk, parseDeclarationCommand } from './declarationArchive'
import { readNeSourceSnapshot } from './neSourceReader.server'
import { DeclarationArchiveError } from './declarationArchiveView'

export async function saveDeclarationRevision(authClient: SupabaseClient, serviceClient: SupabaseClient,
  token: string, requestId: string, command: unknown, appRevision: string) {
  if (!token || !/^[a-f0-9]{40}$/.test(appRevision)) throw new Error('Ogiltigt sparsammanhang.')
  const request = parseDeclarationCommand(command), id = archiveUuid(requestId)
  const identity = await authClient.auth.getUser(token)
  if (identity.error || !identity.data.user) throw new Error('Inloggningen kunde inte verifieras.')
  const owner = identity.data.user.id
  const args = { p_user_id: owner, p_request_id: id, p_request: request }
  const call = async (candidate: unknown) => {
    // Dedicated trusted server client, never the bearer-scoped browser client.
    const { data, error } = await serviceClient.rpc('save_declaration_revision_atomic', { ...args, p_candidate: candidate })
    if (error) {
      if (['PT409','40001','23505'].includes(error.code)) throw new DeclarationArchiveError('Underlaget eller historiken har ändrats. Läs in senaste versionen innan du fortsätter.',409,'conflict')
      if (['23503','23514','22023','22P02'].includes(error.code)) throw new DeclarationArchiveError('Uppgifterna eller underlagskopplingen kunde inte godkännas. Kontrollera versionen.',400,'invalid')
      if (['PGRST202','42883'].includes(error.code)) throw new DeclarationArchiveError('Deklarationsarkivet är inte installerat i denna miljö.',503,'not_installed')
      if (error.code==='P0002') throw new DeclarationArchiveError('Kontot finns inte längre. Logga in igen.',401,'unauthorized')
      throw new DeclarationArchiveError('Utfallet kunde inte bekräftas. Försök igen med samma sparbegäran.',503,'uncertain',true)
    }
    if (!data || !['saved','replayed','needs_source'].includes(data.status)) throw new Error('Ogiltigt arkivkvitto.')
    return data
  }
  // Replay is checked before reading current sources (which may have changed).
  const receipt = await call(null)
  if (receipt.status !== 'needs_source') return receipt
  if (request.source.mode !== 'capture') throw new Error('Ogiltigt arkivkvitto.')
  const source = await readNeSourceSnapshot(authClient, token, request.income_year)
  if (source.raw.owner !== owner || source.sourceFingerprint !== request.source.expected_fingerprint) throw new DeclarationArchiveError('Underlaget har ändrats. Läs in det igen.',409,'conflict')
  const saved = await call({ source: source.raw, computed: source.report, risk: declarationRisk(source),
    source_fingerprint: source.sourceFingerprint, calculation_version: 'ne-existing-v1', app_revision: appRevision })
  if (saved.status === 'needs_source') throw new Error('Arkivet sparades inte.')
  return saved
}
