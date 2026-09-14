/**
 * Gemensam resultatmotor för SoloLedger.
 *
 * VIKTIGT:
 * - Ren funktion: ingen Supabase, React eller annan I/O.
 * - Ska på sikt vara single source of truth för både Dashboard och NE.
 * - Balanskonventionen i SoloLedger är: debit - credit.
 * - Math.abs() får INTE användas för resultatpåverkan.
 *
 * Källprincip:
 * - BFN K1 = redovisningsmässig innebörd
 * - Skatteverket = NE / deklarationsstruktur
 * - BAS K1 / aktuell SRU-koppling = konto -> NE-rad
 *
 * Den här filen kopplas INTE till produktionsflödet förrän den är testad.
 */

export type BalanceMap = Record<string, number>

export type NeRow =
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'R9'
  | 'R10'

export type ResultType = 'income' | 'expense'

export type ClassificationStatus =
  | 'fixed'
  | 'scenario_required'
  | 'unknown_ne_mapping'

export type ResultWarningCode =
  | 'scenario_required'
  | 'unknown_ne_mapping'
  | 'unknown_result_account'

export interface ResultAccountClassification {
  accountNumber: string
  resultType: ResultType
  status: ClassificationStatus

  neRow?: NeRow
  possibleNeRows?: NeRow[]
}

export interface ResultWarning {
  code: ResultWarningCode
  accountNumber: string
  balance: number
  resultEffect?: number
  message: string
  possibleNeRows?: NeRow[]
}

export interface ResultEngineResult {
  intakter: number
  kostnader: number
  bokfortResultat: number

  neRows: Record<NeRow, number>

  /**
   * 6992 är bokförd kostnad i R6 men ska läggas tillbaka
   * skattemässigt.
   *
   * Värdet behåller tecknet.
   * Debit saldo => positiv återläggning.
   * Kredit saldo => negativ korrigering.
   */
  ejAvdragsgillt: number
  skattemassigtResultat: number

  /**
   * Resultatpåverkan som finns med i bokfört resultat men ännu
   * inte har kunnat placeras på en bestämd R-rad.
   */
  unresolvedResultEffect: number

  /**
   * Kontroll:
   *
   * bokfört resultat =
   * resultat från fasta NE-rader
   * + unresolvedResultEffect
   *
   * Bör alltid bli 0 inom avrundning.
   */
  reconciliationDifference: number

  warnings: ResultWarning[]
}

const ROUNDING_PRECISION = 100

function round(value: number): number {
  return Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION
}

function startsWithAny(
  accountNumber: string,
  prefixes: string[]
): boolean {
  return prefixes.some(prefix => accountNumber.startsWith(prefix))
}

/**
 * Klassificerar ett resultatkonto.
 *
 * Ordningen är medvetet viktig:
 * specifika regler måste testas före bredare prefixregler.
 */
