import { supabase } from './supabaseClient'

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

// BACKEND-SKYDD FÖR REDIGERING: Helt skyddad mot payload-manipulation och otillåtna ändringar
export async function updateTransaction(txId: string, updates: any) {
  const userId = await getUserId()

  // Hämta befintlig transaktion från databasen
  const { data: existing, error: fetchError } = await supabase
    .from('transactions')
    .select('date, user_id, booked')
    .eq('id', txId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !existing) throw new Error("Transaktionen hittades inte eller tillhör inte dig.")

  // 1. Kontrollera att det befintliga datumets år är öppet
  await assertYearOpen(existing.date)
  
  // 2. Kontrollera att det nya önskade datumets år också är öppet (om datumet ändras)
  if (updates.date) {
    await assertYearOpen(updates.date)
  }

  // 3. REVISIONSKONTROLL (GPT-5): Om transaktionen redan är bokförd, tillåt INTE ändring av ekonomisk data
  if (existing.booked && (
    updates.amount !== undefined ||
    updates.type !== undefined ||
    updates.vat_rate !== undefined
  )) {
    throw new Error("Bokförda och låsta transaktioner får inte ändras i belopp, kategori eller moms.")
  }

  // 4. WHITELISTING PAYLOAD (GPT-5): Filtrera bort eventuellt skadliga fält som injicerats (t.ex. user_id eller booked)
  const safeUpdates: any = {}
  if (updates.date !== undefined) safeUpdates.date = updates.date
  if (updates.description !== undefined) safeUpdates.description = updates.description
  if (updates.amount !== undefined) safeUpdates.amount = updates.amount
  if (updates.type !== undefined) safeUpdates.type = updates.type
  if (updates.vat_rate !== undefined) safeUpdates.vat_rate = updates.vat_rate
  if (updates.file_url !== undefined) safeUpdates.file_url = updates.file_url

  // Utför den säkra uppdateringen
  const { error: updateError } = await supabase
    .from('transactions')
    .update(safeUpdates)
    .eq('id', txId)
    .eq('user_id', userId)

  if (updateError) throw updateError
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

export async function deleteTransaction(id: string) {
  const userId = await getUserId()

  // SÄKERHETSBÄLTE: Hämta transaktionen först för att veta vilket datum/år den tillhör
  const { data: tx, error: fetchError } = await supabase
    .from('transactions')
    .select('date')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (fetchError || !tx) throw new Error("Transaktionen hittades inte.")
  
  // Säkerställ att året är öppet innan radering sker
  await assertYearOpen(tx.date)

  // SÄKERHETSBÄLTE: Tillåt bara radering av egna journalrader och transaktioner
  const { error: journalError } = await supabase
    .from('journal_entries')
    .delete()
    .eq('transaction_id', id)
    .eq('user_id', userId)
  if (journalError) throw new Error("Kunde inte radera bokföringsposter: " + journalError.message)

  const { error: txError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (txError) throw new Error("Kunde inte radera transaktionen: " + txError.message)
}

export async function createCorrectionTransaction(originalTxId: string): Promise<number> {
  const userId = await getUserId()
  const today = new Date().toISOString().split('T')[0]

  // SÄKERHETSBÄLTE: Hämta originaltransaktionen och kräv att den tillhör den inloggade
  const { data: originalTx, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', originalTxId)
    .eq('user_id', userId)
    .single()
  if (txError || !originalTx) throw new Error("Kunde inte hämta originaltransaktionen.")

  // Korrigeringen får aldrig dateras före originalverifikationen. Normalfallet
  // (originalet ligger bakåt i tiden) ger dagens datum, precis som tidigare.
  // Om originalet av misstag ligger framåt i tiden (t.ex. felskriven framtida
  // datering) används istället originalets datum, så korrigeringen aldrig
  // hamnar kronologiskt före det den korrigerar.
  const correctionDate = today > originalTx.date ? today : originalTx.date

  // Säkerställ att ÅRET FÖR DEN FAKTISKA KORRIGERINGSDATERINGEN är öppet -
  // inte nödvändigtvis dagens år, om originalet låg framåt i tiden.
  await assertYearOpen(correctionDate)

  // SÄKERHETSBÄLTE: Hämta originalets journalposter och kräv att de tillhör den inloggade
  const { data: originalEntries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('transaction_id', originalTxId)
    .eq('user_id', userId)
  if (entriesError || !originalEntries?.length) throw new Error("Kunde inte hämta originalbokföringen.")

  const originalVerNr = originalEntries[0].ver_nr

  // Hämta nästa ver_nr atomärt via databas-sekvens (race-condition-säker)
  const { data: verNrData3, error: verNrError3 } = await supabase
    .rpc('get_next_ver_nr', { p_user_id: userId })
  if (verNrError3 || verNrData3 === null) throw new Error('Kunde inte generera ver_nr: ' + verNrError3?.message)
  const nextVerNr = verNrData3 as number

  // Skapa korrigeringstransaktionen
  const { data: corrTx, error: corrTxError } = await supabase
    .from('transactions')
    .insert([{
      date: correctionDate,
      description: `↩ Korrigering av VER-${originalVerNr} (${originalTx.description})`,
      amount: originalTx.amount,
      type: originalTx.type,
      vat_rate: originalTx.vat_rate,
      booked: true,
      is_correction: true,
      corrects_ver_nr: originalVerNr,
      user_id: userId,
    }])
    .select()
    .single()
  if (corrTxError || !corrTx) throw new Error("Kunde inte skapa korrigeringstransaktion: " + corrTxError?.message)

  // Skapa spegelvända journalposter (debet↔kredit byter plats)
  const correctionEntries = originalEntries.map((e: any) => ({
    transaction_id: corrTx.id,
    ver_nr: nextVerNr,
    account_number: e.account_number,
    debit: e.credit,
    credit: e.debit,
    description: `Korrigering av VER-${originalVerNr}: ${e.description}`,
    date: correctionDate,
    user_id: userId,
  }))

  const { error: insertError } = await supabase.from('journal_entries').insert(correctionEntries)
  if (insertError) throw new Error("Kunde inte skapa korrigeringsposter: " + insertError.message)

  // ── PERIODISERINGSKORRIGERING ──────────────────────────────────────────────
  if (originalTx.periodization_group_id && !originalTx.is_periodized_reversal) {
    const { data: reversalTx, error: reversalTxError } = await supabase
      .from('transactions')
      .select('*')
      .eq('periodization_group_id', originalTx.periodization_group_id)
      .eq('is_periodized_reversal', true)
      .eq('user_id', userId)
      .single()

    if (!reversalTxError && reversalTx) {
      await assertYearOpen(reversalTx.date)

      const { data: reversalEntries, error: reversalEntriesError } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', reversalTx.id)
        .eq('user_id', userId)
      if (reversalEntriesError || !reversalEntries?.length)
        throw new Error("Kunde inte hämta vändningsverifikatets journalposter.")

      const reversalVerNr = reversalEntries[0].ver_nr

      const { data: verNrData4, error: verNrError4 } = await supabase
        .rpc('get_next_ver_nr', { p_user_id: userId })
      if (verNrError4 || verNrData4 === null) throw new Error('Kunde inte generera ver_nr för reversalkorrigering: ' + verNrError4?.message)
      const nextVerNr2 = verNrData4 as number

      const { data: corrReversalTx, error: corrReversalTxError } = await supabase
        .from('transactions')
        .insert([{
          date: reversalTx.date,
          description: `↩ Korrigering av VER-${reversalVerNr} (${reversalTx.description})`,
          amount: reversalTx.amount,
          type: reversalTx.type,
          vat_rate: reversalTx.vat_rate,
          booked: true,
          is_correction: true,
          corrects_ver_nr: reversalVerNr,
          user_id: userId,
        }])
        .select()
        .single()
      if (corrReversalTxError || !corrReversalTx)
        throw new Error("Kunde inte skapa korrigering av vändningsverifikat: " + corrReversalTxError?.message)

      const corrReversalEntries = reversalEntries.map((e: any) => ({
        transaction_id: corrReversalTx.id,
        ver_nr: nextVerNr2,
        account_number: e.account_number,
        debit: e.credit,
        credit: e.debit,
        description: `Korrigering av VER-${reversalVerNr}: ${e.description}`,
        date: reversalTx.date,
        user_id: userId,
      }))

      const { error: insertReversalError } = await supabase.from('journal_entries').insert(corrReversalEntries)
      if (insertReversalError)
        throw new Error("Kunde inte skapa korrigeringsposter för vändningsverifikat: " + insertReversalError.message)
    }
  }

  return nextVerNr
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
  const userId = await getUserId()
  const alreadyClosed = await isYearClosed(year)
  if (alreadyClosed) throw new Error(`År ${year} är redan låst.`)

  const { error } = await supabase
    .from('closed_years')
    .insert([{ user_id: userId, year, closed_at: new Date().toISOString() }])
  if (error) throw new Error('Kunde inte låsa räkenskapsåret: ' + error.message)
}

/**
 * Steg 1 av B10-arbetet: ren, fristående resultatformel - extraherad ur
 * getNEData() utan någon beteendeförändring. Tar emot VILKET balansobjekt
 * som helst (idag: årsvist balances från getAccountBalances; i ett senare
 * steg: ett kumulativt balansobjekt) och returnerar samma R1-R8/R11-R14
 * som tidigare låg inline. Ingen kumulativ logik här - bara en flytt.
 */
function computeResultat(balances: Record<string, number>) {
  const sumRange = (start: number, end: number) => {
    const sum = Object.entries(balances)
      .filter(([acc]) => {
        const n = parseInt(acc)
        return Number.isInteger(n) && n >= start && n <= end
      })
      .reduce((s, [_, v]) => s + (v as number), 0)

    return Math.round(sum * 100) / 100
  }

  const sumAccounts = (accounts: string[]) => {
    const sum = accounts.reduce((s, acc) => s + (balances[acc] || 0), 0)
    return Math.round(sum * 100) / 100
  }

  // NE/K1-mappning för SoloLedgers målgrupp:
  // R1 momspliktiga intäkter
  // R2 momsfria/övriga intäkter
  // R3 bil- och bostadsförmån m.m.
  // R4 ränteintäkter m.m.
  // R5 varor, material och tjänster
  // R6 övriga externa kostnader
  // R7 anställd personal
  // R8 räntekostnader m.m.
  // R9 avskrivningar byggnader/markanläggningar
  // R10 avskrivningar maskiner/inventarier/immateriella tillgångar
  //
  // 3700/3900 och 7700/7980 kan enligt BAS K1 behöva fördelas mellan flera
  // NE-rader beroende på innehåll. SoloLedger använder inte dessa som
  // standardkonton och gissar därför inte automatiskt på dem här.

  const R1 = Math.abs(
    Math.round((sumRange(3000, 3099) + sumRange(3500, 3599)) * 100) / 100
  )

  const R2 = Math.abs(
    Math.round(
      (
        sumRange(3100, 3199) +
        sumRange(3970, 3989)
      ) * 100
    ) / 100
  )

  const R3 = Math.abs(sumRange(3200, 3299))

  const R4 = Math.abs(
    Math.round((sumRange(8310, 8319) + sumRange(8330, 8339)) * 100) / 100
  )

  const R5 = Math.abs(sumRange(4000, 4999))

  // 6992 hör fortfarande till bokföringens externa kostnader och ska därför
  // ingå i R6/R11. Den läggs sedan tillbaka skattemässigt i R12.
  const R6 = Math.abs(sumRange(5000, 6999))

  const R7 = Math.abs(sumRange(7000, 7699))

  const R8 = Math.abs(
    Math.round((sumRange(8410, 8419) + sumRange(8430, 8439)) * 100) / 100
  )

  const R9 = Math.abs(sumRange(7820, 7829))

  const R10 = Math.abs(
    Math.round((sumRange(7810, 7819) + sumRange(7830, 7839)) * 100) / 100
  )

  const ejAvdr = Math.abs(balances['6992'] || 0)

  const bokfRes = Math.round(
    (R1 + R2 + R3 + R4 - R5 - R6 - R7 - R8 - R9 - R10) * 100
  ) / 100

  const R11 = bokfRes
  const R12 = ejAvdr
  const R14 = Math.round((R11 + R12) * 100) / 100

  return {
    R1, R2, R3, R4, R5, R6, R7, R8, R9, R10,
    ejAvdr, bokfRes, R11, R12, R14
  }
}

/**
 * Steg 2 av B10-arbetet: kumulativt bokfört resultat (R1-R8/R11-R14) för
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

  const { R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, ejAvdr, bokfRes, R11, R12, R14 } = computeResultat(balances)

  // B10 är kumulativt: 2010/2012/2013/2018/2019
  // läses nu från balanceSheetBalances (kumulativt sedan bokföringens start)
  // istället för balances (årsvist), och resultat-termen kommer från
  // getCumulativeResultat(year) - summan av VARJE års resultat sedan start -
  // inte den årsvisa "bokfRes" ovan (som fortfarande används oförändrat för
  // R11/R14/bokfortResultat, se return-satsen nedan).
  //
  // Konto 2010 är kreditnormalt (klass 2, precis som 2018 och 2650 ovan/nedan) -
  // ett verkligt positivt eget kapital ger ett NEGATIVT rått värde i
  // debet-minus-kredit-konventionen. Utan tecken-vändningen nedan skulle ett
  // företag med t.ex. 50 000 kr i ingående kapital visa IB_kapital = -50 000,
  // vilket halverar B10 fel håll (differens = 2x kapitalbeloppet). Konto 2019
  // ("Årets resultat") behandlas identiskt - kan förekomma via en importerad
  // öppningsbalans och representerar då samma sak som 2010: ackumulerat,
  // ej ännu omfört resultat. Inget eget UI-fält för 2019 i detta steg -
  // IB_kapital representerar summan av båda kontona.
  //
  // OBS: till skillnad från insattningar/avräkningsskuld nedan/ovan klipper vi
  // INTE till 0 vid "fel" riktning på eget kapital - ett företag kan legitimt
  // ha NEGATIVT eget kapital (efter förlustår), och det ska synas som ett
  // negativt IB_kapital, inte döljas som 0.
  const kumulativtEgetKapitalStart =
    -(balanceSheetBalances['2010'] || 0) - (balanceSheetBalances['2019'] || 0)
  const kumulativInsattningar = Math.max(0, -(balanceSheetBalances['2018'] || 0))
  const kumulativUttag2013 = Math.max(0, balanceSheetBalances['2013'] || 0)

  // 2012 = Avräkning för skatter och avgifter i enskild firma.
  // I SoloLedgers standardkategori bokas en utbetalning från företagsbanken
  // som DEBET 2012 / KREDIT 1930. I vår debit-minus-credit-konvention blir
  // därför ett betalt privat skattebelopp POSITIVT på 2012 och ska minska
  // eget kapital på samma sätt som ett eget uttag.
  //
  // Vi klipper INTE 2012 till >= 0: ett kreditsaldo (t.ex. återbetalning)
  // ska gå åt motsatt håll och öka eget kapital. På så sätt bevaras även
  // balansidentiteten istället för att en motpost "försvinner".
  const kumulativSkatteavrakning2012 = balanceSheetBalances['2012'] || 0

  const cumulativeResult = await getCumulativeResultat(year)

  const IB_kapital = kumulativtEgetKapitalStart
  // Behåll ett enda "uttag"-fält till NE-komponenten, men låt det nu omfatta
  // både vanliga privata uttag (2013) och skatteavräkning (2012).
  const uttag = Math.round(
    (kumulativUttag2013 + kumulativSkatteavrakning2012) * 100
  ) / 100
  const insattningar = kumulativInsattningar
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
    R11, R12, R14,
    IB_kapital, insattningar, uttag,
    bank, B10_total,
    B1, B2, B3, B4, B5, B6, B7, B8, B9,
    B13, B14, B15, B16,
    B13_forutbetalda,
  }
}