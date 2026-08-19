'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type AuthProfile = {
  subscription_type: string
  subscription_end: string | null
  company_name: string | null
  org_nr: string | null
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

// Hämtar profilen med en timeout. Används både för det initiala,
// snabba försöket och för det bakgrundsförsök som görs om det första
// tar för lång tid.
async function fetchProfileWithTimeout(userId: string, timeoutMs: number) {
  const { data } = await Promise.race([
    supabase
      .from('profiles')
      .select('subscription_type, subscription_end, company_name, org_nr, role, email')
      .eq('id', userId)
      .maybeSingle(),
    new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    )
  ]) as any
  return data
}

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<AuthProfile>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)
  const [authNotice, setAuthNotice] = useState<AuthNotice>(null)
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false)

  useEffect(() => {
    let isMounted = true
    let hasTriggered = false

    const fallbackTimer = setTimeout(() => {
      if (isMounted && !hasTriggered) {
        setAuthLoading(false)
      }
    }, 2000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return
        hasTriggered = true
        clearTimeout(fallbackTimer)

        // Supabase skickar detta event specifikt när sessionen kommer
        // från en klickad återställningslänk. Vi flaggar det så att
        // page.tsx kan visa en "Sätt nytt lösenord"-skärm direkt,
        // istället för att tyst släppa in användaren i vanliga appen.
        if (_event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryMode(true)
        }

        const currentUser = session?.user ?? null
        setUser((prev: any) => prev?.id === currentUser?.id ? prev : currentUser)

        if (currentUser) {
          setProfileError(false)
          const applyProfile = (data: AuthProfile) => {
            if (!isMounted) return
            setProfile((prev: AuthProfile) =>
              JSON.stringify(prev) === JSON.stringify(data) ? prev : data
            )
          }

          try {
            // Snabbt första försök — hinner det inte inom 3s går vi vidare
            // och gör ett bakgrundsförsök med mer tålamod (istället för
            // att blockera sidan längre än nödvändigt).
            const data = await fetchProfileWithTimeout(currentUser.id, 3000)
            applyProfile(data)
          } catch (err) {
            fetchProfileWithTimeout(currentUser.id, 8000)
              .then(applyProfile)
              .catch((bgErr) => {
                // Båda försöken misslyckades. Vi GISSAR INTE på en
                // prenumerationsstatus (kan felaktigt visa en betalande
                // kund som gratisanvändare) — istället visar UI:t ett
                // tydligt felläge med möjlighet att försöka igen.
                console.error('Fel vid profilhämtning:', bgErr)
                if (isMounted) setProfileError(true)
              })
          }
        } else {
          setProfile(null)
        }

        if (isMounted) setAuthLoading(false)
      }
    )

    return () => {
      isMounted = false
      hasTriggered = true
      clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [])

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
    } catch (err: any) {
      setAuthNotice({ type: 'error', text: translateAuthError(err.message) })
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Skickar ett återställningsmail. Länken i mailet loggar in användaren
  // med en tillfällig "recovery"-session — de landar då i appen redan
  // inloggade och kan sätta ett nytt lösenord via Profil → Byt lösenord.
  const resetPassword = useCallback(async (email: string) => {
    // 🔍 TILLFÄLLIG FELSÖKNING: Ta bort denna rad när vi vet vad som
    // faktiskt anropar resetPassword() och när. Om detta INTE loggas
    // direkt vid klick på "Glömt lösenord?" (utan först vid klick på
    // "Skicka återställningslänk"), så är funktionen oskyldig och felet
    // ligger någon annanstans.

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
    } catch (err: any) {
      setAuthNotice({ type: 'error', text: translateAuthError(err.message) })
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
    } catch (err: any) {
      return { success: false as const, error: translateAuthError(err.message) }
    }
  }, [])

  const dismissAuthNotice = useCallback(() => setAuthNotice(null), [])
  const exitPasswordRecoveryMode = useCallback(() => setPasswordRecoveryMode(false), [])

  const handleLogout = useCallback(async () => {
    try {
      localStorage.removeItem('taxRate')
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
    if (!user?.id) return
    setProfileError(false)
    try {
      const data = await fetchProfileWithTimeout(user.id, 5000)
      setProfile((prev: AuthProfile) =>
        JSON.stringify(prev) === JSON.stringify(data) ? prev : data
      )
    } catch (err) {
      console.error('Fel vid profilhämtning (manuellt försök):', err)
      setProfileError(true)
    }
  }, [user])

  const updateProfile = useCallback((updated: AuthProfile) => {
    setProfile(updated)
  }, [])

  return {
    user,
    profile,
    authLoading,
    profileError,
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