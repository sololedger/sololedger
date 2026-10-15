import { supabase } from './supabaseClient'

export interface ImportSieBatchResult {
  success: true
  importBatchId: string
  verificationCount: number
  importedCount: number
  openingBalanceImported: boolean
}
export class SieImportError extends Error {
  constructor(message: string, public code: 'ALREADY_IMPORTED' | 'OPENING_BALANCE_EXISTS' | 'OPENING_BALANCE_CONFLICT' | 'VALIDATION_FAILED' | 'IMPORT_FAILED') {
    super(message)
    this.name = 'SieImportError'
  }
}

// Only original bytes cross this boundary. No client-parsed accounting payload.
export async function importSieBatch(file: File): Promise<ImportSieBatchResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new SieImportError('Logga in igen innan import.', 'IMPORT_FAILED')
  const body = new FormData()
  body.set('file', file)
  let response: Response
  try {
    response = await fetch('/api/sie/import', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token }, body })
  } catch {
    throw new SieImportError('Importens resultat kunde inte hämtas. Kontrollera importhistoriken innan du försöker igen.', 'IMPORT_FAILED')
  }
  let result: Record<string, unknown>
  try { result = await response.json() } catch {
    throw new SieImportError('Importens resultat kunde inte hämtas. Kontrollera importhistoriken innan du försöker igen.', 'IMPORT_FAILED')
  }
  if (!response.ok || result.success !== true) {
    const codes: Record<string, SieImportError['code']> = { '23505': 'ALREADY_IMPORTED', P2001: 'OPENING_BALANCE_EXISTS', P2074: 'OPENING_BALANCE_CONFLICT', '22023': 'VALIDATION_FAILED' }
    // The server returns fixed, sanitized messages, never raw parser/DB errors.
    throw new SieImportError(typeof result.error === 'string' ? result.error : 'Importen kunde inte genomföras.', codes[String(result.code)] ?? 'IMPORT_FAILED')
  }
  return result as unknown as ImportSieBatchResult
}
