import { supabase } from '@/lib/supabaseClient'

export async function setupDefaultAccounts(userId: string) {
  const defaultAccounts = [
    { id: 'avskrivning_inventarier', name: 'Avskrivning på inventarier', debit_account: '7830', credit_account: '1220', default_vat_rate: 0, comment: 'För inköp av dyr utrustning >28 650 kr', user_id: userId },
    { id: 'bankavgift', name: 'Bankavgift', debit_account: '6570', credit_account: '1930', default_vat_rate: 0, comment: 'Bankkostnad', user_id: userId },
    { id: 'egen_insättning', name: 'Egen insättning (Kapital)', debit_account: '1930', credit_account: '2018', default_vat_rate: 0, comment: 'När du sätter in privata pengar', user_id: userId },
    { id: 'eget_uttag', name: 'Privat uttag (Lön)', debit_account: '2013', credit_account: '1930', default_vat_rate: 0, comment: 'När du tar ut pengar till dig själv', user_id: userId },
    { id: 'ej_avdragsgillt', name: 'Ej avdragsgilla kostnader', debit_account: '6992', credit_account: '1930', default_vat_rate: 0, comment: 'Böter, förseningsavgift etc (Ej skatteavdrag)', user_id: userId },
    { id: 'försäljning', name: 'Försäljning', debit_account: '1930', credit_account: '3010', default_vat_rate: 25, comment: 'Kundbetalning', user_id: userId },
    { id: 'ingående_balans', name: 'Eget kapital, ingående balans (IB)', debit_account: '1930', credit_account: '2010', default_vat_rate: 0, comment: 'Används endast vid årets början', user_id: userId },
    { id: 'kurser', name: 'Kurser', debit_account: '7610', credit_account: '1930', default_vat_rate: 25, comment: 'Fortbildning', user_id: userId },
    { id: 'prenumerationer', name: 'Prenumerationer', debit_account: '5420', credit_account: '1930', default_vat_rate: 25, comment: 'Adobe, SaaS', user_id: userId },
    { id: 'privat_utlägg', name: 'Privat utlägg för firman', debit_account: '5410', credit_account: '2018', default_vat_rate: 25, comment: 'Du har betalat firman grejer med privata pengar', user_id: userId },
    { id: 'resor', name: 'Resor', debit_account: '5800', credit_account: '1930', default_vat_rate: 6, comment: 'Spårvagn, taxi', user_id: userId },
    { id: 'periodisering', name: 'Förutbetalda kostnader', debit_account: '1790', credit_account: '1930', default_vat_rate: 0, comment: 'Används automatiskt vid periodisering av utgifter över nyår', user_id: userId },
    { id: 'skattekonto_default', name: 'Skattekonto (Moms & Skattereglering)', debit_account: '2012', credit_account: '1930', default_vat_rate: 0, comment: 'Används för insättningar och uttag på Skatteverkets skattekonto (t.ex. momsreglering och skatteåterbäring)', user_id: userId }
  ]
  const { error } = await supabase.from('accounts').insert(defaultAccounts)
  if (error) console.error('Kunde inte skapa standardkonton:', error)
}