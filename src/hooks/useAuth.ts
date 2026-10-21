'use client'

import type { User } from '@supabase/supabase-js'
import { useState, useEffect, useCallback, useRef } from 'react'
import { beginProfileContext, isCurrentProfileContext, acceptProfileContext, requireProfileContext, type ProfileTicket } from '@/lib/profileContext'
import { verifyProfileWrite } from '@/lib/profileWriteGuard'
import { supabase } from '@/lib/supabaseClient'
import type {
  DeductionEntitlement,
  DomesticSalesVatTreatment,
  ForeignPurchaseReporting,
} from '@/lib/vatDomain'

export type AuthProfile = {
  id: string
  subscription_type: string
  subscription_end: string | null
  company_name: string | null
  org_nr: string | null
  vat_number: string | null
  vat_status: 'registered' | 'not_registered' | 'unknown'
  vat_period_type: 'month' | 'quarter' | 'year' | null
  vat_management_from: string | null
  domestic_sales_vat_treatment: DomesticSalesVatTreatment
  foreign_purchase_reporting: ForeignPurchaseReporting
  default_deduction_entitlement: Exclude<DeductionEntitlement, 'partial'>
  role?: string
  email?: string
} | null

export type AuthCredentials = {
  email: string
  password: string
  isRegistering: boolean
}

export type AuthNotice = { type: 'error' | 'success'; text: string } | null

// Supabase-felmeddelanden kommer på engelska rakt av — vi översätter
// de vanligaste till svenska för en snyggare upplevelse. Okända
// meddelanden visas oöversatta som fallback (bättre än att tappa info).
function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Fel e-postadress eller lösenord.',
    'User already registered': 'Det finns redan ett konto med den e-postadressen.',
    'Email not confirmed': 'Du behöver bekräfta din e-postadress innan du kan logga in.',
    'Password should be at least 6 characters': 'Lösenordet måste vara minst 6 tecken.',
  }
  return map[message] || message
}

