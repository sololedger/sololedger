/**
 * Unicode -> CP437 (IBM PC Extended ASCII, codepage 437 / "PC8") -kodare.
 *
 * SIE-formatet (typ 1-4, inklusive den 4E-export SoloLedger genererar)
 * tillåter enligt specifikationen ENDAST denna 8-bitars teckenkodning för
 * #FORMAT PC8 - inte UTF-8. Citat, SIE filformat Utgåva 4B (SIE-gruppen):
 *
 *   "#FORMAT PC8 [...] Tills vidare tillåter standarden endast IBM
 *    Extended 8-bit ASCII (PC8 - codepage 437)."
 *
 * Den här filen konverterar en vanlig JavaScript-sträng (UTF-16 internt)
 * till en Uint8Array med riktiga CP437-bytes, så att den exporterade
 * .se-filen faktiskt MOTSVARAR sin egen #FORMAT PC8-header, inte bara
 * påstår det.
 *
 * Rör INGET annat i SIE-exporten - denna fil är medvetet fristående och
 * känner inte till #IB/#UB/#RES/#VER/#TRANS eller något annat
 * bokföringsbegrepp. Den gör bara en sak: text in, CP437-bytes ut.
 */

// CP437-byte 0x80-0xFF -> Unicode-kodpunkt, i ordning (index 0 = byte 0x80).
// 0x00-0x7F är identiskt med ASCII och behöver ingen tabell.
const CP437_HIGH_TO_UNICODE: number[] = [
    0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7, // 0x80-0x87
    0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5, // 0x88-0x8F
    0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9, // 0x90-0x97
    0x00ff, 0x00d6, 0x00dc, 0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192, // 0x98-0x9F
    0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba, // 0xA0-0xA7
    0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb, // 0xA8-0xAF
    0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556, // 0xB0-0xB7
    0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510, // 0xB8-0xBF
    0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f, // 0xC0-0xC7
    0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567, // 0xC8-0xCF
    0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b, // 0xD0-0xD7
    0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580, // 0xD8-0xDF
    0x03b1, 0x00df, 0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4, // 0xE0-0xE7
    0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229, // 0xE8-0xEF
    0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248, // 0xF0-0xF7
    0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2, 0x25a0, 0x00a0, // 0xF8-0xFF
  ]
  
  // Reverse-lookup: Unicode-kodpunkt -> CP437-byte, för hela 0x80-0xFF-tabellen
  // (0x00-0x7F hanteras separat nedan som ren identisk ASCII-mappning).
  const UNICODE_TO_CP437_HIGH = new Map<number, number>()
  CP437_HIGH_TO_UNICODE.forEach((codepoint, i) => {
    UNICODE_TO_CP437_HIGH.set(codepoint, 0x80 + i)
  })
  
  // Explicit normalisering av vanliga typografiska Unicode-tecken som saknas
  // i CP437, men som säkert kan bytas mot en ASCII-motsvarighet utan
  // informationsförlust av betydelse i en bokföringsfil. Görs INNAN
  // CP437-uppslaget, som ett medvetet, synligt steg.
  const TYPOGRAPHIC_NORMALIZATION: Record<string, string> = {
    '\u2013': '-', // – en dash
    '\u2014': '-', // — em dash
    '\u201c': '"', // "
    '\u201d': '"', // "
    '\u2018': "'", // '
    '\u2019': "'", // '
    '\u00a0': ' ', // non-breaking space -> vanligt mellanslag
  }
  const TYPOGRAPHIC_PATTERN = /[\u2013\u2014\u201c\u201d\u2018\u2019\u00a0]/g
  
  // Explicit fallback-byte ('?') för tecken som varken är ASCII, finns i
  // CP437-tabellen, eller täcks av normaliseringen ovan. Detta är ett
  // SYNLIGT, avsiktligt val - inte en tyst bitvis trunkering (t.ex.
  // `codePoint & 0xFF`, som skulle kunna ge en annan, felaktig men
  // giltigt-utseende CP437-bokstav för ett helt orelaterat Unicode-tecken).
  const FALLBACK_BYTE = 0x3f // '?'
  
  /**
   * Konverterar en vanlig JavaScript-sträng till en Uint8Array med riktiga
   * CP437-bytes.
   *
   * - ASCII 0x00-0x7F returneras oförändrat (identisk mappning).
   * - Vanliga typografiska Unicode-tecken (se TYPOGRAPHIC_NORMALIZATION)
   *   normaliseras först till sin närmaste ASCII-motsvarighet.
   * - Övriga tecken i CP437:s övre teckenområde (0x80-0xFF, bl.a. ÅÄÖåäö)
   *   mappas till sin korrekta CP437-byte.
   * - Tecken som EFTER normalisering fortfarande saknas i CP437 ersätts
   *   explicit med '?' (0x3F).
   *
   * Obs: hanterar Unicode-kodpunkter inom Basic Multilingual Plane (dvs.
   * `charCodeAt`-baserat, en UTF-16-kodenhet per tecken). Tecken utanför
   * BMP (t.ex. emoji, surrogatpar) är inte relevanta för bokföringstext i
   * en SIE-fil och faller tillbaka till '?' per kodenhet - ingen krasch,
   * ingen tyst trunkering, bara den redan definierade fallbacken.
   */
  export function encodeCP437(input: string): Uint8Array {
    const normalized = input.replace(
      TYPOGRAPHIC_PATTERN,
      (ch) => TYPOGRAPHIC_NORMALIZATION[ch]
    )
  
    const bytes = new Uint8Array(normalized.length)
  
    for (let i = 0; i < normalized.length; i++) {
      const codePoint = normalized.charCodeAt(i)
  
      if (codePoint <= 0x7f) {
        // Ren ASCII - identisk mappning.
        bytes[i] = codePoint
      } else if (UNICODE_TO_CP437_HIGH.has(codePoint)) {
        bytes[i] = UNICODE_TO_CP437_HIGH.get(codePoint)!
      } else {
        bytes[i] = FALLBACK_BYTE
      }
    }
  
    return bytes
  }