export function classifyResultAccount(
  accountNumber: string
): ResultAccountClassification | null {
  const account = accountNumber.trim()

  if (!/^\d{4}$/.test(account)) {
    return null
  }

  // ---------------------------------------------------------
  // SPECIFIKA REGLER FÖRE GENERELLA PREFIX
  // ---------------------------------------------------------

  // R2: särskilda 39xx-konton som INTE ska bli scenario-required.
  if (startsWithAny(account, ['397', '398'])) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'fixed',
      neRow: 'R2',
    }
  }

  // R4: ränteintäkter m.m.
  if (startsWithAny(account, ['831', '833'])) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'fixed',
      neRow: 'R4',
    }
  }

  // R8: räntekostnader m.m.
  if (startsWithAny(account, ['841', '843'])) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'fixed',
      neRow: 'R8',
    }
  }

  // R9: avskrivningar.
  if (account.startsWith('782')) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'fixed',
      neRow: 'R9',
    }
  }

  // R10: avskrivningar/nedskrivningar enligt K1-kopplingen.
  if (startsWithAny(account, ['781', '783'])) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'fixed',
      neRow: 'R10',
    }
  }

  /**
   * 7970 finns som R6 i äldre K1-material men saknas i den
   * aktuella BAS K1/SRU-tabell vi granskat.
   *
   * Resultattypen är säker (kostnad), men NE-raden lämnas
   * medvetet olöst tills aktuell placering kan verifieras.
   */
  if (account.startsWith('797')) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'unknown_ne_mapping',
    }
  }

  // 798x kan beroende på situation hamna på R9 eller R10.
  if (account.startsWith('798')) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'scenario_required',
      possibleNeRows: ['R9', 'R10'],
    }
  }

  // ---------------------------------------------------------
  // SCENARIOBEROENDE GRUPPER
  // ---------------------------------------------------------

  // 37xx kan höra till R1 eller R2.
  if (account.startsWith('37')) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'scenario_required',
      possibleNeRows: ['R1', 'R2'],
    }
  }

  // 39xx kan höra till R1 eller R2.
  // 397x och 398x har redan fångats ovan.
  if (account.startsWith('39')) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'scenario_required',
      possibleNeRows: ['R1', 'R2'],
    }
  }

  // 77xx kan höra till R9 eller R10.
  if (account.startsWith('77')) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'scenario_required',
      possibleNeRows: ['R9', 'R10'],
    }
  }

  // ---------------------------------------------------------
  // FASTA K1-GRUPPER
  // ---------------------------------------------------------

  if (
    account.startsWith('30') ||
    account.startsWith('35')
  ) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'fixed',
      neRow: 'R1',
    }
  }

  if (account.startsWith('31')) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'fixed',
      neRow: 'R2',
    }
  }

  if (account.startsWith('32')) {
    return {
      accountNumber: account,
      resultType: 'income',
      status: 'fixed',
      neRow: 'R3',
    }
  }

  /**
   * R5 – Varor, material och tjänster.
   *
   * Aktuell BAS K1/SRU placerar bl.a. 4700 här.
   * Hela klass 4 behandlas därför som R5 i denna motor.
   */
  if (account.startsWith('4')) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'fixed',
      neRow: 'R5',
    }
  }

  /**
   * R6 – Övriga externa kostnader.
   *
   * Efter granskning av aktuell K1/SRU-spec används hela
   * klass 5 och 6 som R6.
   */
  if (
    account.startsWith('5') ||
    account.startsWith('6')
  ) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'fixed',
      neRow: 'R6',
    }
  }

  /**
   * R7.
   *
   * Vi mappar endast de K1-grupper som uttryckligen stöds.
   * 71xx och 72xx ska inte automatiskt hamna på R7.
   */
  if (
    startsWithAny(account, [
      '70',
      '73',
      '74',
      '75',
      '76',
    ])
  ) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'fixed',
      neRow: 'R7',
    }
  }

  /**
   * Övriga 7xxx är fortfarande resultatkonton/kostnader,
   * men SoloLedger kan inte säkert bestämma NE-rad.
   *
   * De ska därför påverka bokfört resultat men generera
   * en varning i stället för att tyst gissas till en R-rad.
   */
  if (account.startsWith('7')) {
    return {
      accountNumber: account,
      resultType: 'expense',
      status: 'unknown_ne_mapping',
    }
  }

  /**
   * Övriga 3xxx eller 8xxx kan vara resultatpåverkande,
   * men vi saknar tillräckligt säker K1-klassificering.
   *
   * Returnera null så att motorn flaggar dem separat som
   * okända resultatkonton istället för att gissa.
   */
  return null
}

function createEmptyNeRows(): Record<NeRow, number> {
  return {
    R1: 0,
    R2: 0,
    R3: 0,
    R4: 0,
    R5: 0,
    R6: 0,
    R7: 0,
    R8: 0,
    R9: 0,
    R10: 0,
  }
}

function isPotentialResultAccount(accountNumber: string): boolean {
  if (!/^\d{4}$/.test(accountNumber)) {
    return false
  }

  const firstDigit = Number(accountNumber[0])

  return firstDigit >= 3 && firstDigit <= 8
}

/**
 * Beräknar resultat utifrån årsvisa kontosaldon.
 *
 * Förväntad balanskonvention:
 *   saldo = debit - credit
 *
 * Därför:
 *   incomeEffect  = -balance
 *   expenseEffect = balance
 */