const profileColumns = 'id, subscription_type, subscription_end, company_name, org_nr, vat_number, vat_status, vat_period_type, vat_management_from, domestic_sales_vat_treatment, foreign_purchase_reporting, default_deduction_entitlement, role, email'
async function fetchProfileWithTimeout(userId: string, timeoutMs: number) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const { data, error } = await supabase.from('profiles').select(profileColumns)
      .eq('id', userId).abortSignal(abort.signal).single()
    if (error) throw error
    if (!data || data.id !== userId || profileColumns.split(', ').some(column => !(column in data))) throw new Error('Profilens ägare kunde inte verifieras.')
    return data as NonNullable<AuthProfile>
  } finally { clearTimeout(timer) }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AuthProfile>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)
  const [authNotice, setAuthNotice] = useState<AuthNotice>(null)
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false)

  const ticketRef = useRef<ProfileTicket | null>(null)
  const [profileTicket, setProfileTicket] = useState<ProfileTicket | null>(null)
  const mounted = useRef(false)
  const loadProfile = useCallback(async (ticket: ProfileTicket) => {
    if (!ticket.userId) return
    try {
      const data = await fetchProfileWithTimeout(ticket.userId, 8000)
      if (!mounted.current || !acceptProfileContext(ticket, data.id)) return
      setProfile(data)
      setProfileError(false)
    } catch (error) {
      if (!mounted.current || !isCurrentProfileContext(ticket)) return
      console.error('Fel vid profilhämtning:', error)
      setProfile(null)
      setProfileError(true)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return
      const currentUser = session?.user ?? null
      const previousOwner = ticketRef.current?.userId
      const sameOwnerRefresh = Boolean(currentUser && previousOwner === currentUser.id &&
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'))
      // Invalidate before React renders or any pending reply runs.
      const ticket = beginProfileContext(currentUser?.id ?? null)
      ticketRef.current = ticket
      setProfileTicket(ticket)
      // Returning to a visible tab can emit SIGNED_IN again. Keep this owner's
      // verified view mounted while rechecking; the new ticket still blocks
      // writes, and a failed read or identity change clears access as before.
      setProfile(previous => sameOwnerRefresh && previous?.id === currentUser?.id ? previous : null)
      setProfileError(false)
      setUser(currentUser)
      setAuthLoading(false)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryMode(true)
      else if (!currentUser || previousOwner !== currentUser.id) setPasswordRecoveryMode(false)
      // Do not await Supabase work inside its auth callback/lock.
      if (currentUser) void loadProfile(ticket)
    })
    return () => {
      mounted.current = false
      beginProfileContext(null)
      ticketRef.current = null
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const handleAuth = useCallback(async (e: React.FormEvent, credentials: AuthCredentials) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthNotice(null)
    try {
      if (credentials.isRegistering) {
        const { error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
        })
        if (error) throw error
        setAuthNotice({ type: 'success', text: 'Konto skapat! Du loggas nu in.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })
        if (error) throw error
      }
    } catch (err: unknown) {
      setAuthNotice({ type: 'error', text: translateAuthError(err instanceof Error ? err.message : 'Autentiseringen kunde inte slutföras.') })
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Skickar ett återställningsmail. Länken i mailet loggar in användaren
  // med en tillfällig "recovery"-session — de landar då i appen redan
  // inloggade och kan sätta ett nytt lösenord via Profil → Byt lösenord.
  const resetPassword = useCallback(async (email: string) => {
    setAuthNotice(null)
    if (!email) {
      setAuthNotice({ type: 'error', text: 'Fyll i din e-postadress för att återställa lösenordet.' })
      return
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      })
      if (error) throw error
      setAuthNotice({
        type: 'success',
        text: 'Vi har skickat en återställningslänk. Kolla din inkorg (och skräpposten).',
      })
    } catch (err: unknown) {
      setAuthNotice({ type: 'error', text: translateAuthError(err instanceof Error ? err.message : 'Autentiseringen kunde inte slutföras.') })
    }
  }, [])

  // Sätter ett nytt lösenord för den inloggade användaren (används i
  // Profilinställningar). Kräver ingen kännedom om det gamla lösenordet
  // eftersom Supabase redan vet att sessionen är autentiserad.
  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { success: true as const }
    } catch (err: unknown) {
      return { success: false as const, error: translateAuthError(err instanceof Error ? err.message : 'Autentiseringen kunde inte slutföras.') }
    }
  }, [])

  const dismissAuthNotice = useCallback(() => setAuthNotice(null), [])
  const exitPasswordRecoveryMode = useCallback(() => setPasswordRecoveryMode(false), [])

  const handleLogout = useCallback(async () => {
    ticketRef.current = beginProfileContext(null)
    setProfile(null)
    setUser(null)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Utloggning misslyckades:', err)
    } finally {
      setUser(null)
      setProfile(null)
      window.location.reload()
    }
  }, [])

  const retryProfile = useCallback(async () => {
    const owner = ticketRef.current?.userId
    if (!owner) return
    const ticket = beginProfileContext(owner)
    ticketRef.current = ticket
    setProfileTicket(ticket)
    setProfile(null)
    setProfileError(false)
    await loadProfile(ticket)
  }, [loadProfile])
  const renderedTicket = profileTicket
  const verifyProfile = useCallback(async () => {
    if (!renderedTicket) throw new Error('Profilen är inte laddad.')
    requireProfileContext(renderedTicket)
    return verifyProfileWrite(renderedTicket)
  }, [renderedTicket])
  const updateProfile = useCallback((updated: AuthProfile) => {
    if (!updated || !renderedTicket || !isCurrentProfileContext(renderedTicket) || updated.id !== renderedTicket.userId) return
    // Trust a fresh read of persisted values, never the submitted form draft.
    void retryProfile()
  }, [renderedTicket, retryProfile])

  return {
    user,
    profile,
    authLoading,
    profileError,
    profileContextKey: renderedTicket?.sequence ?? 0,
    verifyProfile,
    retryProfile,
    authNotice,
    dismissAuthNotice,
    resetPassword,
    updatePassword,
    passwordRecoveryMode,
    exitPasswordRecoveryMode,
    handleAuth,
    handleLogout,
    setProfile: updateProfile,
  }
}
