import { supabase } from '@/lib/supabaseClient'
import { getDefaultAccountPresets } from '@/lib/accountingKnowledge'

export async function setupDefaultAccounts(userId: string) {
  // SoloLedger är avsett för enskild firma utan anställda.
  // Standardkontona hämtas från den gemensamma knowledge-källan.
  const defaultAccounts = getDefaultAccountPresets().map(preset => ({
    id: preset.id,
    name: preset.name,
    debit_account: preset.debit_account,
    credit_account: preset.credit_account,
    default_vat_rate: preset.default_vat_rate,
    comment: preset.comment,
    user_id: userId,
  }))

  const { error } = await supabase.from('accounts').insert(defaultAccounts)
  if (error) console.error('Kunde inte skapa standardkonton:', error)
}