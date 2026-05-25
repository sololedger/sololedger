import { supabase } from './supabaseClient'

// Hjälpfunktion för att hämta användarens ID på ett 100% skottsäkert och server-verifierat sätt
async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Ingen giltig eller inloggad användare hittades.")
  return user.id
}

export async function bookTransaction(tx: any) {
  const userId = await getUserId()

  // SÄKERHETSBÄLTE: Filtrera kontohämtning på användarens eget ID
  const { data: acc, error: accError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', tx.type)
    .eq('user_id', userId)
    .single()
  if (accError || !acc) throw new Error("Konto saknas eller tillhör inte användaren: " + tx.type)

  const vatRate = tx.vat_rate || 0
  const vatAmount = vatRate > 0
    ? Math.round((tx.amount - (tx.amount / (1 + vatRate / 100))) * 100) / 100
    : 0
  const netAmount = Math.round((tx.amount - vatAmount) * 100) / 100

  // Hämta senaste ver_nr isolerat per användare
  const { data: lastEntries } = await supabase
    .from('journal_entries')
    .select('ver_nr')
    .eq('user_id', userId)
    .order('ver_nr', { ascending: false })
    .limit(1)
  const nextVerNr = (lastEntries?.[0]?.ver_nr || 0) + 1

  const isIncome = acc.credit_account?.startsWith('3')
  let entries: any[]

  if (isIncome) {
    entries = [
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.debit_account,
        debit: tx.amount,
        credit: 0,
        description: tx.description,
        date: tx.date,
        user_id: userId
      },
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.credit_account,
        debit: 0,
        credit: netAmount,
        description: tx.description,
        date: tx.date,
        user_id: userId
      }
    ]
    if (vatAmount > 0) {
      entries.push({
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: '2611',
        debit: 0,
        credit: vatAmount,
        description: `Utgående moms på ${tx.description}`,
        date: tx.date,
        user_id: userId
      })
    }
  } else {
    entries = [
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.debit_account,
        debit: netAmount,
        credit: 0,
        description: tx.description,
        date: tx.date,
        user_id: userId
      },
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.credit_account,
        debit: 0,
        credit: tx.amount,
        description: tx.description,
        date: tx.date,
        user_id: userId
      }
    ]
    if (vatAmount > 0) {
      entries.push({
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: '2641',
        debit: vatAmount,
        credit: 0,
        description: `Ingående moms på ${tx.description}`,
        date: tx.date,
        user_id: userId
      })
    }
  }

  const { error: insertError } = await supabase.from('journal_entries').insert(entries)
  if (insertError) throw insertError

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ booked: true })
    .eq('id', tx.id)
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

