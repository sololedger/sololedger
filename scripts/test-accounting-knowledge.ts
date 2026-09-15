import {
    getDefaultAccountPresetsV1,
    getQuickAccountPresetsV1,
  } from '../src/lib/accountingKnowledge'
  
  const defaults = getDefaultAccountPresetsV1()
  const quick = getQuickAccountPresetsV1()
  
  console.log('\n=== DEFAULT ===')
  console.table(
    defaults.map(preset => ({
      id: preset.id,
      debit: preset.debit_account,
      credit: preset.credit_account,
      vat: preset.default_vat_rate,
    }))
  )
  
  console.log('\n=== QUICK ===')
  console.table(
    quick.map(preset => ({
      id: preset.id,
      debit: preset.debit_account,
      credit: preset.credit_account,
      vat: preset.default_vat_rate,
    }))
  )
  
  console.log('\n=== RESULTAT ===')
  console.log(`Default: ${defaults.length} / förväntat 9`)
  console.log(`Quick:   ${quick.length} / förväntat 14`)
  
  if (defaults.length !== 9) {
    throw new Error(`Fel antal Default-presets: ${defaults.length}`)
  }
  
  if (quick.length !== 14) {
    throw new Error(`Fel antal Quick-presets: ${quick.length}`)
  }
  
  console.log('✓ Grundkontoplan v1 compatibility bridge ser komplett ut.')

  const expectedDefaultIds = [
    'forsaljning',
    'forbrukningsinventarier',
    'programvaror',
    'resor',
    'bankavgift',
    'kurser',
    'skatter_avgifter',
    'eget_uttag',
    'egen_insattning',
  ]
  
  const actualDefaultIds = defaults.map(preset => preset.id)
  
  if (JSON.stringify(actualDefaultIds) !== JSON.stringify(expectedDefaultIds)) {
    throw new Error(
      `Fel grundkontoplan.\nFörväntat: ${expectedDefaultIds.join(', ')}\nFick: ${actualDefaultIds.join(', ')}`
    )
  }
  
  const forbiddenLegacyDefaults = [
    'avskrivning_inventarier',
    'ingående_balans',
    'privat_utlägg',
    'periodisering',
    'skattekonto_default',
  ]
  
  const leakedLegacyDefaults = defaults.filter(preset =>
    forbiddenLegacyDefaults.includes(preset.id)
  )
  
  if (leakedLegacyDefaults.length > 0) {
    throw new Error(
      `Legacy-kategorier har läckt in i Grundkontoplan v1: ${leakedLegacyDefaults
        .map(preset => preset.id)
        .join(', ')}`
    )
  }
  
  for (const preset of defaults) {
    if (!preset.seedDefault) {
      throw new Error(
        `Default-kategorin ${preset.id} saknar seedDefault=true`
      )
    }
  
    if (preset.quickSuggestion) {
      throw new Error(
        `Default-kategorin ${preset.id} är felaktigt markerad som quickSuggestion`
      )
    }
  }
  
  console.log('✓ Exakt rätt 9 kategorier skapas för nya användare.')
  console.log('✓ Inga gamla tekniska legacy-defaults följer med.')
  console.log('✓ Default/Quick-flaggorna är korrekta.')