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