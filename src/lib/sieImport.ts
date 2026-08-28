// src/lib/sieImport.ts
//
// Klientsidan av SIE-importen. Bygger payload från ett SieParseResult,
// beräknar dubblettskyddande hash, anropar den atomära databasfunktionen
// import_sie_batch() (se sie_import_schema.sql), och tolkar resultatet.
//
// All faktisk skrivning till transactions/journal_entries sker i databasen,
// i EN transaktion. Den här filen orkestrerar aldrig flera separata
// supabase.from(...).insert()-anrop för importen - se arkitekturanalysen
// om varför det inte kan vara transaktionssäkert från klienten.

import { supabase } from './supabaseClient'
import { getUserId } from './accountingService'
import type { SieParseResult } from './sieParser'

/** Resultatet av en lyckad importSieBatch()-körning. */
export interface ImportSieBatchResult {
  success: true
  importBatchId: string
  verificationCount: number
  importedCount: number
}

/**
 * Kastas när importen avvisas eller misslyckas. `code` låter UI:t skilja
 * på "redan importerad" (kan visas som info) och andra fel (bör visas som fel).
 */
export class SieImportError extends Error {
  code: 'ALREADY_IMPORTED' | 'VALIDATION_FAILED' | 'IMPORT_FAILED'

  constructor(message: string, code: SieImportError['code']) {
    super(message)
    this.name = 'SieImportError'
    this.code = code
  }
}

/**
 * Importerar ett parsat SIE-resultat till databasen.
 *
 * Förutsätter att parseResult redan är validerat i UI:t (preview-steget) -
 * denna funktion vägrar ändå köra om parseResult.errors inte är tom, som
 * ett sista skyddsnät.
 */
export async function importSieBatch(
  parseResult: SieParseResult,
  filename: string
): Promise<ImportSieBatchResult> {
  await getUserId() // kastar om ingen är inloggad - samma mönster som övriga accountingService

  if (parseResult.errors.length > 0) {
    throw new SieImportError(
      `Filen kan inte importeras: ${parseResult.errors.length} valideringsfel kvarstår (t.ex. obalanserade verifikationer). Åtgärda källfilen och försök igen.`,
      'VALIDATION_FAILED'
    )
  }
  if (parseResult.verifications.length === 0) {
    throw new SieImportError('Filen innehåller inga verifikationer att importera.', 'VALIDATION_FAILED')
  }

  const fileHash = await computeCanonicalHash(parseResult)

  const payload = {
    filename,
    file_hash: fileHash,
    company_name: parseResult.companyName,
    org_nr: parseResult.orgNr,
    fiscal_year: parseResult.year,
    verifications: parseResult.verifications.map((v) => ({
      series: v.series,
      ver_number: v.verNumber,
      date: v.date,
      description: v.description,
      rows: v.transactions.map((t) => ({
        account_number: t.accountNumber,
        amount: t.amount,
        date: t.transDate ?? v.date,
        description: t.description ?? null,
      })),
    })),
  }

  const { data, error } = await supabase.rpc('import_sie_batch', { p_payload: payload })

  if (error) {
    if (error.code === '23505') {
      throw new SieImportError('Den här filen är redan importerad tidigare.', 'ALREADY_IMPORTED')
    }
    throw new SieImportError('Importen misslyckades och rullades tillbaka: ' + error.message, 'IMPORT_FAILED')
  }
  if (!data?.success) {
    throw new SieImportError('Importen misslyckades av okänd anledning.', 'IMPORT_FAILED')
  }

  return {
    success: true,
    importBatchId: data.import_batch_id,
    verificationCount: data.verification_count,
    importedCount: data.imported_count,
  }
}

/**
 * Beräknar en deterministisk hash av det PARSADE innehållet - inte av
 * filens råa bytes. Detta är medvetet: SIE-filer innehåller alltid en
 * #GEN-rad (exporttidsstämpel) som ändras vid varje export även om den
 * underliggande bokföringen är identisk. Att hasha bytes skulle göra att
 * samma bokföring, exporterad två gånger, alltid räknades som "olika filer".
 *
 * Sorteringen (per verifikation och per rad) gör hashen oberoende av i
 * vilken ordning filen råkar lista verifikationer/rader.
 */
async function computeCanonicalHash(parseResult: SieParseResult): Promise<string> {
  const verificationLines = parseResult.verifications
    .map((v) => {
      const rows = v.transactions
        .map((t) => `${t.accountNumber}:${t.amount.toFixed(2)}`)
        .sort()
        .join(',')
      return `${v.series}${v.verNumber}|${v.date}|${v.description}|${rows}`
    })
    .sort()

  const canonical = [
    parseResult.companyName ?? '',
    parseResult.orgNr ?? '',
    String(parseResult.year ?? ''),
    ...verificationLines,
  ].join('\n')

  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}