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

/**
 * Gör en sträng säker att interpolera i ett citerat SIE-textfält
 * (#FNAMN, #ORGNR, #KONTO:s kontonamn, #VER:s beskrivning).
 *
 * SIE filformat 4C, avsnitt 5.7:
 *   "Om ett citationstecken förekommer inuti ett fält ska det i
 *    exportfilen föregås av en backslash (ASCII 92). Kontrolltecken får
 *    ej förekomma inom en textsträng. Med kontrolltecken avses ASCII 0
 *    till och med ASCII 31 samt ASCII 127."
 *
 * Körs INNAN CP437-kodningen (som sker separat, i page.tsx, på hela den
 * färdigbyggda filen) - rör bara " och kontrolltecken, aldrig
 * teckenkodningen eller i övrigt vanlig text (inklusive Å/Ä/Ö).
 */
function escapeSIEText(text: string): string {
  return text
    // 1. Citationstecken escapas med en föregående backslash - INTE
    //    dubbleras. Vanlig backslash i texten rörs inte.
    .replace(/"/g, '\\"')
    // 2. Kontrolltecken (ASCII 0-31, 127) får inte förekomma i en
    //    textsträng - en hel kedja (t.ex. "\r\n") ersätts med ETT
    //    mellanslag, inte flera.
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
}

export async function exportSIE(year: number) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Inte inloggad")

  const today = new Date()

  // ───────────────────────────────
  // Hämta data parallellt
  // ───────────────────────────────
  // P0-fix: urvalet av VILKA VERIFIKATIONER som hör till exportåret sker nu
  // via transactions.date (hela verifikationen som en enhet) - inte längre
  // via journal_entries.date rad för rad. Se motivering vid #VER-utskriften
  // nedan. Samma mönster som redan används i accountingService.ts
  // (getAccountBalances/getBalanceSheetBalances).
  const [{ data: yearTransactions, error: txError }, { data: accounts }, { data: profile }, { data: jan1Transactions }, { data: prevYearTransactions, error: prevTxError }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, date')
      .eq('user_id', user.id)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`),

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
      .eq('date', `${year}-01-01`),

    // P1-fix (SIE 4C, jämförelseår): behövs för att avgöra om föregående
    // räkenskapsår "finns" samt som underlag för #RES -1 nedan.
    supabase
      .from('transactions')
      .select('id, date')
      .eq('user_id', user.id)
      .gte('date', `${year - 1}-01-01`)
      .lte('date', `${year - 1}-12-31`)
  ])

  if (txError) throw txError
  if (prevTxError) throw prevTxError

  const yearTransactionIds = (yearTransactions || []).map(t => t.id)

  // transaction_id -> transactions.date, används för #VER-datumet nedan.
  const transactionDateById = new Map<string, string>(
    (yearTransactions || []).map(t => [t.id, t.date])
  )

  // Hämta ALLA journal_entries för dessa transaktioner, utan eget
  // datumfilter på journal_entries.date - en enskild rad kan legitimt ha
  // ett annat transdat än sin verifikations eget datum (se P0-analysen),
  // men det ska aldrig påverka VILKET ÅRS export hela verifikationen hamnar
  // i. Undviker en tom/ogiltig .in()-fråga om året saknar transaktioner.
  let entries: any[] = []
  if (yearTransactionIds.length > 0) {
    const { data: yearEntries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .in('transaction_id', yearTransactionIds)
      .order('date', { ascending: true })
      .order('ver_nr', { ascending: true })
    if (entriesError) throw entriesError
    entries = yearEntries || []
  }

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

  // Flyttat hit (oförändrad kod, se tidigare BALANS-sektion) - behövs redan
  // här för att avgöra om #RAR -1 ska skrivas, innan headern byggs.
  const prevYearBalances = await getBalanceSheetBalances(year - 1)
  const currentBalances = await getBalanceSheetBalances(year)

  const prevYearTransactionIds = (prevYearTransactions || []).map(t => t.id)

  // Hämta föregående års journalrader redan här så att konton som endast
  // förekommer i #RES -1 också kan deklareras med #KONTO innan saldoposterna skrivs.
  let prevYearEntries: any[] = []
  if (prevYearTransactionIds.length > 0) {
    const { data: previousEntries, error: prevEntriesError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .in('transaction_id', prevYearTransactionIds)
    if (prevEntriesError) throw prevEntriesError
    prevYearEntries = previousEntries || []
  }

  // P1-fix (SIE 4C): föregående räkenskapsår räknas som "finns" om det
  // antingen har egna transaktioner (oavsett typ) ELLER om det finns
  // kumulativ balansdata som visar att året ingår i bokföringshistoriken
  // (t.ex. en öppningsbalans/importerad historik utan egna verifikationer
  // det specifika året). Ett företag vars första bokföringsår är "year"
  // ger tomt på BÅDA signalerna, och #RAR -1/#RES -1 skrivs då inte alls.
  const previousYearExists =
    prevYearTransactionIds.length > 0 ||
    Object.keys(prevYearBalances).length > 0

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
  sie += `#FNAMN "${escapeSIEText(companyName)}"\n`
  sie += `#ORGNR "${escapeSIEText(orgNr)}"\n\n`
  sie += `#RAR 0 ${year}0101 ${year}1231\n`
  // P1-fix (SIE 4C, † - "poster ska finnas för både innevarande och
  // föregående räkenskapsår, om föregående år saknas kan dock poster för
  // detta utelämnas"): skrivs bara om föregående år faktiskt finns.
  if (previousYearExists) {
    sie += `#RAR -1 ${year - 1}0101 ${year - 1}1231\n`
  }
  sie += '\n'

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
  
  // Säkring: lägg till konton från innevarande års journalrader som saknas i kontoplanen
  entries?.forEach(e => {
    const accountNumber = e.account_number.toString()
    if (!konton.has(accountNumber)) {
      konton.set(accountNumber, `Konto ${accountNumber}`)
    }
  })

  // SIE 4C kräver att samtliga använda konton exporteras som #KONTO.
  // Därför måste även konton som bara syns i #IB/#UB eller i föregående års
  // resultatdata (#RES -1) finnas i kontolistan, även om de saknar aktivitet
  // innevarande år och inte längre finns i accounts-tabellen.
  ;[
    ...Object.keys(prevYearBalances || {}),
    ...Object.keys(currentBalances || {})
  ].forEach(accountNumber => {
    if (!konton.has(accountNumber)) {
      konton.set(accountNumber, `Konto ${accountNumber}`)
    }
  })

  prevYearEntries.forEach(e => {
    const accountNumber = e.account_number.toString()
    const n = parseInt(accountNumber)
    if (n < 3000 || n > 8999) return
    if (!konton.has(accountNumber)) {
      konton.set(accountNumber, `Konto ${accountNumber}`)
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
      sie += `#KONTO ${konto} "${escapeSIEText(name)}"\n`
    })
  sie += '\n'

  // ───────────────────────────────
  // BALANS (#IB / #UB)
  // ───────────────────────────────
  // prevYearBalances/currentBalances hämtas numera tidigare (se ovan) - de
  // behövdes redan innan headern skrevs för att avgöra #RAR -1.

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
  // RESULTAT FÖREGÅENDE ÅR (#RES -1) - endast om föregående år finns
  // ───────────────────────────────
  // Exakt samma princip som #RES 0 ovan (3000-8999, debet-kredit, samma
  // avrundning, nollsaldo utelämnas, numerisk sortering) - men beräknad
  // uteslutande från föregående års EGNA transaktioner. Används ENDAST för
  // #RES -1 - year-1s transaktioner/journalrader rörs aldrig av #VER/#TRANS
  // -sektionen nedan, som fortsatt bara exporterar exportårets verifikationer.
  // Undviker en tom/ogiltig .in()-fråga om föregående år saknar transaktioner.
  if (previousYearExists && prevYearTransactionIds.length > 0) {
    const prevResBalances: Record<string, number> = {}
    ;(prevYearEntries || []).forEach(e => {
      const acc = e.account_number.toString()
      const n = parseInt(acc)
      if (n < 3000 || n > 8999) return
      prevResBalances[acc] = Math.round(
        ((prevResBalances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
      ) / 100
    })

    Object.entries(prevResBalances)
      .filter(([, value]) => value !== 0)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([konto, value]) => {
        sie += `#RES -1 ${konto} ${Number(value).toFixed(2)}\n`
      })
    sie += '\n'
  }

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

    // Sortera rader efter datum för läsbar #TRANS-ordning i utskriften
    // (t.ex. periodisering över årsskifte) - påverkar INTE vilket datum
    // #VER självt får, se nedan.
    v.rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // #VER-datumet hämtas från transactions.date - INTE från någon enskild
    // journal_entries-rad. En importerad #TRANS-rad kan legitimt ha ett
    // eget transdat skilt från sin verifikations eget datum (se P0-analysen
    // om SIE-specifikationen); det ska aldrig påverka vilket datum
    // verifikationen SOM HELHET redovisas med i #VER.
    const date = formatDate(transactionDateById.get(first.transaction_id) || first.date)

    sie += `#VER A ${v.ver_nr} ${date} "${escapeSIEText(description)}" ${date}\n{\n`

    v.rows.forEach(row => {
      const amount = Number(row.debit) > 0
        ? Number(row.debit)
        : -Number(row.credit)
      // Radens EGET datum bevaras oförändrat som #TRANS eget transdat.
      sie += `#TRANS ${row.account_number} {} ${amount.toFixed(2)} ${formatDate(row.date)} ""\n`
    })

    sie += '}\n\n'
  })

  return sie
}