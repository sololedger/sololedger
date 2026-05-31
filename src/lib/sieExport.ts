import { supabase } from './supabaseClient'
import { getAccountBalances } from './accountingService'

function formatDate(date: string) {
  return date.replaceAll('-', '')
}

function groupByVer(entries: any[]) {
  const map: Record<string, any[]> = {}
  entries.forEach(e => {
    const key = e.ver_nr
    if (!map[key]) map[key] = []
    map[key].push(e)
  })
  return Object.entries(map).map(([ver_nr, rows]) => ({
    ver_nr: Number(ver_nr),
    rows
  }))
}

export async function exportSIE(year: number) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inte inloggad")

  const today = new Date()

  // ───────────────────────────────
  // Hämta data parallellt
  // ───────────────────────────────
  const [{ data: entries, error }, { data: accounts }, { data: profile }] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: true })
      .order('ver_nr', { ascending: true }),

    supabase
      .from('accounts')
      .select('name, debit_account, credit_account')
      .eq('user_id', user.id),

    supabase
      .from('profiles')
      .select('company_name, org_nr')
      .eq('id', user.id)
      .maybeSingle()
  ])

  if (error) throw error

  const companyName = profile?.company_name || 'SoloLedger Användare'
  const orgNr = profile?.org_nr || '000000-0000'

  const grouped = groupByVer(entries || [])

  let sie = ''

  // ───────────────────────────────
  // HEADER
  // ───────────────────────────────
  sie += '#FLAGGA 0\n'
  sie += '#PROGRAM "SoloLedger" 1.0\n'
  sie += `#GEN ${formatDate(today.toISOString().split('T')[0])}\n`
  sie += '#FORMAT PC8\n'
  sie += '#SIETYP 4\n'
  sie += '#VALUTA SEK\n\n'
  sie += `#FNAMN "${companyName}"\n`
  sie += `#ORGNR "${orgNr}"\n\n`
  sie += `#RAR 0 ${year}0101 ${year}1231\n\n`

  // ───────────────────────────────
  // KONTOPLAN (#KONTO)
  // ───────────────────────────────
  const konton = new Map<string, string>()
  accounts?.forEach(acc => {
    if (acc.debit_account) konton.set(acc.debit_account, acc.name || `Konto ${acc.debit_account}`)
    if (acc.credit_account) konton.set(acc.credit_account, acc.name || `Konto ${acc.credit_account}`)
  })
  // Sortera konton numeriskt
  // Säkring: lägg till konton från journalrader som saknas i kontoplanen
  entries?.forEach(e => {
    if (!konton.has(e.account_number)) {
      konton.set(e.account_number, `Konto ${e.account_number}`)
    }
  })

  Array.from(konton.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([konto, name]) => {
      sie += `#KONTO ${konto} "${name}"\n`
    })
  sie += '\n'

  // ───────────────────────────────
  // BALANS (#IB / #UB)
  // ───────────────────────────────
  const prevYearBalances = await getAccountBalances(year - 1)
  const currentBalances = await getAccountBalances(year)

  Object.entries(prevYearBalances || {}).forEach(([konto, value]) => {
    if (value !== 0) {
      sie += `#IB 0 ${konto} ${Number(value).toFixed(2)}\n`
    }
  })
  sie += '\n'

  Object.entries(currentBalances || {}).forEach(([konto, value]) => {
    if (value !== 0) {
      sie += `#UB 0 ${konto} ${Number(value).toFixed(2)}\n`
    }
  })
  sie += '\n'

  // ───────────────────────────────
  // VERIFIKATIONER
  // ───────────────────────────────
  grouped.forEach(v => {
    const first = v.rows[0]

    // Korrigeringsverifikat får tydlig beskrivning, annars används radtexten
    const description = first.is_correction
      ? `Korrigering av VER-${first.corrects_ver_nr}: ${first.description || ''}`.trim()
      : first.description || `VER-${v.ver_nr}`

    // Sortera rader efter datum (hanterar periodisering över årsskifte)
    v.rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const date = formatDate(v.rows[0].date)

    sie += `#VER A ${v.ver_nr} ${date} "${description}"\n{\n`

    v.rows.forEach(row => {
      const amount = Number(row.debit) > 0
        ? Number(row.debit)
        : -Number(row.credit)
      sie += `#TRANS ${row.account_number} {} ${amount.toFixed(2)} ${formatDate(row.date)} ""\n`
    })

    sie += '}\n\n'
  })

  return sie
}