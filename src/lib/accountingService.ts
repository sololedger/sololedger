import { supabase } from './supabaseClient'
import { calculateBusinessResult } from './resultEngine'

// Hjälpfunktion för att hämta användarens ID på ett 100% skottsäkert och server-verifierat sätt
// Exporterad så sieImport.ts kan återanvända den istället för att duplicera logiken.
export async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Ingen giltig eller inloggad användare hittades.")
  return user.id
}

// BACKEND-SKYDD: Kastar fel om räkenskapsåret är låst (Fixad med sträng-slice för att undvika tidszonsförskjutningar)
async function assertYearOpen(date: string) {
  const year = parseInt(date.slice(0, 4))
  const locked = await isYearClosed(year)
  if (locked) {
    throw new Error(`Räkenskapsår ${year} är låst för ändringar.`)
  }
}

export async function bookTransaction(tx: any) {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  // Hela den vanliga bokningen sker nu atomärt i databasen:
  // transaction + ver_nr + journal_entries skapas i samma PostgreSQL-transaktion.
  // Om något steg misslyckas rullas allt tillbaka.
  const payload = {
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    vat_rate: tx.vat_rate ?? 0,
    file_url: tx.file_url ?? null,
  }

  const { data, error } = await supabase.rpc('book_transaction_atomic', {
    p_payload: payload,
  })

  if (error) {
    throw new Error('Bokföringen misslyckades och rullades tillbaka: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Bokföringen misslyckades av okänd anledning.')
  }

  return {
    success: true,
    transactionId: data.transaction_id as string,
    verNr: Number(data.ver_nr),
  }
}

// BACKEND-SKYDD FÖR REDIGERING:
// All validering och själva UPDATE sker i databasen via en atomisk, server-side RPC.
// Klienten får därför inte själv avgöra ägarskap, låsta år eller vilka fält som får ändras.
export async function updateTransaction(txId: string, updates: any) {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  const { data, error } = await supabase.rpc('update_transaction_safe', {
    p_tx_id: txId,
    p_updates: updates ?? {},
  })

  if (error) {
    throw new Error('Kunde inte uppdatera transaktionen: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Kunde inte uppdatera transaktionen av okänd anledning.')
  }
}

