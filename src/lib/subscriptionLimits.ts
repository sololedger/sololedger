// src/lib/subscriptionLimits.ts

import { supabase } from './supabaseClient'

// Gratisversionen tillåter totalt 15 riktiga bokföringsverifikationer per konto.
// Korrigeringsverifikationer och teknisk SIE-ingående balans räknas inte.
export const FREE_TRANSACTION_LIMIT = 15

export interface Profile {
  subscription_type: string
  subscription_end: string | null
}

/**
 * Kollar om användaren har en aktiv betal- eller trial-prenumeration.
 */
export function isSubscriptionActive(profile: Profile | null): boolean {
  if (!profile) return false
  const { subscription_type, subscription_end } = profile

  // Om du har ett admin-konto på dig själv i databasen
  if (subscription_type === 'admin') return true

  // Måste vara antingen paid eller trial
  if (subscription_type !== 'paid' && subscription_type !== 'trial') return false

  // Säkerhetskontroll: Har tiden löpt ut?
  if (subscription_end && new Date(subscription_end).getTime() <= Date.now()) {
    return false
  }

  return true
}

/**
 * Räknar hur många verifikationer som ska belasta gratisgränsen för användaren.
 *
 * Räknas:
 * - vanliga manuella bokningar
 * - importerade #VER från SIE
 * - periodiseringens riktiga verifikationer
 *
 * Räknas INTE:
 * - korrigeringsverifikationer (is_correction = true)
 * - teknisk ingående balans från SIE (source = 'sie_opening_balance')
 * - legacy-ingående balans från äldre SIE-import
 *
 * Vi hämtar bara de få fält som behövs och filtrerar klient-side för att även
 * hantera äldre rader där boolean/source kan vara null.
 */
export async function getFreeTransactionUsage(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, booked, is_correction, source, description')
    .eq('user_id', userId)
    .eq('booked', true)

  if (error) {
    throw new Error('Kunde inte kontrollera gratisgränsen: ' + error.message)
  }

  return (data ?? []).filter((tx: any) => {
    if (tx.is_correction === true) return false

    const isOpeningBalance =
      tx.source === 'sie_opening_balance' ||
      (tx.source === 'sie_import' && tx.description === 'Öppningsbalans')

    return !isOpeningBalance
  }).length
}

/**
 * Returnerar true om användaren får skapa ett visst antal nya verifikationer.
 * - Premium / Aktiv Trial / Admin = alltid true
 * - Free = totalt högst 15 räknade verifikationer
 */
export function canCreateTransactions(
  profile: Profile | null,
  currentTransactionCount: number,
  newVerificationCount = 1
): boolean {
  if (isSubscriptionActive(profile)) return true
  return currentTransactionCount + newVerificationCount <= FREE_TRANSACTION_LIMIT
}

/**
 * Bakåtkompatibel hjälpare för en vanlig bokning som skapar en verifikation.
 */
export function canCreateTransaction(
  profile: Profile | null,
  currentTransactionCount: number
): boolean {
  return canCreateTransactions(profile, currentTransactionCount, 1)
}

/**
 * Returnerar true om användaren har tillgång till Momsrapport & NE-bilaga.
 * - Endast aktiva Premium- eller Trial-användare har tillgång.
 */
export function canAccessPaidFeature(profile: Profile | null): boolean {
  return isSubscriptionActive(profile)
}
