import { supabase } from './supabaseClient'

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

  // Hämta alla journalrader för det valda året
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('ver_nr', { ascending: true })

  if (error) throw error

  const grouped = groupByVer(data || [])
  let sie = ''
  const today = new Date()

  // SIE-Header
  sie += '#FLAGGA 0\n'
  sie += '#PROGRAM "SoloLedger" 1.0\n'
  sie += `#GEN ${formatDate(today.toISOString().split('T')[0])}\n`
  sie += '#FORMAT PC8\n'
  sie += '#SIETYP 4\n'
  sie += '#VALUTA SEK\n\n'
  sie += `#FNAMN "SoloLedger Användare"\n`
  sie += `#ORGNR 000000-0000\n\n`
  sie += `#RAR 0 ${year}0101 ${year}1231\n\n`

  // Verifikationsloopen
  grouped.forEach(v => {
    const first = v.rows[0]

    const description = first.is_correction
      ? `Korrigering av VER-${first.corrects_ver_nr}`
      : first.description || `VER-${v.ver_nr}`

    // Sortera efter datum ifall rader korsar årsskiftet (periodisering)
    v.rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const date = formatDate(v.rows[0].date)

    sie += `#VER A ${v.ver_nr} ${date} "${description}"\n{\n`

    v.rows.forEach(row => {
      const amount = Number(row.debit) > 0 ? Number(row.debit) : -Number(row.credit)
      sie += `#TRANS ${row.account_number} {} ${amount.toFixed(2)} ${formatDate(row.date)} ""\n`
    })

    sie += '}\n\n'
  })

  return sie
}
