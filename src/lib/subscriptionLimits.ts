// src/lib/subscriptionLimits.ts

// Här sätter vi din spikade gräns på 15 transaktioner för gratisversionen
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
 * Returnerar true om användaren får skapa fler transaktioner.
 * - Premium / Aktiv Trial = Alltid true (obegränsat)
 * - Free = True så länge de har färre än 15 st
 */
export function canCreateTransaction(
  profile: Profile | null,
  currentTransactionCount: number
): boolean {
  if (isSubscriptionActive(profile)) return true
  return currentTransactionCount < FREE_TRANSACTION_LIMIT
}

/**
 * Returnerar true om användaren har tillgång till Momsrapport & NE-bilaga.
 * - Endast aktiva Premium- eller Trial-användare har tillgång.
 */
export function canAccessPaidFeature(profile: Profile | null): boolean {
  return isSubscriptionActive(profile)
}