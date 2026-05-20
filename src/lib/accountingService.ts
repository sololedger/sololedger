import { supabase } from './supabaseClient'

export async function bookTransaction(tx: any) {
  const { data: acc, error: accError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', tx.type)
    .single()
  if (accError || !acc) throw new Error("Konto saknas för: " + tx.type)

  const vatRate = tx.vat_rate || 0
  const vatAmount = vatRate > 0
    ? Math.round((tx.amount - (tx.amount / (1 + vatRate / 100))) * 100) / 100
    : 0
  const netAmount = Math.round((tx.amount - vatAmount) * 100) / 100

  // Hämta senaste ver_nr — utan .single() så det inte kraschar på tom DB
  const { data: lastEntries } = await supabase
    .from('journal_entries')
    .select('ver_nr')
    .order('ver_nr', { ascending: false })
    .limit(1)
  const nextVerNr = (lastEntries?.[0]?.ver_nr || 0) + 1

  // Inkomst = kreditkontot i kontoplanen börjar på 3 (t.ex. 3010 Försäljning)
  const isIncome = acc.credit_account?.startsWith('3')

  let entries: any[]

  if (isIncome) {
    // INKOMST (t.ex. Försäljning 1000 kr inkl 25% moms)
    // Debet  1930 Bank          1000 kr  (hela beloppet in)
    // Kredit 3010 Försäljning    800 kr  (netto)
    // Kredit 2611 Utgående moms  200 kr
    entries = [
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.debit_account,
        debit: tx.amount,
        credit: 0,
        description: tx.description
      },
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.credit_account,
        debit: 0,
        credit: netAmount,
        description: tx.description
      }
    ]
    if (vatAmount > 0) {
      entries.push({
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: '2611',
        debit: 0,
        credit: vatAmount,
        description: `Utgående moms på ${tx.description}`
      })
    }
  } else {
    // KOSTNAD (t.ex. Prenumeration 100 kr inkl 25% moms)
    // Debet  5420 Kostnad         80 kr  (netto)
    // Debet  2641 Ingående moms   20 kr
    // Kredit 1930 Bank           100 kr  (hela beloppet ut)
    entries = [
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.debit_account,
        debit: netAmount,
        credit: 0,
        description: tx.description
      },
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.credit_account,
        debit: 0,
        credit: tx.amount,
        description: tx.description
      }
    ]
    if (vatAmount > 0) {
      entries.push({
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: '2641',
        debit: vatAmount,
        credit: 0,
        description: `Ingående moms på ${tx.description}`
      })
    }
  }

  const { error: insertError } = await supabase.from('journal_entries').insert(entries)
  if (insertError) throw insertError

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ booked: true })
    .eq('id', tx.id)
  if (updateError) throw updateError
}

export async function getAccountBalances(year: number) {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .gte('date', startDate)
    .lte('date', endDate)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return {}

  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
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
  const { error: journalError } = await supabase
    .from('journal_entries')
    .delete()
    .eq('transaction_id', id)
  if (journalError) throw new Error("Kunde inte radera bokföringsposter: " + journalError.message)

  const { error: txError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
  if (txError) throw new Error("Kunde inte radera transaktionen: " + txError.message)
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

  // R1: Nettoomsättning — intäkter 3xxx, kreditkonton har negativt saldo, därav abs
  const R1 = Math.abs(sumRange(3000, 3999))

  // R2: Övriga intäkter — ingen DB-logik ännu
  const R2 = 0

  // R5: Varukostnader 4xxx
  const R5 = Math.abs(sumRange(4000, 4999))

  // Avskrivningskonton 7800–7899 exkluderas ur R6 (de hamnar i R8 istället)
  const avskrivningsKonton = Array.from({ length: 100 }, (_, i) => String(7800 + i))

  // R6: Övriga externa kostnader 5–7xxx, exkl. 6992 och exkl. 7800–7899
  const R6 = Math.abs(sumRange(5000, 7999, ['6992', ...avskrivningsKonton]))

  // R7: Personalkostnader — ingen DB-logik ännu
  const R7 = 0

  // R8: Avskrivningar 7800–7899
  const R8 = Math.abs(sumRange(7800, 7899))

  // Ej avdragsgilla (6992) — läggs tillbaka i R14 (ökar det skattemässiga resultatet)
  const ejAvdr = Math.abs(balances['6992'] || 0)

  // Bokfört resultat = Intäkter - alla kostnader inkl. ej avdragsgilla
  const bokfRes = Math.round((R1 + R2 - R5 - R6 - R7 - R8 - ejAvdr) * 100) / 100

  // R11 = bokfortResultat
  const R11 = bokfRes

  // R12 = ejAvdragsgillt (återläggs i skatteberäkningen)
  const R12 = ejAvdr

  // R14: Skattemässigt resultat = R11 + R12
  // R12 läggs tillbaka → ej avdragsgilla kostnader ökar det skattemässiga resultatet
  const R14 = Math.round((R11 + R12) * 100) / 100

  // Ingående eget kapital (2010) — bokförs manuellt vid årets start
  const IB_kapital = balances['2010'] || 0

  // Uttag (2013): debetkonto → positivt saldo
  const uttag = Math.max(0, balances['2013'] || 0)

  // Privata insättningar (2018): kreditkonto → negativt saldo, därav minustecken
  const insattningar = Math.max(0, -(balances['2018'] || 0))

  // B10 Eget kapital = IB + årets bokförda resultat + insättningar - uttag
  const B10_total = Math.round((IB_kapital + bokfRes + insattningar - uttag) * 100) / 100

  // B16 Netto moms: utgående (2611, negativt saldo) minus ingående (2641, positivt saldo)
  const utgMoms = Math.abs(balances['2611'] || 0)
  const ingMoms = Math.abs(balances['2641'] || 0)
  const B16 = Math.round((utgMoms - ingMoms) * 100) / 100

  const bank = balances['1930'] || 0

  return {
    R1,
    R2,
    R5,
    R6,
    R7,
    R8,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11,
    R12,
    R14,
    IB_kapital,
    insattningar,
    uttag,
    bank,
    B10_total,
    B16,
  }
}
