/** KAN-100 step 1: the existing NE calculation, without transport or persistence.
 * Balances use debit minus credit. Supplying these maps does not prove that
 * they share a database snapshot or that an imported result is reliable.
 */
import { calculateBusinessResult } from './resultEngine'
import { calculateNeEquityResult } from './neEquity'
import { calculateNeBalanceRows, type BalanceMap } from './neBalance'
import { allocateNeSales, type NeSalesClassificationSummary } from './neSalesClassification'
import { collectNeAccountCoverage } from './neAccountCoverage'

export interface NeCalculationSources {
  annualBalances: BalanceMap
  balanceSheetBalances: BalanceMap
  cumulativeBalances: BalanceMap
  neSalesClassification: NeSalesClassificationSummary
}

export function calculateNeResult(balances: Record<string, number>) {
  const result = calculateBusinessResult(balances)

  const {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
    R7,
    R8,
    R9,
    R10,
  } = result.neRows

  const bokfRes = result.bokfortResultat
  const ejAvdr = result.ejAvdragsgillt

  // NE sida 2 – skattemässiga justeringar:
  // R12 = bokfört resultat från R11
  // R13 = bokförda kostnader som inte ska dras av
  // R14 = bokförda intäkter som inte ska tas upp
  // R15 = intäkter som inte bokförts men ska tas upp
  // R16 = kostnader som inte bokförts men ska dras av
  //
  // Endast uttryckligt verifierade BAS-underkonton justeras automatiskt.
  // Osäkra fördelningar och personalrelaterade konton följer med för granskning.
  const R11 = bokfRes
  const R12 = R11
  const R13 = ejAvdr
  const R14 = result.skattefriaIntakter
  const R15 = 0
  const R16 = 0
  const R17 = result.skattemassigtResultat

  return {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
    R7,
    R8,
    R9,
    R10,
    ejAvdr,
    bokfRes,
    R11,
    R12,
    R13,
    R14,
    R15,
    R16,
    R17,

    // Bevara klassificeringsvarningar och olöst resultatpåverkan för NE-vyn.
    warnings: result.warnings,
    taxReviews: result.taxReviews,
    unresolvedResultEffect: result.unresolvedResultEffect,
    reconciliationDifference: result.reconciliationDifference,
  }
}


/** Same cumulative result/equity adapter used by the live read service. */
export function calculateCumulativeNeResult(balances: BalanceMap, includeReviewSources = false) {
  const result = calculateNeResult(balances)
  return { ...result, ...calculateNeEquityResult(balances, result.bokfRes), ...(includeReviewSources ? { reviewBalances: balances } : {}) }
}

/** Shared by the current live report and a future validated archive reader.
 * Keep the three maps separate: the live service currently reads cumulative
 * balances twice. Do not disguise that consistency limitation by merging them.
 */
export function calculateNeReport({
  annualBalances: balances,
  balanceSheetBalances,
  cumulativeBalances,
  neSalesClassification,
}: NeCalculationSources, includeReviewSources = false) {
  const { R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, ejAvdr, bokfRes, R11, R12, R13, R14, R15, R16, R17, warnings, taxReviews, unresolvedResultEffect } = calculateNeResult(balances)

  // B10 är kumulativt och ska följa K1:s eget-kapital-konton för
  // enskild näringsverksamhet. BAS K1 placerar 2010, 2011, 2012, 2013,
  // 2014, 2017 och 2019 i B10. SoloLedger använder dessutom 2018
  // ("Övriga egna insättningar"), som i nuvarande BAS också tillhör
  // eget-kapitalgruppen.
  //
  // Carry-forward utan nya journalrader:
  //   kapital + kumulativt resultat efter överföringar + insättningar - uttag.
  // KAN-93: 899x nettas endast i B10, så ett redan överfört resultat på
  // 2019/2010 inte räknas en gång till. Äkta ingående kapital bevaras.
  //
  // Viktigt: vi klipper inte längre uttag/insättningar till >= 0. En kredit
  // på ett uttagskonto eller en debet på ett insättningskonto kan vara en
  // legitim rättning/återföring och ska då påverka B10 åt motsatt håll.
  // Det bevarar även balansidentiteten.
  const kumulativtEgetKapitalStart =
    -(balanceSheetBalances['2010'] || 0) -
    (balanceSheetBalances['2019'] || 0)

  // Uttagskonton i K1:
  // 2011 Egna varuuttag
  // 2012 Avräkning för skatter och avgifter
  // 2013 Övriga egna uttag
  // 2014 Uttag förmåner
  const kumulativaUttag =
    (balanceSheetBalances['2011'] || 0) +
    (balanceSheetBalances['2012'] || 0) +
    (balanceSheetBalances['2013'] || 0) +
    (balanceSheetBalances['2014'] || 0)

  // Insättningskonton:
  // 2017 Egna insättningar / Årets kapitaltillskott (K1/BAS)
  // 2018 Övriga egna insättningar (SoloLedgers standard och nuvarande BAS)
  // Båda är kreditnormala i vår debet-minus-kredit-konvention och vänds därför.
  const kumulativaInsattningar =
    -(
      (balanceSheetBalances['2017'] || 0) +
      (balanceSheetBalances['2018'] || 0)
    )

  const cumulativeResult = calculateCumulativeNeResult(cumulativeBalances, includeReviewSources)

  const IB_kapital = Math.round(kumulativtEgetKapitalStart * 100) / 100
  const uttag = Math.round(kumulativaUttag * 100) / 100
  const insattningar = Math.round(kumulativaInsattningar * 100) / 100
  const B10_total = Math.round(
    (IB_kapital + cumulativeResult.resultAfterTransfers + insattningar - uttag) * 100
  ) / 100

  const neBalanceRows = calculateNeBalanceRows(balanceSheetBalances, B10_total)

  // Behåll dessa alias under övergången så att annan befintlig UI-kod inte
  // behöver gå sönder medan NE-vyn flyttas till korrekta B-rutor.
  const bank = neBalanceRows.B9
  const B13_forutbetalda = Math.round(Math.max(0, balanceSheetBalances['1790'] || 0) * 100) / 100

  const neIncomeRows = allocateNeSales({ R1, R2 }, neSalesClassification)
  return {
    R1: neIncomeRows.R1, R2: neIncomeRows.R2, R3, R4, R5, R6, R7, R8, R9, R10,
    neSalesClassification,
    accountCoverage: collectNeAccountCoverage(balances, balanceSheetBalances, neSalesClassification),
    warnings, taxReviews, unresolvedResultEffect,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11, R12, R13, R14, R15, R16, R17,
    IB_kapital, insattningar, uttag,
    // Account totals cannot establish whether external closing journals also
    // zeroed the income/expense accounts. Explain that limit without guessing R rows.
    ...(cumulativeResult.technicalResultBalance !== 0 ? { equityReviewRequired: true } : {}),
    bank,
    ...neBalanceRows,
    B13_forutbetalda,
    ...(includeReviewSources ? { reviewSources: { annual: balances, cumulative: cumulativeResult.reviewBalances! } } : {}),
  }
}