export async function getAccountBalances(year: number) {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  const userId = await getUserId()

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('user_id', userId)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return {}

  // SÄKERHETSBÄLTE: Filtrera även journalrader på user_id för att undvika data-läckage
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
    .eq('user_id', userId)
  if (entryError) throw entryError

  const balances: Record<string, number> = {}
  entries?.forEach(e => {
    const acc = e.account_number.toString()
    balances[acc] = Math.round(
      ((balances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })
  return balances
}

/**
 * Kumulativ balans för balanskonton (1xxx-2xxx), från bokföringens start
 * till och med 31 december angivet år - till skillnad från
 * getAccountBalances() som bara summerar det angivna kalenderårets egna
 * rörelser.
 *
 * Steg 1 av carry-forward-arbetet: helt fristående funktion. Används INTE
 * av någon befintlig konsument ännu - getAccountBalances() och alla dess
 * nuvarande anropare (Dashboard, NE-bilagan, SIE-export m.fl.) är oförändrade.
 *
 * Samma saldokonvention (debit - credit per konto) och samma dubbla
 * user_id-filtrering (transactions + journal_entries) som
 * getAccountBalances() - se den funktionen för bakgrund.
 */
export async function getBalanceSheetBalances(year: number) {
  const endDate = `${year}-12-31`
  const userId = await getUserId()

  // Ingen nedre datumgräns - det är hela poängen: alla transaktioner
  // sedan bokföringens start, inte bara det valda kalenderåret.
  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .lte('date', endDate)
    .eq('user_id', userId)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return {}

  // SÄKERHETSBÄLTE: samma dubbla user_id-filtrering som getAccountBalances()
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
    .eq('user_id', userId)
  if (entryError) throw entryError

  const balances: Record<string, number> = {}
  entries?.forEach(e => {
    const acc = e.account_number.toString()

    // Endast balanskonton (1xxx-2xxx). Resultatkonton (3xxx-8xxx) hanteras
    // fortsatt uteslutande av getAccountBalances() och ska inte vara
    // kumulativa.
    if (!acc.startsWith('1') && !acc.startsWith('2')) return

    balances[acc] = Math.round(
      ((balances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })
  return balances
}

export type VatPeriodType = 'month' | 'quarter' | 'year'
export type VatPeriodStatus = 'open' | 'closed' | 'declared'
export type VatPeriodSource = 'sololedger' | 'imported_history'

export interface VatPeriod {
  id: string
  period_start: string
  period_end: string
  period_type: VatPeriodType
  status: VatPeriodStatus
  source: VatPeriodSource
  closing_amount: number | null
  closing_transaction_id: string | null
  declared_at: string | null
}

export interface EnsureVatPeriodsResult {
  success: boolean
  created_count: number
  existing_count: number
  period_type: VatPeriodType
  management_from: string
  through_date: string
}

export interface CloseVatPeriodResult {
  success: boolean
  already_closed: boolean
  vat_period_id: string
  status: VatPeriodStatus
  closing_amount: number | null
  closing_transaction_id: string | null
  transaction_created?: boolean
  ver_nr?: number
}

type VatPeriodRow = Omit<VatPeriod, 'closing_amount'> & {
  closing_amount: number | string | null
}

function normalizeVatPeriod(row: VatPeriodRow): VatPeriod {
  return {
    ...row,
    closing_amount: row.closing_amount == null ? null : Number(row.closing_amount),
  }
}

export async function ensureVatPeriods(throughDate: string): Promise<EnsureVatPeriodsResult> {
  await getUserId()

  const { data, error } = await supabase.rpc('ensure_vat_periods', {
    p_through_date: throughDate,
  })

  if (error) {
    throw new Error('Kunde inte säkerställa momsperioder: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Kunde inte säkerställa momsperioder av okänd anledning.')
  }

  return {
    success: Boolean(data.success),
    created_count: Number(data.created_count ?? 0),
    existing_count: Number(data.existing_count ?? 0),
    period_type: data.period_type as VatPeriodType,
    management_from: data.management_from as string,
    through_date: data.through_date as string,
  }
}

export async function getVatPeriods(startDate: string, endDate: string): Promise<VatPeriod[]> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('vat_periods')
    .select('id, period_start, period_end, period_type, status, source, closing_amount, closing_transaction_id, declared_at')
    .eq('user_id', userId)
    .lte('period_start', endDate)
    .gte('period_end', startDate)
    .order('period_start', { ascending: false })

  if (error) {
    throw new Error('Kunde inte hämta momsperioder: ' + error.message)
  }

  return ((data || []) as VatPeriodRow[]).map(normalizeVatPeriod)
}

export async function closeVatPeriod(periodId: string): Promise<CloseVatPeriodResult> {
  await getUserId()

  const { data, error } = await supabase.rpc('close_vat_period_atomic', {
    p_vat_period_id: periodId,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.success) {
    throw new Error('Momsperioden kunde inte stängas av okänd anledning.')
  }

  return {
    success: Boolean(data.success),
    already_closed: Boolean(data.already_closed),
    vat_period_id: data.vat_period_id as string,
    status: data.status as VatPeriodStatus,
    closing_amount: data.closing_amount == null ? null : Number(data.closing_amount),
    closing_transaction_id: data.closing_transaction_id ?? null,
    transaction_created: data.transaction_created == null ? undefined : Boolean(data.transaction_created),
    ver_nr: data.ver_nr == null ? undefined : Number(data.ver_nr),
  }
}

/**
 * Beräknar utgående/ingående moms och netto för en period ("Alternativ E", låst arkitekturbeslut).
 *
 * Summerar rörelser på momskonton (261x/262x/263x utgående, 264x ingående) inom
 * [startDate, endDate], men EXKLUDERAR alla momskontorader vars verifikation även
 * innehåller en rad på ett avräkningskonto (265x, t.ex. 2650). En sådan verifikation
 * är en intern momsombokning (flyttar ackumulerad moms till avräkningskontot),
 * inte en ny affärshändelse - och ska därför inte räknas som periodens moms.
 *
 * Detta ersätter den tidigare modellen som bara summerade 2611/2641 rakt av,
 * vilken visade 0 kr för importerad SIE-data eftersom källbokföringen gör
 * periodiska momsombokningar som nollar ut exakt de kontona inom samma period.
 *
 * Konton utanför 26xx (t.ex. betalningar mot 1930 vid en skattedeklaration)
 * påverkar aldrig resultatet - de saknar momskontorader att exkludera eller
 * räkna med i första läget.
 *
 * Detta är den ENDA platsen momsberäkningen görs. Momsrapport.tsx, Dashboard
 * (via calculations.ts) och all annan momsvisning ska anropa den här funktionen
 * istället för att räkna själva - annars riskerar olika delar av appen visa
 * olika siffror för samma period.
 */
export interface MomsBreakdown {
  utgaendeMoms: number
  ingaendeMoms: number
  momsNetto: number

  // För momsrapport/SKV 4700. Optional för bakåtkompatibilitet med befintliga
  // initialvärden i Dashboard/useAccountingData tills UI-steget är uppdaterat.
  utgaendeMoms25?: number
  utgaendeMoms12?: number
  utgaendeMoms6?: number
  momspliktigForsaljning25?: number
  momspliktigForsaljning12?: number
  momspliktigForsaljning6?: number
  momspliktigForsaljning?: number
}

export async function getMomsBreakdown(startDate: string, endDate: string): Promise<MomsBreakdown> {
  const userId = await getUserId()

  const isUtgåendeMomskonto = (acc: string) =>
    acc.startsWith('261') || acc.startsWith('262') || acc.startsWith('263')
  const isIngåendeMomskonto = (acc: string) => acc.startsWith('264')
  const isAvräkningskonto = (acc: string) => acc.startsWith('265')

  const vatRateForAccount = (acc: string): 25 | 12 | 6 | null => {
    if (acc.startsWith('261')) return 25
    if (acc.startsWith('262')) return 12
    if (acc.startsWith('263')) return 6
    return null
  }

  // STEG 1: hitta de verifikationer som faktiskt har en momsrad (261x–264x)
  // vars EGET raddatum ligger i vald period.
  //
  // Viktigt: vi använder inte detta begränsade resultat för att avgöra om
  // verifikationen är en intern momsombokning. En SIE-verifikation kan ha olika
  // datum på sina #TRANS-rader och 265x-raden kan därför ligga precis utanför
  // perioden. Det var den tidigare periodgränsbuggen.
  const { data: period26Rows, error: periodError } = await supabase
    .from('journal_entries')
    .select('account_number, transaction_id')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .like('account_number', '26%')
  if (periodError) throw periodError

  const candidateTransactionIds = Array.from(new Set(
    (period26Rows || [])
      .filter(r => isUtgåendeMomskonto(r.account_number) || isIngåendeMomskonto(r.account_number))
      .map(r => r.transaction_id)
  ))

  if (candidateTransactionIds.length === 0) {
    return {
      utgaendeMoms: 0,
      ingaendeMoms: 0,
      momsNetto: 0,
      utgaendeMoms25: 0,
      utgaendeMoms12: 0,
      utgaendeMoms6: 0,
      momspliktigForsaljning25: 0,
      momspliktigForsaljning12: 0,
      momspliktigForsaljning6: 0,
      momspliktigForsaljning: 0,
    }
  }

  // STEG 2: hämta SAMTLIGA 26xx-rader för kandidatverifikationerna, oavsett
  // raddatum. Dessa fullständiga verifikationer används bara för att upptäcka
  // om en 265x-rad finns någonstans i samma verifikation.
  //
  // Själva momsbeloppen summeras fortfarande ENDAST från rader vars datum
  // ligger inom [startDate, endDate].
  const { data: all26Rows, error: allRowsError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit, transaction_id, date')
    .eq('user_id', userId)
    .in('transaction_id', candidateTransactionIds)
    .like('account_number', '26%')
  if (allRowsError) throw allRowsError

  const byTransaction: Record<
    string,
    { account_number: string; debit: number; credit: number; date: string }[]
  > = {}

  all26Rows?.forEach(e => {
    const key = e.transaction_id
    if (!byTransaction[key]) byTransaction[key] = []
    byTransaction[key].push({
      account_number: e.account_number,
      debit: Number(e.debit),
      credit: Number(e.credit),
      date: e.date,
    })
  })

  let utgaendeMoms25 = 0
  let utgaendeMoms12 = 0
  let utgaendeMoms6 = 0
  let ingaendeMoms = 0

  Object.values(byTransaction).forEach(rows => {
    // Om SAMMA verifikation innehåller 265x är det en intern momsombokning.
    // Detta kontrolleras nu över hela verifikationen, även om 265x-raden ligger
    // utanför rapportperioden.
    const ärOmföring = rows.some(r => isAvräkningskonto(r.account_number))
    if (ärOmföring) return

    rows.forEach(r => {
      // Bara momsradens eget datum avgör om beloppet hör till vald period.
      if (r.date < startDate || r.date > endDate) return

      const netCredit = r.credit - r.debit

      if (isUtgåendeMomskonto(r.account_number)) {
        const rate = vatRateForAccount(r.account_number)
        if (rate === 25) utgaendeMoms25 += netCredit
        if (rate === 12) utgaendeMoms12 += netCredit
        if (rate === 6) utgaendeMoms6 += netCredit
      } else if (isIngåendeMomskonto(r.account_number)) {
        // Avdragsperspektiv: debetöverskott på 264x = positiv ingående moms.
        ingaendeMoms += -netCredit
      }
    })
  })

  const round2 = (n: number) => Math.round(n * 100) / 100

  utgaendeMoms25 = round2(utgaendeMoms25)
  utgaendeMoms12 = round2(utgaendeMoms12)
  utgaendeMoms6 = round2(utgaendeMoms6)
  ingaendeMoms = round2(ingaendeMoms)

  const utgaendeMoms = round2(utgaendeMoms25 + utgaendeMoms12 + utgaendeMoms6)
  const momsNetto = round2(utgaendeMoms - ingaendeMoms)

  // Försäljningsunderlaget kan härledas direkt från utgående moms när kontot
  // anger skattesatsen (261x=25 %, 262x=12 %, 263x=6 %). Det gör att även
  // importerad SIE-data utan transactions.vat_rate kan presenteras korrekt.
  const momspliktigForsaljning25 = round2(utgaendeMoms25 / 0.25)
  const momspliktigForsaljning12 = round2(utgaendeMoms12 / 0.12)
  const momspliktigForsaljning6 = round2(utgaendeMoms6 / 0.06)
  const momspliktigForsaljning = round2(
    momspliktigForsaljning25 + momspliktigForsaljning12 + momspliktigForsaljning6
  )

  return {
    utgaendeMoms,
    ingaendeMoms,
    momsNetto,
    utgaendeMoms25,
    utgaendeMoms12,
    utgaendeMoms6,
    momspliktigForsaljning25,
    momspliktigForsaljning12,
    momspliktigForsaljning6,
    momspliktigForsaljning,
  }
}

export async function createCorrectionTransaction(originalTxId: string): Promise<number> {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  // Hela korrigeringsflödet sker nu atomärt i databasen:
  // korrigeringstransaktion + ver_nr + spegelvända journalrader och,
  // vid periodisering, även korrigering av vändningsverifikationen.
  // Om något steg misslyckas rullas ALLT tillbaka.
  const { data, error } = await supabase.rpc('create_correction_transaction_atomic', {
    p_original_tx_id: originalTxId,
  })

  if (error) {
    throw new Error('Korrigeringen misslyckades och rullades tillbaka: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Korrigeringen misslyckades av okänd anledning.')
  }

  return Number(data.ver_nr)
}

/**
 * Periodisering: Bokför en utgift som sträcker sig över ett nyårsskifte.
 */
export async function bookPeriodizedTransaction(tx: any) {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  // Hela periodiseringen sker nu atomärt i databasen:
  // båda transactions, båda verifikationsnumren och samtliga journalrader
  // skapas i samma PostgreSQL-transaktion. Om något steg misslyckas
  // rullas HELA periodiseringen tillbaka.
  const payload = {
    date: tx.date,
    future_date: tx.future_date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    vat_rate: tx.vat_rate ?? 0,
    file_url: tx.file_url ?? null,
  }

  const { data, error } = await supabase.rpc('book_periodized_transaction_atomic', {
    p_payload: payload,
  })

  if (error) {
    throw new Error('Periodiseringen misslyckades och rullades tillbaka: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Periodiseringen misslyckades av okänd anledning.')
  }

  return {
    success: true,
    ver_nr: Number(data.ver_nr),
    reversal_ver_nr: Number(data.reversal_ver_nr),
    transaction_id: data.transaction_id as string,
    reversal_transaction_id: data.reversal_transaction_id as string,
    periodization_group_id: data.periodization_group_id as string,
  }
}

// ── RÄKENSKAPSÅRSLÅSNING ───────────────────────────────────────────────────
export async function isYearClosed(year: number): Promise<boolean> {
  const userId = await getUserId()
  const { data, error } = await supabase
    .from('closed_years')
    .select('id')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle()
  if (error) throw new Error('Kunde inte kontrollera låsstatus: ' + error.message)
  return data !== null
}

export async function closeYear(year: number): Promise<void> {
  const { error } = await supabase.rpc('close_year_atomic', {
    p_year: year,
  })

  if (error) {
    throw new Error(error.message || 'Kunde inte låsa räkenskapsåret.')
  }
}

/**
 * Steg 1 av B10-arbetet: ren, fristående resultatformel - extraherad ur
 * getNEData() utan någon beteendeförändring. Tar emot VILKET balansobjekt
 * som helst (idag: årsvist balances från getAccountBalances; i ett senare
 * steg: ett kumulativt balansobjekt) och returnerar samma R1-R10/R11-R17
 * som tidigare låg inline. Ingen kumulativ logik här - bara en flytt.
 */
/**
 * Gemensam resultatmotor för SoloLedger.
 *
 * Själva klassificeringen av resultatkonton, teckenhanteringen och
 * NE-raderna R1-R10 finns i resultEngine.ts.
 *
 * Den här adaptern behåller accountingService.ts befintliga returformat
 * så att getNEData(), getCumulativeResultat() och B10-logiken kan fortsätta
 * fungera utan andra ändringar i detta steg.
 */
function computeResultat(balances: Record<string, number>) {
  const result = calculateBusinessResult(balances)

  const {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
    R7,
    R8,
    R9,
    R10,
  } = result.neRows

  const bokfRes = result.bokfortResultat
  const ejAvdr = result.ejAvdragsgillt

  // NE sida 2 – skattemässiga justeringar:
  // R12 = bokfört resultat från R11
  // R13 = bokförda kostnader som inte ska dras av
  // R14 = bokförda intäkter som inte ska tas upp
  // R15 = intäkter som inte bokförts men ska tas upp
  // R16 = kostnader som inte bokförts men ska dras av
  //
  // SoloLedger har i nuläget automatisk mappning för R13 via konto 6992.
  // R14–R16 är fortsatt 0 tills särskilt stöd finns.
  const R11 = bokfRes
  const R12 = R11
  const R13 = ejAvdr
  const R14 = 0
  const R15 = 0
  const R16 = 0
  const R17 = result.skattemassigtResultat

  return {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
    R7,
    R8,
    R9,
    R10,
    ejAvdr,
    bokfRes,
    R11,
    R12,
    R13,
    R14,
    R15,
    R16,
    R17,

    // Behålls internt för kommande varnings-/avstämningssteg.
    warnings: result.warnings,
    unresolvedResultEffect: result.unresolvedResultEffect,
    reconciliationDifference: result.reconciliationDifference,
  }
}

/**
 * Steg 2 av B10-arbetet: kumulativt bokfört resultat (R1-R10/R11-R17) för
 * ALLA resultatkonton (3xxx-8xxx), från bokföringens start t.o.m. 31
 * december angivet år - till skillnad från getAccountBalances(year) som
 * bara summerar det angivna kalenderåret.
 *
 * Bygger INGEN egen R1-R8-logik. Bygger bara ett kumulativt balansobjekt,
 * exakt samma mönster som getBalanceSheetBalances() (ingen nedre
 * datumgräns, samma dubbla user_id-filtrering, samma debit-credit-
 * konvention), men utan kontoprefix-filter - computeResultat() läser
 * ändå bara de resultatkonton (3xxx-8xxx) den bryr sig om, så en äkta
 * öppningsbalans (som bara innehåller balanskonton, t.ex. 1930/2010)
 * påverkar aldrig detta resultat, oavsett dess source/type.
 *
 * Returnerar HELA computeResultat()-resultatet (inte bara bokfRes), så att
 * R1-R8-nedbrytningen också går att inspektera isolerat vid verifiering -
 * kostar inget extra eftersom computeResultat() redan räknar ut alla
 * fälten tillsammans.
 *
 * Ännu inte kopplad till getNEData/B10 eller någon UI - helt fristående
 * i detta steg.
 */
export async function getCumulativeResultat(year: number) {
  const endDate = `${year}-12-31`
  const userId = await getUserId()

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .lte('date', endDate)
    .eq('user_id', userId)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return computeResultat({})

  // SÄKERHETSBÄLTE: samma dubbla user_id-filtrering som getBalanceSheetBalances()
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
    .eq('user_id', userId)
  if (entryError) throw entryError

  const cumulativeBalances: Record<string, number> = {}
  entries?.forEach(e => {
    const acc = e.account_number.toString()
    cumulativeBalances[acc] = Math.round(
      ((cumulativeBalances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })

  return computeResultat(cumulativeBalances)
}

export async function getNEData(year: number) {
  const balances = await getAccountBalances(year)
  // Steg 3: hämtas ENDAST för att ge B13_forutbetalda (konto 1790) ett
  // kumulativt saldo istället för årets egna rörelse. Används inte för
  // något annat fält i denna funktion i detta steg.
  const balanceSheetBalances = await getBalanceSheetBalances(year)

  const { R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, ejAvdr, bokfRes, R11, R12, R13, R14, R15, R16, R17 } = computeResultat(balances)

  // B10 är kumulativt och ska följa K1:s eget-kapital-konton för
  // enskild näringsverksamhet. BAS K1 placerar 2010, 2011, 2012, 2013,
  // 2014, 2017 och 2019 i B10. SoloLedger använder dessutom 2018
  // ("Övriga egna insättningar"), som i nuvarande BAS också tillhör
  // eget-kapitalgruppen.
  //
  // Vi behåller den redan verifierade carry-forward-modellen:
  //   kapital/start + kumulativt bokfört resultat + insättningar - uttag.
  // Skillnaden här är att alla relevanta K1-konton nu fångas upp.
  //
  // Viktigt: vi klipper inte längre uttag/insättningar till >= 0. En kredit
  // på ett uttagskonto eller en debet på ett insättningskonto kan vara en
  // legitim rättning/återföring och ska då påverka B10 åt motsatt håll.
  // Det bevarar även balansidentiteten.
  const kumulativtEgetKapitalStart =
    -(balanceSheetBalances['2010'] || 0) -
    (balanceSheetBalances['2019'] || 0)

  // Uttagskonton i K1:
  // 2011 Egna varuuttag
  // 2012 Avräkning för skatter och avgifter
  // 2013 Övriga egna uttag
  // 2014 Uttag förmåner
  const kumulativaUttag =
    (balanceSheetBalances['2011'] || 0) +
    (balanceSheetBalances['2012'] || 0) +
    (balanceSheetBalances['2013'] || 0) +
    (balanceSheetBalances['2014'] || 0)

  // Insättningskonton:
  // 2017 Egna insättningar / Årets kapitaltillskott (K1/BAS)
  // 2018 Övriga egna insättningar (SoloLedgers standard och nuvarande BAS)
  // Båda är kreditnormala i vår debet-minus-kredit-konvention och vänds därför.
  const kumulativaInsattningar =
    -(
      (balanceSheetBalances['2017'] || 0) +
      (balanceSheetBalances['2018'] || 0)
    )

  const cumulativeResult = await getCumulativeResultat(year)

  const IB_kapital = Math.round(kumulativtEgetKapitalStart * 100) / 100
  const uttag = Math.round(kumulativaUttag * 100) / 100
  const insattningar = Math.round(kumulativaInsattningar * 100) / 100
  const B10_total = Math.round(
    (IB_kapital + cumulativeResult.bokfRes + insattningar - uttag) * 100
  ) / 100

  // --- BALANSRÄKNING / NE B1-B16 (förenklat årsbokslut, K1) ---
  //
  // getBalanceSheetBalances() använder debet-minus-kredit:
  //   tillgångar -> normalt positiva
  //   skulder/eget kapital -> normalt negativa
  //
  // För förenklat årsbokslut fylls B1-B10 och B13-B16 i.
  // B11 och B12 används inte i den förenklade NE-balansen.

  const sumBalanceRange = (start: number, end: number) =>
    Object.entries(balanceSheetBalances)
      .filter(([acc]) => {
        const n = parseInt(acc)
        return Number.isInteger(n) && n >= start && n <= end
      })
      .reduce((sum, [, value]) => sum + (value as number), 0)

  const sumBalanceAccounts = (prefixes: string[]) =>
    Object.entries(balanceSheetBalances)
      .filter(([acc]) => prefixes.some(prefix => acc.startsWith(prefix)))
      .reduce((sum, [, value]) => sum + (value as number), 0)

  const round2 = (value: number) => Math.round(value * 100) / 100
  const assetValue = (value: number) => round2(Math.max(0, value))
  const liabilityValue = (value: number) => round2(Math.max(0, -value))

  // Tillgångar
  const B1 = assetValue(sumBalanceRange(1000, 1099)) // Immateriella anläggningstillgångar
  const B2 = assetValue(
    sumBalanceRange(1110, 1119) + sumBalanceRange(1150, 1159)
  ) // Byggnader och markanläggningar
  const B3 = assetValue(
    sumBalanceRange(1130, 1139) + sumBalanceRange(1180, 1189)
  ) // Mark och andra ej avskrivningsbara tillgångar
  const B4 = assetValue(sumBalanceRange(1220, 1249)) // Maskiner och inventarier
  const B5 = assetValue(sumBalanceRange(1300, 1399)) // Övriga anläggningstillgångar
  const B6 = assetValue(sumBalanceRange(1400, 1499)) // Varulager
  const B7 = assetValue(sumBalanceRange(1500, 1599)) // Kundfordringar

  // B8 omfattar övriga fordringar, inklusive periodiseringar som 1790.
  // Om moms-/skatteområdet netto har debetsaldo är det också en fordran.
  const taxRaw = sumBalanceAccounts(['261', '262', '263', '264', '265', '266', '271', '273'])
  const taxReceivable = Math.max(0, taxRaw)
  const B8 = assetValue(sumBalanceRange(1600, 1899) + taxReceivable)

  const B9 = assetValue(sumBalanceRange(1900, 1999)) // Kassa och bank

  // Skulder
  const B13 = liabilityValue(sumBalanceRange(2300, 2399)) // Låneskulder
  const B14 = liabilityValue(taxRaw) // Skatteskulder / nettomoms m.m.
  const B15 = liabilityValue(sumBalanceRange(2440, 2449)) // Leverantörsskulder
  const B16 = liabilityValue(sumBalanceRange(2900, 2999)) // Övriga skulder

  // Behåll dessa alias under övergången så att annan befintlig UI-kod inte
  // behöver gå sönder medan NE-vyn flyttas till korrekta B-rutor.
  const bank = B9
  const B13_forutbetalda = assetValue(balanceSheetBalances['1790'] || 0)

  return {
    R1, R2, R3, R4, R5, R6, R7, R8, R9, R10,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11, R12, R13, R14, R15, R16, R17,
    IB_kapital, insattningar, uttag,
    bank, B10_total,
    B1, B2, B3, B4, B5, B6, B7, B8, B9,
    B13, B14, B15, B16,
    B13_forutbetalda,
  }
}
