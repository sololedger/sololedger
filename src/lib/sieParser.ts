// src/lib/sieParser.ts
//
// Ren, beroendefri parser för SIE Typ 4-filer.
// Inga Supabase-anrop, inget UI, inga React-beroenden.
//
// Steg 1 av SIE-import: läs in filen till strukturerad data + validering.
// Import till transactions/journal_entries hanteras i ett senare steg.

// ─────────────────────────────────────────────────────────────
// Publika typer
// ─────────────────────────────────────────────────────────────

/** Ett konto från #KONTO-posten. */
export interface SieAccount {
    /** Kontonummer, t.ex. "1930". Behålls som sträng (kan ha ledande nollor). */
    number: string
    /** Kontonamn, t.ex. "Företagskonto". */
    name: string
  }
  
  /** En objekt/dimension-koppling på en #TRANS-rad, t.ex. { dimension: "1", object: "Nord" }. */
  export interface SieObjectRef {
    dimension: string
    object: string
  }
  
  /** En enskild transaktionsrad (#TRANS) inom en verifikation. */
  export interface SieTrans {
    /** Kontonummer raden bokförs mot. */
    accountNumber: string
    /**
     * Belopp enligt SIE-konventionen: positivt = debet, negativt = kredit.
     */
    amount: number
    /** Objekt/dimension-lista, t.ex. kostnadsställe. Tom array om ingen angavs. */
    objects: SieObjectRef[]
    /** Transaktionsdatum (YYYY-MM-DD), om angivet separat från verifikationsdatumet. */
    transDate?: string
    /** Fritext för raden, t.ex. fakturanummer. Kan vara tom sträng om filen skrev "". */
    description?: string
    /** Kvantitet/antal, om angivet. */
    quantity?: number
  }
  
  /** En verifikation (#VER + dess #TRANS-rader). */
  export interface SieVer {
    /** Verifikationsserie, t.ex. "A". */
    series: string
    /** Verifikationsnummer inom serien. Behålls som sträng. */
    verNumber: string
    /** Verifikationsdatum (YYYY-MM-DD). */
    date: string
    /** Verifikationstext. */
    description: string
    /** Registreringsdatum (YYYY-MM-DD), om angivet. */
    registrationDate?: string
    /** Radernas transaktioner. */
    transactions: SieTrans[]
    /** Summan av transactions[].amount. 0 om verifikationen balanserar. */
    balanceDiff: number
  }
  
  /** Ett räkenskapsår från en #RAR-rad. */
  export interface SieFiscalYear {
    /** 0 = innevarande år, -1 = föregående år, osv. */
    index: number
    /** Startdatum (YYYY-MM-DD). */
    start: string
    /** Slutdatum (YYYY-MM-DD). */
    end: string
  }
  
  /** Resultatet av parseSieFile. */
  export interface SieParseResult {
    companyName: string | null
    orgNr: string | null
    /** Räkenskapsårets startår (från #RAR med index 0), eller null om okänt. */
    year: number | null
    fiscalYears: SieFiscalYear[]
    accounts: SieAccount[]
    verifications: SieVer[]
    /** accounts.length, för bekvämlighet. */
    accountCount: number
    /** verifications.length, för bekvämlighet. */
    verificationCount: number
    /** Summan av alla transaktioners belopp i hela filen. Bör vara ~0. */
    totalBalanceDiff: number
    /** true om hela filen (och samtliga verifikationer) balanserar. */
    isBalanced: boolean
    /** Fel som gör att data bör hanteras med försiktighet (t.ex. obalans, trasig fil). */
    errors: string[]
    /** Varningar som inte hindrar parsning men är värda att visa användaren. */
    warnings: string[]
  }
  
  // ─────────────────────────────────────────────────────────────
  // Konstanter
  // ─────────────────────────────────────────────────────────────
  
  /** Toleransgräns (kr) för avrundningsfel vid balanskontroll. */
  const BALANCE_EPSILON = 0.005
  
  // ─────────────────────────────────────────────────────────────
  // Teckenkodning: PC8 / CP437 -> UTF-8 (JS-sträng)
  // ─────────────────────────────────────────────────────────────
  
  /**
   * CP437-tabell för byte-värden 128–255 (0x80–0xFF).
   * Byte-värden 0–127 motsvarar vanlig ASCII och behöver ingen mappning.
   * Detta är standard-CP437 ("PC8" i SIE-spec:en), som skiljer sig från
   * Windows-1252/Latin-1 för just de övre 128 tecknen – bl.a. Å/Ä/Ö/å/ä/ö
   * ligger på andra positioner än i Windows-1252.
   */
  const CP437_UPPER_HALF: string =
    'ÇüéâäàåçêëèïîìÄÅ' +
    'ÉæÆôöòûùÿÖÜ¢£¥₧ƒ' +
    'áíóúñÑªº¿⌐¬½¼¡«»' +
    '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐' +
    '└┴┬├─┼╞╟╚╔╩╦╠═╬╧' +
    '╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
    'αßΓπΣσµτΦΘΩδ∞φε∩' +
    '≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0'
  
  /**
   * CP850-tabell för byte-värden 128–255. Vissa ekonomisystem (särskilt
   * äldre danska/norska installationer) skriver CP850 trots att SIE-headern
   * anger "PC8". Skiljer sig från CP437 bl.a. i teckenblocket 0x9B–0xE7.
   */
  const CP850_UPPER_HALF: string =
    'ÇüéâäàåçêëèïîìÄÅ' +
    'ÉæÆôöòûùÿÖÜø£Ø×ƒ' +
    'áíóúñÑªº¿®¬½¼¡«»' +
    '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
    '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' +
    'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
    'ÓßÔÒõÕµþÞÚÛÙýÝ¯´' +
    '\u00ADú¾¶§÷¸°¨·¹³²■\u00A0'
  
  /** Resultatet av decodeSieBuffer(): den avkodade texten plus vilken kodning som användes och ev. varningar. */
  export interface SieDecodeResult {
    content: string
    encoding: 'utf-8' | 'cp437' | 'cp850'
    warnings: string[]
  }
  
  /**
   * Avkodar rådata (t.ex. från en uppladdad fil) till en vanlig JS-sträng,
   * och returnerar samtidigt vilken teckenkodning som antogs samt ev. varningar.
   *
   * OBS: parseSieFile() nedan tar emot en redan avkodad `string` (result.content
   * härifrån). Om filen lästs in som bytes (FileReader.readAsArrayBuffer,
   * fetch().arrayBuffer(), etc.) MÅSTE den gå genom decodeSieBuffer() FÖRST –
   * annars blir svenska tecken (ÅÄÖ) felaktiga, eftersom varken UTF-8- eller
   * Windows-1252-avkodning ger samma resultat som CP437/CP850 för byte-värden ≥ 0x80.
   *
   * Kodning avgörs i turordning, eftersom verkliga SIE-filer från olika
   * ekonomisystem lögner om sin egen kodning eller använder varianter som
   * spec:en inte förutser (CP437, CP850, Windows-1252, Latin-1, UTF-8, UTF-8
   * med BOM har alla observerats i praktiken under en "#FORMAT PC8"-header):
   *
   *  1. UTF-8 BOM (EF BB BF) i filens början → UTF-8, säkert avgjort.
   *  2. Giltig UTF-8 med minst en multi-byte-sekvens (Å/Ä/Ö kräver det) →
   *     UTF-8. Många moderna exportörer (Fortnox, Bokio m.fl.) skriver
   *     faktiskt UTF-8 trots att headern anger PC8.
   *  3. Annars läses den deklarerade #FORMAT-raden (ASCII-säkert, oavsett
   *     faktisk kodning eftersom taggen och dess värden alltid är ASCII).
   *     "PC850" → CP850. "PC8" (eller inget värde alls) → CP437, som är
   *     vanligast i praktiken (bl.a. Visma).
   *  4. Om #FORMAT anger något oväntat/okänt läggs en varning till och
   *     CP437 används ändå som bästa gissning.
   */
  export function decodeSieBuffer(data: ArrayBuffer | Uint8Array): SieDecodeResult {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const warnings: string[] = []
  
    if (hasUtf8Bom(bytes)) {
      return { content: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8', warnings }
    }
  
    if (looksLikeUtf8(bytes)) {
      return { content: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', warnings }
    }
  
    const declaredFormat = detectDeclaredFormat(bytes)
  
    if (declaredFormat === 'PC850') {
      return { content: decodeSingleByte(bytes, CP850_UPPER_HALF), encoding: 'cp850', warnings }
    }
  
    if (declaredFormat === undefined || declaredFormat === 'PC8') {
      return { content: decodeSingleByte(bytes, CP437_UPPER_HALF), encoding: 'cp437', warnings }
    }
  
    warnings.push(
      `Filens teckenkodning kunde inte fastställas säkert (deklarerat #FORMAT: "${declaredFormat}"). Antar CP437 – kontrollera svenska tecken (ÅÄÖ) i resultatet.`
    )
    return { content: decodeSingleByte(bytes, CP437_UPPER_HALF), encoding: 'cp437', warnings }
  }
  
  function decodeSingleByte(bytes: Uint8Array, upperHalfTable: string): string {
    let out = ''
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] as number
      out += b < 128 ? String.fromCharCode(b) : upperHalfTable[b - 128]
    }
    return out
  }
  
  function hasUtf8Bom(bytes: Uint8Array): boolean {
    return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  }
  
  /**
   * Läser värdet på #FORMAT-raden direkt ur råbytes, utan att först avgöra
   * kodning – går eftersom taggen och dess kända värden (PC8, PC850, UTF-8...)
   * alltid består av ASCII-tecken oavsett vilken kodning resten av filen har.
   */
  function detectDeclaredFormat(bytes: Uint8Array): string | undefined {
    const headerWindow = bytes.subarray(0, Math.min(bytes.length, 4096))
    let ascii = ''
    for (let i = 0; i < headerWindow.length; i++) {
      const b = headerWindow[i] as number
      ascii += b < 128 ? String.fromCharCode(b) : ' '
    }
    const match = ascii.match(/#FORMAT\s+(\S+)/i)
    return match ? match[1].toUpperCase() : undefined
  }
  
  /** Ser bytesekvensen ut som giltig UTF-8 med minst ett multi-byte-tecken? */
  function looksLikeUtf8(bytes: Uint8Array): boolean {
    let i = 0
    let sawMultiByte = false
    while (i < bytes.length) {
      const b = bytes[i] as number
      if (b < 0x80) {
        i++
        continue
      }
      let extra: number
      if ((b & 0xe0) === 0xc0) extra = 1
      else if ((b & 0xf0) === 0xe0) extra = 2
      else if ((b & 0xf8) === 0xf0) extra = 3
      else return false // ogiltig UTF-8-startbyte -> antagligen ett 8-bitars enbyte-format
  
      if (i + extra >= bytes.length) return false
      for (let k = 1; k <= extra; k++) {
        const cb = bytes[i + k] as number
        if ((cb & 0xc0) !== 0x80) return false
      }
      sawMultiByte = true
      i += extra + 1
    }
    return sawMultiByte
  }
  
  // ─────────────────────────────────────────────────────────────
  // Tokenizer
  // ─────────────────────────────────────────────────────────────
  
  interface SieToken {
    value: string
    quoted: boolean
    brace: boolean
  }
  
  /**
   * Delar upp en SIE-rad i tokens, med hänsyn till:
   *  - citerade strängar "..." (mellanslag inuti bevaras, "" = literal citation-mark)
   *  - klammerlistor {...} (t.ex. objektlistan på en #TRANS-rad) som EN token
   *  - vanliga blankstegsavgränsade fält
   */
  function tokenizeLine(line: string): SieToken[] {
    const tokens: SieToken[] = []
    let i = 0
    const n = line.length
  
    while (i < n) {
      const ch = line[i]
  
      if (ch === ' ' || ch === '\t') {
        i++
        continue
      }
  
      if (ch === '"') {
        i++
        let value = ''
        while (i < n) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') {
              value += '"'
              i += 2
              continue
            }
            i++
            break
          }
          value += line[i]
          i++
        }
        tokens.push({ value, quoted: true, brace: false })
        continue
      }
  
      if (ch === '{') {
        i++
        let depth = 1
        let value = ''
        while (i < n && depth > 0) {
          if (line[i] === '{') {
            depth++
            value += line[i]
            i++
            continue
          }
          if (line[i] === '}') {
            depth--
            if (depth === 0) {
              i++
              break
            }
            value += line[i]
            i++
            continue
          }
          value += line[i]
          i++
        }
        tokens.push({ value: value.trim(), quoted: false, brace: true })
        continue
      }
  
      let start = i
      while (i < n && line[i] !== ' ' && line[i] !== '\t') i++
      tokens.push({ value: line.slice(start, i), quoted: false, brace: false })
    }
  
    return tokens
  }
  
  /** Tolkar en objektlista, t.ex. "1 Nord 6 0001" -> [{dimension:"1",object:"Nord"}, {dimension:"6",object:"0001"}]. */
  function parseObjectList(raw: string, warnings: string[], context: string): SieObjectRef[] {
    if (!raw || raw.trim() === '') return []
    const tokens = tokenizeLine(raw)
    const refs: SieObjectRef[] = []
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      refs.push({ dimension: tokens[i].value, object: tokens[i + 1].value })
    }
    if (tokens.length % 2 !== 0) {
      warnings.push(
        `Ofullständigt dimension/objekt-par i objektlistan "{${raw}}" (${context}) – sista värdet "${tokens[tokens.length - 1].value}" saknar sin motpart och ignoreras.`
      )
    }
    return refs
  }
  
  /** Konverterar SIE-datum "YYYYMMDD" -> "YYYY-MM-DD". Returnerar originalvärdet oförändrat om formatet inte känns igen. */
  function formatSieDate(raw: string): string {
    if (/^\d{8}$/.test(raw)) {
      return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    }
    return raw
  }
  
  function isEightDigitDate(value: string | undefined): value is string {
    return value !== undefined && /^\d{8}$/.test(value)
  }
  
  /** Tolkar ett SIE-belopp (decimalpunkt normalt, men tål decimalkomma). */
  function parseSieAmount(raw: string): number | null {
    const normalized = raw.trim().replace(',', '.')
    if (normalized === '' || Number.isNaN(Number(normalized))) return null
    return Number(normalized)
  }
  
  // ─────────────────────────────────────────────────────────────
  // Huvudfunktion
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Parsar innehållet i en SIE Typ 4-fil.
   *
   * `content` förväntas vara en redan avkodad JS-sträng (se decodeSieBuffer()
   * ovan om filen lästs in som råa bytes med CP437/PC8-kodning).
   *
   * Kastar aldrig exceptions för vanliga formatfel i filen – dessa samlas
   * istället i `errors`/`warnings` på returvärdet.
   */
  export function parseSieFile(content: string): SieParseResult {
    const errors: string[] = []
    const warnings: string[] = []
  
    const accounts = new Map<string, SieAccount>()
    const verifications: SieVer[] = []
    const fiscalYears: SieFiscalYear[] = []
    const referencedAccounts = new Set<string>()
  
    let companyName: string | null = null
    let orgNr: string | null = null
  
    const lines = content.split(/\r\n|\r|\n/)
  
    let i = 0
    while (i < lines.length) {
      const trimmed = lines[i].trim()
  
      if (trimmed.length === 0 || !trimmed.startsWith('#')) {
        i++
        continue
      }
  
      const tokens = tokenizeLine(trimmed)
      const tag = tokens[0]?.value ?? ''
  
      switch (tag) {
        case '#FNAMN': {
          companyName = tokens[1]?.value ?? null
          i++
          break
        }
  
        case '#ORGNR': {
          orgNr = tokens[1]?.value ?? null
          i++
          break
        }
  
        case '#RAR': {
          const indexRaw = tokens[1]?.value
          const startRaw = tokens[2]?.value
          const endRaw = tokens[3]?.value
          const indexNum = indexRaw !== undefined ? Number(indexRaw) : NaN
  
          if (indexRaw === undefined || Number.isNaN(indexNum) || !startRaw || !endRaw) {
            warnings.push(`Ogiltig eller ofullständig #RAR-rad, hoppar över: "${trimmed}"`)
          } else {
            fiscalYears.push({
              index: indexNum,
              start: formatSieDate(startRaw),
              end: formatSieDate(endRaw),
            })
          }
          i++
          break
        }
  
        case '#KONTO': {
          const number = tokens[1]?.value
          const name = tokens[2]?.value ?? ''
  
          if (number === undefined) {
            warnings.push(`#KONTO saknar kontonummer, hoppar över: "${trimmed}"`)
          } else {
            accounts.set(number, { number, name })
          }
          i++
          break
        }
  
        case '#VER': {
          const { ver, nextIndex } = parseVerBlock(lines, i, tokens, warnings)
          if (ver) {
            verifications.push(ver)
            for (const t of ver.transactions) referencedAccounts.add(t.accountNumber)
          }
          i = nextIndex
          break
        }
  
        default: {
          // Kända men ej stödda taggar i v1 (#IB, #UB, #RES, #DIM, #OBJEKT, #KTYP,
          // #SRU, #PROGRAM, #GEN, #ADRESS, #FNR, #TAXAR, #KPTYP, #VALUTA, #FLAGGA,
          // #FORMAT, #SIETYP, m.fl.) ignoreras medvetet – filen ska inte
          // underkännas bara för att de förekommer.
          i++
          break
        }
      }
    }
  
    // ── Metadata-validering ──────────────────────────────────
    if (companyName === null) warnings.push('Saknar #FNAMN (företagsnamn) i filen.')
    if (orgNr === null) warnings.push('Saknar #ORGNR (organisationsnummer) i filen.')
    if (fiscalYears.length === 0) warnings.push('Saknar #RAR (räkenskapsår) i filen.')
    if (accounts.size === 0) warnings.push('Filen innehåller inga #KONTO-poster.')
    if (verifications.length === 0) warnings.push('Filen innehåller inga verifikationer (#VER).')
  
    const currentFiscalYear = fiscalYears.find((fy) => fy.index === 0)
    const year = currentFiscalYear ? Number(currentFiscalYear.start.slice(0, 4)) : null
  
    // ── Saknade konton (refererade i #TRANS men aldrig definierade via #KONTO) ──
    const missingAccounts = Array.from(referencedAccounts)
      .filter((acc) => !accounts.has(acc))
      .sort((a, b) => Number(a) - Number(b))
    for (const acc of missingAccounts) {
      warnings.push(`Konto ${acc} används i en verifikation men saknar #KONTO-post.`)
    }
  
    // ── Balanskontroll ───────────────────────────────────────
    let totalBalanceDiff = 0
    for (const ver of verifications) {
      totalBalanceDiff += ver.balanceDiff
      if (Math.abs(ver.balanceDiff) > BALANCE_EPSILON) {
        errors.push(
          `Verifikation ${ver.series}${ver.verNumber} (${ver.date}) balanserar inte: differens ${ver.balanceDiff.toFixed(2)} kr.`
        )
      }
    }
  
    const isBalanced = Math.abs(totalBalanceDiff) <= BALANCE_EPSILON
    if (!isBalanced) {
      errors.push(`Hela filen balanserar inte: total differens ${totalBalanceDiff.toFixed(2)} kr.`)
    }
  
    return {
      companyName,
      orgNr,
      year,
      fiscalYears,
      accounts: Array.from(accounts.values()).sort((a, b) => Number(a.number) - Number(b.number)),
      verifications,
      accountCount: accounts.size,
      verificationCount: verifications.length,
      totalBalanceDiff,
      isBalanced,
      errors,
      warnings,
    }
  }
  
  // ─────────────────────────────────────────────────────────────
  // Verifikationsblock (#VER { ... })
  // ─────────────────────────────────────────────────────────────
  
  function parseVerBlock(
    lines: string[],
    startIndex: number,
    headerTokens: SieToken[],
    warnings: string[]
  ): { ver: SieVer | null; nextIndex: number } {
    const series = headerTokens[1]?.value
    const verNumber = headerTokens[2]?.value
    const dateRaw = headerTokens[3]?.value
  
    if (series === undefined || verNumber === undefined || !isEightDigitDate(dateRaw)) {
      warnings.push(`Trasig #VER-rad, hoppar över verifikationen: "${lines[startIndex].trim()}"`)
      // Försök ändå hitta blockets slut så att resten av filen kan parsas korrekt.
      return { ver: null, nextIndex: skipToBlockEnd(lines, startIndex + 1) }
    }
  
    let pos = 4
    let description = ''
    let registrationDate: string | undefined
  
    if (headerTokens[pos] !== undefined) {
      description = headerTokens[pos].value
      pos++
    }
    if (isEightDigitDate(headerTokens[pos]?.value)) {
      registrationDate = formatSieDate(headerTokens[pos].value)
      pos++
    }
  
    // Hitta öppningsklammern. Normalt står den på nästa rad, men vi tolererar
    // tomma rader emellan.
    let j = startIndex + 1
    while (j < lines.length && lines[j].trim() === '') j++
  
    if (j >= lines.length || lines[j].trim() !== '{') {
      warnings.push(
        `Verifikation ${series}${verNumber} saknar öppningsklammer "{", hoppar över.`
      )
      return { ver: null, nextIndex: j }
    }
  
    const transactions: SieTrans[] = []
    let k = j + 1
    let closed = false
  
    while (k < lines.length) {
      const lineTrimmed = lines[k].trim()
  
      if (lineTrimmed === '') {
        k++
        continue
      }
      if (lineTrimmed === '}') {
        closed = true
        k++
        break
      }
  
      const rowTokens = tokenizeLine(lineTrimmed)
      const rowTag = rowTokens[0]?.value ?? ''
  
      if (rowTag === '#TRANS') {
        const trans = parseTransLine(rowTokens, warnings, `${series}${verNumber}`)
        if (trans) transactions.push(trans)
      } else if (rowTag === '#BTRANS' || rowTag === '#RTRANS') {
        // Budget- respektive saldoförda transaktioner – utanför scope i v1.
      } else {
        warnings.push(
          `Okänd rad inuti verifikation ${series}${verNumber}, ignoreras: "${lineTrimmed}"`
        )
      }
  
      k++
    }
  
    if (!closed) {
      warnings.push(`Verifikation ${series}${verNumber} saknar avslutande klammer "}".`)
    }
  
    const balanceDiff = transactions.reduce((sum, t) => sum + t.amount, 0)
  
    const ver: SieVer = {
      series,
      verNumber,
      date: formatSieDate(dateRaw),
      description,
      registrationDate,
      transactions,
      balanceDiff,
    }
  
    return { ver, nextIndex: k }
  }
  
  /** Om en #VER-rad är trasig: hoppa fram till och med raden efter matchande "}", så att resten av filen ändå kan parsas. */
  function skipToBlockEnd(lines: string[], from: number): number {
    let j = from
    while (j < lines.length && lines[j].trim() === '') j++
    if (j >= lines.length || lines[j].trim() !== '{') return j
    j++
    while (j < lines.length && lines[j].trim() !== '}') j++
    return j < lines.length ? j + 1 : j
  }
  
  // ─────────────────────────────────────────────────────────────
  // #TRANS-rader
  // ─────────────────────────────────────────────────────────────
  
  /**
   * #TRANS kontonr {objektlista} belopp [transdat] [transtext] [kvantitet] [sign]
   *
   * Endast kontonr, objektlista och belopp är obligatoriska. Övriga fält är
   * positionella och valfria, vilket kräver sekventiell tolkning eftersom
   * verkliga filer blandar korta (4 fält) och långa (7-10 fält) TRANS-rader.
   */
  function parseTransLine(tokens: SieToken[], warnings: string[], verLabel: string): SieTrans | null {
    const accountNumber = tokens[1]?.value
    const objectToken = tokens[2]
    const amountRaw = tokens[3]?.value
  
    if (accountNumber === undefined || amountRaw === undefined) {
      warnings.push(`Ofullständig #TRANS-rad i verifikation ${verLabel}, hoppar över raden.`)
      return null
    }
  
    const amount = parseSieAmount(amountRaw)
    if (amount === null) {
      warnings.push(
        `Ogiltigt belopp "${amountRaw}" på konto ${accountNumber} i verifikation ${verLabel}, hoppar över raden.`
      )
      return null
    }
  
    const objects = objectToken?.brace
      ? parseObjectList(objectToken.value, warnings, `konto ${accountNumber}, verifikation ${verLabel}`)
      : []
  
    let pos = 4
    let transDate: string | undefined
    let description: string | undefined
    let quantity: number | undefined
  
    if (isEightDigitDate(tokens[pos]?.value)) {
      transDate = formatSieDate(tokens[pos].value)
      pos++
    }
  
    if (tokens[pos] !== undefined) {
      description = tokens[pos].value
      pos++
    }
  
    if (tokens[pos] !== undefined) {
      const qty = parseSieAmount(tokens[pos].value)
      if (qty !== null) {
        quantity = qty
        pos++
      }
    }
    // Ev. kvarvarande token (sign/kvantitetsenhet) lämnas omedvetet oparsad i v1.
  
    return {
      accountNumber,
      amount,
      objects,
      transDate,
      description,
      quantity,
    }
  }