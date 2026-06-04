// src/app/test-sub/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import SubscriptionGuard from '@/components/SubscriptionGuard'
import Momsrapport from '@/components/Momsrapport'

export default function TestSubPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('nolare@gmail.com')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  // 🔹 Kolla session vid load
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        setUser(user)

        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_type, stripe_customer_id, stripe_subscription_id, subscription_end')
          .eq('id', user.id)
          .maybeSingle()

        setProfile(profile)
      }

      setLoading(false)
    }

    checkAuth()
  }, [])

  // 🔹 Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setAuthError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthError(error.message)
      setLoading(false)
      return
    }

    // reload för säker state-sync
    window.location.reload()
  }

  // 🔹 Loading
  if (loading) {
    return <div className="p-8 text-center font-sans text-gray-600">Laddar testmiljö...</div>
  }

  // 🔹 Ej inloggad → visa login
  if (!user) {
    return (
      <div className="p-8 max-w-md mx-auto font-sans">
        <h1 className="text-xl font-bold mb-2 text-center">Logga in (Testmiljö)</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Använd ditt riktiga lösenord från Supabase
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />

          <input
            type="password"
            value={password}
            placeholder="Lösenord"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />

          <button className="w-full bg-blue-600 text-white p-2 rounded">
            Logga in
          </button>
        </form>

        {authError && (
          <div className="mt-4 p-2 bg-red-100 text-red-700 text-sm">
            {authError}
          </div>
        )}
      </div>
    )
  }

  // 🔹 Profile saknas
  if (!profile) {
    return (
      <div className="p-8 text-center text-red-500">
        Kunde inte läsa profil (RLS?)
      </div>
    )
  }

  // 🔹 Auth OK → protected content
  return (
    <SubscriptionGuard profile={profile} requiredLevel="paid">
      <div className="p-8">
        <div className="bg-green-100 text-green-800 p-4 rounded mb-6 font-bold">
          ✅ Inloggad + aktiv prenumeration
        </div>
        <Momsrapport />
      </div>
    </SubscriptionGuard>
  )
}