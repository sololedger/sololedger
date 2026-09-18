import {
    calculateBusinessResult,
    type BalanceMap,
    type NeRow,
    type ResultWarningCode,
  } from '../src/lib/resultEngine.ts'
  
  let passed = 0
  let failed = 0
  
  function assertEqual(
    actual: unknown,
    expected: unknown,
    description: string
  ) {
    if (actual === expected) {
      console.log(`✓ ${description}`)
      passed++
      return
    }
  
    console.error(`✗ ${description}`)
    console.error(`  Förväntat: ${expected}`)
    console.error(`  Faktiskt:   ${actual}`)
    failed++
  }
  
  function assertWarning(
    balances: BalanceMap,
    accountNumber: string,
    code: ResultWarningCode,
    description: string
  ) {
    const result = calculateBusinessResult(balances)
  
    const warning = result.warnings.find(
      item =>
        item.accountNumber === accountNumber &&
        item.code === code
    )
  
    assertEqual(Boolean(warning), true, description)
  }
  
  function testFixedAccount(
    accountNumber: string,
    balance: number,
    expectedRow: NeRow,
    expectedRowValue: number,
    expectedResult: number,
    description: string
  ) {
    const result = calculateBusinessResult({
      [accountNumber]: balance,
    })
  
    assertEqual(
      result.neRows[expectedRow],
      expectedRowValue,
      `${description} → ${expectedRow}`
    )
  
    assertEqual(
      result.bokfortResultat,
      expectedResult,
      `${description} → bokfört resultat`
    )
  
    assertEqual(
      result.reconciliationDifference,
      0,
      `${description} → avstämning`
    )
  }
  
  console.log('\n=== SoloLedger Result Engine Tests ===\n')
  
  // ---------------------------------------------------------
  // FASTA K1-KONTON
  // ---------------------------------------------------------
  
  testFixedAccount(
    '3010',
    -100000,
    'R1',
    100000,
    100000,
    '3010 försäljning'
  )
  
  testFixedAccount(
    '3100',
    -10000,
    'R2',
    10000,
    10000,
    '3100 momsfri intäkt'
  )
  
  testFixedAccount(
    '3200',
    -5000,
    'R3',
    5000,
    5000,
    '3200 bil- och bostadsförmån'
  )
  
  testFixedAccount(
    '3500',
    -2000,
    'R1',
    2000,
    2000,
    '3500 fakturerade kostnader'
  )
  
  testFixedAccount(
    '8310',
    -1000,
    'R4',
    1000,
    1000,
    '8310 ränteintäkt'
  )
  
  testFixedAccount(
    '4000',
    20000,
    'R5',
    20000,
    -20000,
    '4000 varor/material'
  )
  
  testFixedAccount(
    '4600',
    5000,
    'R5',
    5000,
    -5000,
    '4600 legoarbete/underentreprenad'
  )
  
  /**
   * Viktigt specialfall:
   * kredit på ett kostnadskonto ska MINSKA kostnaden.
   */
  testFixedAccount(
    '4700',
    -1000,
    'R5',
    -1000,
    1000,
    '4700 erhållen rabatt'
  )
  
  testFixedAccount(
    '4900',
    2000,
    'R5',
    2000,
    -2000,
    '4900 lagerförändring'
  )
  
  testFixedAccount(
    '6570',
    3000,
    'R6',
    3000,
    -3000,
    '6570 bankkostnader'
  )
  
  testFixedAccount(
    '7000',
    4000,
    'R7',
    4000,
    -4000,
    '7000 personalkostnad'
  )
  
  testFixedAccount(
    '8410',
    1500,
    'R8',
    1500,
    -1500,
    '8410 räntekostnad'
  )
  
  testFixedAccount(
    '7820',
    2000,
    'R9',
    2000,
    -2000,
    '7820 avskrivning'
  )
  
  testFixedAccount(
    '7830',
    2500,
    'R10',
    2500,
    -2500,
    '7830 avskrivning'
  )
  
  // ---------------------------------------------------------
  // TECKENKONTROLL
  // ---------------------------------------------------------
  
  /**
   * En debetvänd 3010-korrigering ska minska intäkten/resultatet.
   * Math.abs() hade gjort detta fel.
   */
  testFixedAccount(
    '3010',
    2000,
    'R1',
    -2000,
    -2000,
    '3010 debetvänd korrigering'
  )
  
  // ---------------------------------------------------------
  // SCENARIO-REQUIRED
  // ---------------------------------------------------------
  
  const scenario3900 = calculateBusinessResult({
    '3900': -5000,
  })
  
  assertEqual(
    scenario3900.bokfortResultat,
    5000,
    '3900 påverkar bokfört resultat'
  )
  
  assertEqual(
    scenario3900.unresolvedResultEffect,
    5000,
    '3900 ligger i olöst resultatpåverkan'
  )
  
  assertEqual(
    scenario3900.neRows.R1,
    0,
    '3900 gissas inte till R1'
  )
  
  assertEqual(
    scenario3900.neRows.R2,
    0,
    '3900 gissas inte till R2'
  )
  
  assertWarning(
    { '3900': -5000 },
    '3900',
    'scenario_required',
    '3900 ger scenario-varning'
  )
  
  assertEqual(
    scenario3900.reconciliationDifference,
    0,
    '3900 stämmer av trots olöst NE-rad'
  )
  
  const scenario7700 = calculateBusinessResult({
    '7700': 3000,
  })
  
  assertEqual(
    scenario7700.bokfortResultat,
    -3000,
    '7700 påverkar bokfört resultat'
  )
  
  assertEqual(
    scenario7700.unresolvedResultEffect,
    -3000,
    '7700 ligger i olöst resultatpåverkan'
  )
  
  assertWarning(
    { '7700': 3000 },
    '7700',
    'scenario_required',
    '7700 ger scenario-varning'
  )
  
  assertEqual(
    scenario7700.reconciliationDifference,
    0,
    '7700 stämmer av trots olöst NE-rad'
  )
  
  // ---------------------------------------------------------
  // 7970 – RESULTAT KÄNT, NE-RAD OLÖST
  // ---------------------------------------------------------
  
  const unresolved7970 = calculateBusinessResult({
    '7970': 4000,
  })
  
  assertEqual(
    unresolved7970.bokfortResultat,
    -4000,
    '7970 påverkar bokfört resultat'
  )
  
  assertEqual(
    unresolved7970.unresolvedResultEffect,
    -4000,
    '7970 ligger i olöst resultatpåverkan'
  )
  
  assertWarning(
    { '7970': 4000 },
    '7970',
    'unknown_ne_mapping',
    '7970 ger varning för okänd NE-mappning'
  )
  
  assertEqual(
    unresolved7970.reconciliationDifference,
    0,
    '7970 stämmer av trots okänd NE-rad'
  )
  
  // ---------------------------------------------------------
  // SPECIFIK REGEL SKA VINNA ÖVER 39xx
  // ---------------------------------------------------------
  
  testFixedAccount(
    '3970',
    -2500,
    'R2',
    2500,
    2500,
    '3970 går direkt till R2'
  )
  
  testFixedAccount(
    '3980',
    -1500,
    'R2',
    1500,
    1500,
    '3980 går direkt till R2'
  )
  
  // ---------------------------------------------------------
  // 71xx / 72xx SKA INTE GISSA R7
  // ---------------------------------------------------------
  
  assertWarning(
    { '7100': 1000 },
    '7100',
    'unknown_ne_mapping',
    '7100 mappas inte automatiskt till R7'
  )
  
  assertWarning(
    { '7200': 1000 },
    '7200',
    'unknown_ne_mapping',
    '7200 mappas inte automatiskt till R7'
  )
  
  // ---------------------------------------------------------
  // 6992 – EJ AVDRAGSGILL KOSTNAD
  // ---------------------------------------------------------
  
  const nonDeductible = calculateBusinessResult({
    '3010': -10000,
    '6992': 1000,
  })
  
  assertEqual(
    nonDeductible.bokfortResultat,
    9000,
    '6992 minskar bokfört resultat'
  )
  
  assertEqual(
    nonDeductible.ejAvdragsgillt,
    1000,
    '6992 identifieras som ej avdragsgillt'
  )
  
  assertEqual(
    nonDeductible.skattemassigtResultat,
    10000,
    '6992 återläggs i skattemässigt resultat'
  )
  
  // ---------------------------------------------------------
  // SAMMANSATT AVSTÄMNING
  // ---------------------------------------------------------
  
  const combined = calculateBusinessResult({
    '3010': -100000,
    '4700': -1000,
    '6570': 3000,
    '8410': 1500,
    '3900': -5000,
    '7970': 4000,
  })
  
  assertEqual(
    combined.bokfortResultat,
    97500,
    'Sammansatt bokfört resultat'
  )
  
  assertEqual(
    combined.unresolvedResultEffect,
    1000,
    'Sammansatt olöst resultatpåverkan'
  )
  
  assertEqual(
    combined.reconciliationDifference,
    0,
    'Sammansatt resultat stämmer av exakt'
  )