export async function deleteTransaction(id: string) {
  const userId = await getUserId()

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

  // SÄKERHETSBÄLTE: Hämta originaltransaktionen och kräv att den tillhör den inloggade
  const { data: originalTx, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', originalTxId)
    .eq('user_id', userId)
    .single()
  if (txError || !originalTx) throw new Error("Kunde inte hämta originaltransaktionen.")

  // SÄKERHETSBÄLTE: Hämta originalets journalposter och kräv att de tillhör den inloggade
  const { data: originalEntries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('transaction_id', originalTxId)
    .eq('user_id', userId)
  if (entriesError || !originalEntries?.length) throw new Error("Kunde inte hämta originalbokföringen.")

  const originalVerNr = originalEntries[0].ver_nr

  // Räkna ut nästa ver_nr isolerat per användare
  const { data: lastEntries } = await supabase
    .from('journal_entries')
    .select('ver_nr')
    .eq('user_id', userId)
    .order('ver_nr', { ascending: false })
    .limit(1)
  const nextVerNr = (lastEntries?.[0]?.ver_nr || 0) + 1

  // Skapa korrigeringstransaktionen
  const today = new Date().toISOString().split('T')[0]
  const { data: corrTx, error: corrTxError } = await supabase
    .from('transactions')
    .insert([{
      date: today,
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
    date: today,
    user_id: userId,
  }))

  const { error: insertError } = await supabase.from('journal_entries').insert(correctionEntries)
  if (insertError) throw new Error("Kunde inte skapa korrigeringsposter: " + insertError.message)

  return nextVerNr
}

/**
 * Periodisering: Bokför en utgift som sträcker sig över ett nyårsskifte.
 *
 * Transaktion 1 (innevarande år, t.ex. december):
 *   Kredit acc.credit_account (1930 Bank)            = bruttobelopp
 *   Debet  1790 Förutbetalda kostnader               = nettobelopp
 *   Debet  2641 Ingående moms (om moms finns)        = momsbelopp
 *
 * Transaktion 2 (nästa år, t.ex. 1 januari — vändning):
 *   Kredit 1790 Förutbetalda kostnader               = nettobelopp
 *   Debet  acc.debit_account (faktiskt kostnadskonto) = nettobelopp
 *   (Ingen moms — redan hanterad i TX1)
 *
 * Båda transaktionerna delar samma ver_nr (bokföringsmässigt korrekt).
 * periodization_group_id kopplar ihop dem för framtida UI-filtrering.
 */
export async function bookPeriodizedTransaction(tx: any) {
  // 1. Hämta den server-verifierade användarens ID
  const userId = await getUserId()

  // 2. SÄKERHETSBÄLTE: Verifiera att kontot existerar och tillhör användaren
  const { data: acc, error: accError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', tx.type)
    .eq('user_id', userId)
    .single()
  if (accError || !acc) throw new Error("Konto saknas eller tillhör inte användaren: " + tx.type)

  // 3. Räkna ut moms- och nettobelopp exakt
  const vatRate = tx.vat_rate || 0
  const vatAmount = vatRate > 0
    ? Math.round((tx.amount - (tx.amount / (1 + vatRate / 100))) * 100) / 100
    : 0
  const netAmount = Math.round((tx.amount - vatAmount) * 100) / 100

  // 4. Hämta det senaste verifikationsnumret — TX1 och TX2 delar samma ver_nr
  const { data: lastEntries } = await supabase
    .from('journal_entries')
    .select('ver_nr')
    .eq('user_id', userId)
    .order('ver_nr', { ascending: false })
    .limit(1)
  const currentVerNr = lastEntries && lastEntries.length > 0 ? lastEntries[0].ver_nr + 1 : 1

  // 5. Unikt grupp-id för att kedja ihop de två transaktionerna
  const periodizationGroupId = crypto.randomUUID()

  // ── TRANSAKTION 1: Innevarande år ──────────────────────────────────────────
  const { data: insertedTx1, error: errorTx1 } = await supabase
    .from('transactions')
    .insert([{
      user_id: userId,
      date: tx.date,
      description: `[Periodisering 1/2] ${tx.description}`,
      amount: tx.amount,
      type: tx.type,
      vat_rate: vatRate,
      file_url: tx.file_url || null,
      booked: true,
      is_periodized: true,
      is_periodized_reversal: false,
      periodized_future_date: tx.future_date,
      periodization_group_id: periodizationGroupId,
    }])
    .select()
    .single()
  if (errorTx1) throw errorTx1

  const tx1Journal: any[] = [
    {
      transaction_id: insertedTx1.id,
      ver_nr: currentVerNr,
      account_number: acc.credit_account, // 1930 Bank K
      debit: 0,
      credit: tx.amount,
      description: `Förutbetald kostnad (Bank): ${tx.description}`,
      date: tx.date,
      user_id: userId,
    },
    {
      transaction_id: insertedTx1.id,
      ver_nr: currentVerNr,
      account_number: '1790', // Förutbetalda kostnader D (netto)
      debit: netAmount,
      credit: 0,
      description: `Förutbetald kostnad (Netto): ${tx.description}`,
      date: tx.date,
      user_id: userId,
    },
  ]
  if (vatAmount > 0) {
    tx1Journal.push({
      transaction_id: insertedTx1.id,
      ver_nr: currentVerNr,
      account_number: '2641', // Ingående moms D — dras direkt år 1
      debit: vatAmount,
      credit: 0,
      description: `Ingående moms (Periodisering): ${tx.description}`,
      date: tx.date,
      user_id: userId,
    })
  }

  const { error: jError1 } = await supabase.from('journal_entries').insert(tx1Journal)
  if (jError1) throw jError1

  // ── TRANSAKTION 2: Nästa år (vändningsverifikat) ───────────────────────────
  const { data: insertedTx2, error: errorTx2 } = await supabase
    .from('transactions')
    .insert([{
      user_id: userId,
      date: tx.future_date,
      description: `[Periodisering 2/2] ${tx.description}`,
      amount: netAmount,
      type: tx.type,
      vat_rate: 0, // Momsen är redan färdigdragen år 1
      file_url: tx.file_url || null,
      booked: true,
      is_periodized: true,
      is_periodized_reversal: true,
      periodized_future_date: null,
      periodization_group_id: periodizationGroupId,
    }])
    .select()
    .single()
  if (errorTx2) throw errorTx2

  const tx2Journal: any[] = [
    {
      transaction_id: insertedTx2.id,
      ver_nr: currentVerNr,
      account_number: '1790', // Förutbetalda kostnader K — nollas ut
      debit: 0,
      credit: netAmount,
      description: `Förutbetald kostnad upplöst: ${tx.description}`,
      date: tx.future_date,
      user_id: userId,
    },
    {
      transaction_id: insertedTx2.id,
      ver_nr: currentVerNr,
      account_number: acc.debit_account, // Faktiskt kostnadskonto D (t.ex. 5010)
      debit: netAmount,
      credit: 0,
      description: `Periodiserad kostnad aktiveras: ${tx.description}`,
      date: tx.future_date,
      user_id: userId,
    },
  ]

  const { error: jError2 } = await supabase.from('journal_entries').insert(tx2Journal)
  if (jError2) throw jError2

  return { success: true, ver_nr: currentVerNr }
}

export async function getNEData(year: number) {
  const balances = await getAccountBalances(year)

  const sumRange = (start: number, end: number, exclude: string[] = []) => {
    const sum = Object.entries(balances)
      .filter(([acc]) => {
        const n = parseInt(acc)
        return n >= start && n <= end && !exclude.includes(acc)
      })
      .reduce((s, [_, v]) => s + (v as number), 0)
    return Math.round(sum * 100) / 100
  }

  const R1 = Math.abs(sumRange(3000, 3999))
  const R2 = 0
  const R5 = Math.abs(sumRange(4000, 4999))

  const avskrivningsKonton = Array.from({ length: 100 }, (_, i) => String(7800 + i))
  const R6 = Math.abs(sumRange(5000, 7999, ['6992', ...avskrivningsKonton]))
  const R7 = 0
  const R8 = Math.abs(sumRange(7800, 7899))
  const ejAvdr = Math.abs(balances['6992'] || 0)

  const bokfRes = Math.round((R1 + R2 - R5 - R6 - R7 - R8 - ejAvdr) * 100) / 100
  const R11 = bokfRes
  const R12 = ejAvdr
  const R14 = Math.round((R11 + R12) * 100) / 100

  const IB_kapital = balances['2010'] || 0
  const uttag = Math.max(0, balances['2013'] || 0)
  const insattningar = Math.max(0, -(balances['2018'] || 0))
  const B10_total = Math.round((IB_kapital + bokfRes + insattningar - uttag) * 100) / 100

  const utgMoms = Math.abs(balances['2611'] || 0)
  const ingMoms = Math.abs(balances['2641'] || 0)
  const B16 = Math.round((utgMoms - ingMoms) * 100) / 100

  const bank = balances['1930'] || 0

  // Konto 1790 — Förutbetalda kostnader (uppstår vid periodisering)
  // Positiv balans = debet = tillgång i balansräkningen
  const B13_forutbetalda = Math.max(0, balances['1790'] || 0)

  return {
    R1, R2, R5, R6, R7, R8,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11, R12, R14,
    IB_kapital, insattningar, uttag,
    bank, B10_total, B16,
    B13_forutbetalda,
  }
}
