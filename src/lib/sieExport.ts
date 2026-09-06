import { supabase } from './supabaseClient'
import { getBalanceSheetBalances } from './accountingService'

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
  const [{ data: entries, error }, { data: accounts }, { data: profile }, { data: jan1Transactions }] = await Promise.all([
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
      .maybeSingle(),

    // Kandidater för öppningsbalans - bara transaktioner daterade exakt
    // årets första dag behöver kontrolleras mot källa/beskrivning nedan.
    supabase
      .from('transactions')
      .select('id, source, description')
      .eq('user_id', user.id)
      .eq('date', `${year}-01-01`)
  ])

  if (error) throw error

  // ───────────────────────────────
  // Identifiera öppningsbalans-transaktioner (explicita signaler ENDAST -
  // ingen strukturell gissning i detta steg, se kommentar nedan).
  // ───────────────────────────────
  // Signal 1: nya importflödet (import_sie_batch) sätter source direkt.
  // Signal 2: äldre/legacy-import sätter source='sie_import' men har den
  // fasta beskrivningen 'Öppningsbalans' som koden själv alltid skrivit -
  // inte en fritt inmatad användartext.
  //
  // Medvetet UTESLUTET i detta steg: en strukturell fallback (t.ex. "första
  // transaktionen + 1 januari + bara balanskonton + balanserad") för att
  // fånga ännu okänd, omärkt historisk data. En sådan regel riskerar att
  // tyst exkludera en äkta affärshändelse ur exporten. Det får istället bli
  // en separat, senare detekterings-/varningsfunktion - inte automatisk
  // exkludering här.
  const openingBalanceTxIds = new Set(
    (jan1Transactions || [])
      .filter(t =>
        t.source === 'sie_opening_balance' ||
        (t.source === 'sie_import' && t.description === 'Öppningsbalans')
      )
      .map(t => t.id)
  )

  const openingBalanceEntries = (entries || []).filter(e => openingBalanceTxIds.has(e.transaction_id))
  const regularEntries = (entries || []).filter(e => !openingBalanceTxIds.has(e.transaction_id))

  const companyName = profile?.company_name || 'SoloLedger Användare'
  const orgNr = profile?.org_nr || '000000-0000'

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

  // 1. Bygg först upp kontolistan från databasen (utan onödiga överskrivningar)
  accounts?.forEach(acc => {
    if (acc.debit_account && !konton.has(acc.debit_account)) {
      konton.set(acc.debit_account, acc.name || `Konto ${acc.debit_account}`)
    }
    if (acc.credit_account && !konton.has(acc.credit_account)) {
      konton.set(acc.credit_account, acc.name || `Konto ${acc.credit_account}`)
    }
  })
  
  // Säkring: lägg till konton från journalrader som saknas i kontoplanen
  entries?.forEach(e => {
    if (!konton.has(e.account_number)) {
      konton.set(e.account_number, `Konto ${e.account_number}`)
    }
  })

  // 2. 🔥 MASTER OVERRIDE: Tvinga alltid fram rätt standardnamn sist av allt
  const accountNames: Record<string, string> = {
    '1930': 'Företagskonto',
    '2018': 'Egen insättning'
  }

  Object.entries(accountNames).forEach(([konto, name]) => {
    if (konton.has(konto)) {
      konton.set(konto, name)
    }
  })

  // 3. Sortera konton numeriskt och skriv ut rader
  Array.from(konton.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([konto, name]) => {
      sie += `#KONTO ${konto} "${name}"\n`
    })
  sie += '\n'

  // ───────────────────────────────
  // BALANS (#IB / #UB)
  // ───────────────────────────────
  const prevYearBalances = await getBalanceSheetBalances(year - 1)
  const currentBalances = await getBalanceSheetBalances(year)

  // #IB = föregående års kumulativa balans (1xxx-2xxx, sedan bokföringens
  // start) PLUS eventuella explicit identifierade öppningsbalans-poster
  // daterade exakt årets första dag. Det senare ledet är 0 för alla år
  // utom det där en sådan post faktiskt finns - formeln är alltså
  // självutslocknande och kräver ingen särlogik för "vanliga" år.
  const ibBalances: Record<string, number> = { ...prevYearBalances }
  openingBalanceEntries.forEach(e => {
    const acc = e.account_number.toString()
    // Endast balanskonton (1xxx-2xxx) - samma begränsning som
    // getBalanceSheetBalances redan tillämpar för prevYearBalances/
    // currentBalances, som en säkerhetsåtgärd om en öppningsbalans-flaggad
    // transaktion mot förmodan skulle innehålla en rad utanför den klassen.
    if (!acc.startsWith('1') && !acc.startsWith('2')) return
    ibBalances[acc] = Math.round(
      ((ibBalances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })

  Object.entries(ibBalances || {}).forEach(([konto, value]) => {
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
  // RESULTAT (#RES) - saldo per enskilt resultatkonto (3000-8999)
  // ───────────────────────────────
  // Ren saldosammanfattning per konto - ersätter INTE #VER/#TRANS, som
  // fortfarande exporteras oförändrat nedan. Byggs lokalt ur samma års-
  // entries som redan hämtats ovan (entries), ingen ny databasfråga och
  // ingen ändring i accountingService.ts. Samma debet-minus-kredit-
  // konvention som #IB/#UB, medvetet UTAN Math.abs() - kreditsaldo ska
  // förbli negativt, precis som SIE-specifikationen kräver för #RES.
  // Ingen NE-bilaga-logik (R1-R14) inblandad - det här är en helt separat,
  // per-konto uppräkning, inte en aggregering.
  const resBalances: Record<string, number> = {}
  ;(entries || []).forEach(e => {
    const acc = e.account_number.toString()
    const n = parseInt(acc)
    if (n < 3000 || n > 8999) return
    resBalances[acc] = Math.round(
      ((resBalances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })

  Object.entries(resBalances)
    .filter(([, value]) => value !== 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([konto, value]) => {
      sie += `#RES 0 ${konto} ${Number(value).toFixed(2)}\n`
    })
  sie += '\n'

  // ───────────────────────────────
  // VERIFIKATIONER
  // ───────────────────────────────
  const grouped = groupByVer(regularEntries)

  grouped.forEach(v => {
    const first = v.rows[0]

    // Korrigeringsverifikat får tydlig beskrivning, annars används radtexten
    const description = first.is_correction
      ? `Korrigering av VER-${first.corrects_ver_nr}: ${first.description || ''}`.trim()
      : first.description || `VER-${v.ver_nr}`

    // Sortera rader efter datum (hanterar periodisering över årsskifte)
    v.rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const date = formatDate(v.rows[0].date)

    sie += `#VER A ${v.ver_nr} ${date} "${description}" ${date}\n{\n`

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