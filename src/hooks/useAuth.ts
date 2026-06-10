'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type AuthProfile = {
  subscription_type: string
  subscription_end: string | null
  company_name: string | null
  org_nr: string | null
} | null

export type AuthCredentials = {
  email: string
  password: string
  isRegistering: boolean
}

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<AuthProfile>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let hasTriggered = false

    const fallbackTimer = setTimeout(() => {
      if (isMounted && !hasTriggered) {
        console.log('AUTH FALLBACK: Supabase var tyst, tvingar authLoading till false')
        setAuthLoading(false)
      }
    }, 2000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return
        hasTriggered = true
        clearTimeout(fallbackTimer)

        console.log('AUTH EVENT:', _event, !!session?.user)

        const currentUser = session?.user ?? null
        setUser((prev: any) => prev?.id === currentUser?.id ? prev : currentUser)

        if (currentUser) {
          try {
            const { data } = await Promise.race([
              supabase
                .from('profiles')
                .select('subscription_type, subscription_end, company_name, org_nr')
                .eq('id', currentUser.id)
                .maybeSingle(),
              new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 3000)
              )
            ]) as any

            if (isMounted) {
              setProfile((prev: AuthProfile) =>
                JSON.stringify(prev) === JSON.stringify(data) ? prev : data
              )
            }
          } catch (err) {
            console.error('Fel vid profilhämtning:', err)
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

  const updateProfile = useCallback((updated: AuthProfile) => {
    setProfile(updated)
  }, [])

  return {
    user,
    profile,
    authLoading,
    handleAuth,
    handleLogout,
    setProfile: updateProfile,
  }
}
