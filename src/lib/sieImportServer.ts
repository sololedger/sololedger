import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeSieBuffer, parseSieFile, MAX_SIE_FILE_BYTES } from './sieParser'
import { buildSieImportPayload } from './sieImportPayload'

type Dependencies = {
  admin: () => Pick<SupabaseClient, 'auth' | 'rpc'>
  user: (token: string) => Pick<SupabaseClient, 'rpc'>
}
// Decimal 4 MB source + 64 KiB multipart allowance = 4,065,536 bytes,
// below Vercel Functions' 4.5 MB request limit. Enforced on actual streamed bytes.
const MAX_BODY_BYTES = MAX_SIE_FILE_BYTES + 65_536
const messages: Record<string, string> = {
  '23505': 'Den här filen har redan importerats tidigare.',
  P2001: 'Det finns redan en ingående balans för räkenskapsåret. Ingen bokföring har importerats.',
  P2074: 'Flerårig SIE-import stöds ännu inte. Importera endast ett räkenskapsår per företag. Även tidigare ångrade importer kan begränsa vilket år som kan importeras. Ingen bokföring har importerats.',
  P2075: 'Importkvittot är ogiltigt, utgånget eller redan använt, eller hör till ett annat företag. Försök igen med originalfilen.',
  '22023': 'Filens räkenskapsperiod eller bokföringsuppgifter är ogiltiga. Ingen bokföring har importerats.',
  '23514': 'En bokförings- eller momsperiod är låst eller kan inte hanteras säkert. Ingen bokföring har importerats.',
  '25001': 'Importen kunde inte kontrolleras säkert. Försök igen med originalfilen.',
}
function failure(status: number, code: string, message: string) {
  return Response.json({ success: false, code, error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
class InputError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
async function readFile(request: Request): Promise<File> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new InputError(400, 'Skicka originalfilen som en SIE-fil.')
  const length = request.headers.get('content-length')
  if (length && Number(length) > MAX_BODY_BYTES) throw new InputError(413, 'Filen får vara högst 4 MB.')
  if (!request.body) throw new InputError(400, 'Originalfil saknas.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new InputError(413, 'Filen får vara högst 4 MB.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let form: FormData
  try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData() }
  catch { throw new InputError(400, 'Originalfilen kunde inte läsas säkert.') }
  const entries = [...form.entries()]
  if (entries.length !== 1 || entries[0][0] !== 'file' || !(entries[0][1] instanceof File)) throw new InputError(400, 'Skicka endast en originalfil.')
  const file = entries[0][1]
  if (file.size > MAX_SIE_FILE_BYTES) throw new InputError(413, 'Filen får vara högst 4 MB.')
  if (!file.size) throw new InputError(400, 'Filen är tom.')
  return file
}

export function createSieImportHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const header = request.headers.get('authorization') ?? ''
      const match = /^Bearer ([^\s]+)$/i.exec(header)
      if (!match) return failure(401, '28000', 'Logga in igen innan import.')
      const token = match[1]
      const admin = dependencies.admin()
      const { data: { user }, error: authError } = await admin.auth.getUser(token)
      if (authError || !user) return failure(401, '28000', 'Logga in igen innan import.')
      const file = await readFile(request)
      const raw = new Uint8Array(await file.arrayBuffer())
      const parsed = parseSieFile(decodeSieBuffer(raw).content, { strictImport: true })
      if (parsed.errors.length) return failure(400, '22023', parsed.errors[0])
      const period = parsed.fiscalYears.find(p => p.index === 0)!
      const filename = file.name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 200) || 'import.se'
      const payload = await buildSieImportPayload(parsed, filename)
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
      const rawHash = [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
      const { data: receipt, error: registrationError } = await admin.rpc('register_sie_import_input', {
        p_user_id: user.id, p_payload: payload, p_period_start: period.start, p_period_end: period.end,
        p_raw_sha256: rawHash,
      })
      if (registrationError || typeof receipt !== 'string') {
        const code = registrationError?.code ?? ''
        return failure(messages[code] ? 400 : 503, messages[code] ? code : 'IMPORT_FAILED', messages[code] ?? 'Importen kunde inte förberedas säkert. Ingen bokföring har importerats.')
      }
      const { data, error } = await dependencies.user(token).rpc('import_sie_batch', { p_payload: { receipt_id: receipt } })
      if (error) return failure(messages[error.code] ? 400 : 500, messages[error.code] ? error.code : 'IMPORT_FAILED', messages[error.code] ?? 'Importens resultat kunde inte bekräftas. Kontrollera importhistoriken innan du försöker igen.')
      if (!data?.success) return failure(500, 'IMPORT_FAILED', 'Importens resultat kunde inte bekräftas. Kontrollera importhistoriken innan du försöker igen.')
      return Response.json({ success: true, importBatchId: data.import_batch_id, verificationCount: data.verification_count,
        importedCount: data.imported_count, openingBalanceImported: data.opening_balance_imported ?? false }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof InputError) return failure(error.status, '22023', error.message)
      // No source text, DB details, tokens, file names or parser diagnostics in logs/errors.
      return failure(500, 'IMPORT_FAILED', 'Importens resultat kunde inte bekräftas. Kontrollera importhistoriken innan du försöker igen.')
    }
  }
}
