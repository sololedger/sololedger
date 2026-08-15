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
    try {
      if (credentials.isRegistering) {
        const { error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
        })
        if (error) throw error
        alert('Konto skapat! Du loggas nu in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setAuthLoading(false)
    }
  }, [])

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
    handleAuth,
    handleLogout,
    setProfile: updateProfile,
  }
}