import { supabase } from './supabaseClient'

export async function bookTransaction(tx: any) {
  // Hämta sessionen för att få användarens ID
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) throw new Error("Ingen inloggad användare hittades vid bokföring.")
  const userId = session.user.id

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

  // Hämta senaste ver_nr för just DENNA användare
  const { data: lastEntries } = await supabase
    .from('journal_entries')
    .select('ver_nr')
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
        user_id: userId
      },
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.credit_account,
        debit: 0,
        credit: netAmount,
        description: tx.description,
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
        user_id: userId
      },
      {
        transaction_id: tx.id,
        ver_nr: nextVerNr,
        account_number: acc.credit_account,
        debit: 0,
        credit: tx.amount,
        description: tx.description,
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

  return {
    R1, R2, R5, R6, R7, R8,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11, R12, R14,
    IB_kapital, insattningar, uttag,
    bank, B10_total, B16,
  }
}