// ---------------------------------------------------------
// ---------------------------------------------------------
// HELT OKÄNT RESULTATKONTO
// ---------------------------------------------------------

const unknown3300 = calculateBusinessResult({
    '3300': -5000,
  })
  
  assertEqual(
    unknown3300.bokfortResultat,
    5000,
    'Okänt 3300 påverkar bokfört resultat'
  )
  
  assertEqual(
    unknown3300.unresolvedResultEffect,
    5000,
    'Okänt 3300 ligger i olöst resultatpåverkan'
  )
  
  assertWarning(
    { '3300': -5000 },
    '3300',
    'unknown_result_account',
    'Okänt 3300 ger varning'
  )
  
  assertEqual(
    unknown3300.reconciliationDifference,
    0,
    'Okänt 3300 stämmer av trots saknad NE-rad'
  )
  
// ---------------------------------------------------------
// TEKNISKA BOKSLUTSKONTON 899x
// ---------------------------------------------------------

const technical8999 = calculateBusinessResult({
    '3010': -100000,
    '6570': 5000,
    '8999': 95000,
  })
  
  assertEqual(
    technical8999.bokfortResultat,
    95000,
    '8999 påverkar inte bokfört resultat'
  )
  
  assertEqual(
    technical8999.unresolvedResultEffect,
    0,
    '8999 hamnar inte i olöst resultatpåverkan'
  )
  
  const technical8990 = calculateBusinessResult({
    '3010': -100000,
    '8990': 100000,
  })
  
  assertEqual(
    technical8990.bokfortResultat,
    100000,
    '8990 påverkar inte bokfört resultat'
  )
  
  assertEqual(
    technical8990.unresolvedResultEffect,
    0,
    '8990 hamnar inte i olöst resultatpåverkan'
  )
  // ---------------------------------------------------------
  // SLUTRESULTAT
  // ---------------------------------------------------------
  
  console.log('\n-----------------------------------')
  console.log(`Godkända tester: ${passed}`)
  console.log(`Misslyckade tester: ${failed}`)
  console.log('-----------------------------------\n')
  
  if (failed > 0) {
    process.exitCode = 1
  } else {
    console.log('✓ Alla resultatmotortester godkända.\n')
  }