export function calculateBusinessResult(
  balances: BalanceMap
): ResultEngineResult {
  const neRows = createEmptyNeRows()
  const warnings: ResultWarning[] = []

  let intakter = 0
  let kostnader = 0
  let bokfortResultat = 0
  let unresolvedResultEffect = 0

  for (const [rawAccountNumber, rawBalance] of Object.entries(balances)) {
    const accountNumber = rawAccountNumber.trim()
    const balance = Number(rawBalance)

    if (!Number.isFinite(balance) || balance === 0) {
      continue
    }

    const classification = classifyResultAccount(accountNumber)

    if (!classification) {
        /**
         * Alla BAS-konton i klass 3–8 är potentiellt resultatpåverkande.
         *
         * Även om SoloLedger inte kan bestämma exakt NE-rad får saldot
         * aldrig försvinna ur bokfört resultat.
         *
         * Med balanskonventionen debit - credit är resultatpåverkan
         * alltid -balance.
         */
        if (isPotentialResultAccount(accountNumber)) {
          const resultEffect = -balance
      
          bokfortResultat += resultEffect
          unresolvedResultEffect += resultEffect
      
          warnings.push({
            code: 'unknown_result_account',
            accountNumber,
            balance,
            resultEffect,
            message:
              `Konto ${accountNumber} påverkar resultatet, men SoloLedger ` +
              'saknar en säker K1-klassificering och NE-rad för kontot.',
          })
        }
      
        continue
      }

    const resultEffect =
      classification.resultType === 'income'
        ? -balance
        : -balance

    /**
     * Resultateffekten är matematiskt alltid -balance eftersom
     * balanskonventionen är debit-credit:
     *
     * intäkt normalt kredit => negativt saldo => positivt resultat
     * kostnad normalt debit  => positivt saldo => negativt resultat
     *
     * resultType används separat för presentation av intäkter/kostnader.
     */
    bokfortResultat += resultEffect

    if (classification.resultType === 'income') {
      intakter += -balance
    } else {
      kostnader += balance
    }

    if (
      classification.status === 'fixed' &&
      classification.neRow
    ) {
      /**
       * NE-raderna lagras som positiva/intuitiva belopp:
       *
       * R1-R4: intäktsbelopp
       * R5-R10: kostnadsbelopp
       *
       * Kreditvända korrigeringar får därför minska respektive rad.
       */
      const neEffect =
        classification.resultType === 'income'
          ? -balance
          : balance

      neRows[classification.neRow] += neEffect
      continue
    }

    unresolvedResultEffect += resultEffect

    if (classification.status === 'scenario_required') {
      warnings.push({
        code: 'scenario_required',
        accountNumber,
        balance,
        resultEffect,
        possibleNeRows: classification.possibleNeRows,
        message:
          `Konto ${accountNumber} påverkar resultatet men kräver ` +
          `bedömning för NE-rad (${classification.possibleNeRows?.join(
            ' eller '
          )}).`,
      })

      continue
    }

    warnings.push({
      code: 'unknown_ne_mapping',
      accountNumber,
      balance,
      resultEffect,
      message:
        `Konto ${accountNumber} påverkar resultatet men SoloLedger ` +
        'kan ännu inte placera det säkert på en NE-rad.',
    })
  }

  const knownNeResult =
    neRows.R1 +
    neRows.R2 +
    neRows.R3 +
    neRows.R4 -
    neRows.R5 -
    neRows.R6 -
    neRows.R7 -
    neRows.R8 -
    neRows.R9 -
    neRows.R10

  const reconciliationDifference =
    bokfortResultat -
    (knownNeResult + unresolvedResultEffect)

  /**
   * 6992 ligger redan i R6 och påverkar bokfört resultat som kostnad.
   * Vid skattemässig beräkning ska saldot läggas tillbaka.
   *
   * Ingen Math.abs():
   * en kreditkorrigering måste kunna minska återläggningen.
   */
  const ejAvdragsgillt = Number(balances['6992'] || 0)

  const skattemassigtResultat =
    bokfortResultat + ejAvdragsgillt

  return {
    intakter: round(intakter),
    kostnader: round(kostnader),
    bokfortResultat: round(bokfortResultat),

    neRows: {
      R1: round(neRows.R1),
      R2: round(neRows.R2),
      R3: round(neRows.R3),
      R4: round(neRows.R4),
      R5: round(neRows.R5),
      R6: round(neRows.R6),
      R7: round(neRows.R7),
      R8: round(neRows.R8),
      R9: round(neRows.R9),
      R10: round(neRows.R10),
    },

    ejAvdragsgillt: round(ejAvdragsgillt),
    skattemassigtResultat: round(skattemassigtResultat),

    unresolvedResultEffect: round(unresolvedResultEffect),
    reconciliationDifference: round(reconciliationDifference),

    warnings,
  }
}