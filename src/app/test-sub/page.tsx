// src/app/test-sub/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import SubscriptionGuard from '@/components/SubscriptionGuard'
import Momsrapport from '@/components/Momsrapport'

export default function TestSubPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('nolare@gmail.com')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  // Skapa en helt vanlig standardklient för webbläsaren (Anon Key)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 1. Kontrollera om det finns en äkta session när sidan laddas
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        // Om användaren finns, hämta profilen (kräver att din RLS-policy tillåter SELECT)
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

  // Hantera vanlig, hederlig inloggning
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setAuthError(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthError(error.message)
      setLoading(false)
      return
    }

    // Ladda om sidan på riktigt så att alla tillstånd och cookies uppdateras
    window.location.reload()
  }

  if (loading) {
    return <div className="p-8 text-center font-sans text-gray-600">Laddar testmiljö...</div>
  }

  // 🔒 Om ingen är inloggad på riktigt, visa ett helt vanligt inloggningsformulär
  if (!user) {
    return (
      <div className="p-8 max-w-md mx-auto font-sans">
        <h1 className="text-xl font-bold mb-2 text-center">Logga in på riktigt (Testmiljö)</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">Skriv in lösenordet du satte på ditt konto i Supabase Auth</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
            <input 
              type="password" 
              value={password} 
              placeholder="Skriv lösenordet här..."
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
          
          <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded font-medium hover:bg-blue-700 transition">
            Logga in på riktigt 🔑
          </button>
        </form>

        {authError && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded text-sm font-mono">
            Fel: {authError}
          </div>
        )}
      </div>
    )
  }

  // Om profilen inte hittades i tabellen (t.ex. pga RLS eller att raden saknas)
  if (!profile) {
    return (
      <div className="p-8 text-red-500 font-mono max-w-md mx-auto text-center">
        <p className="font-bold mb-2">Hittade din användare, men kunde inte läsa din profil!</p>
        <p className="text-sm text-gray-600">Detta beror oftast på din RLS-policy. Kontrollera att din policy tillåter SELECT för inloggade användare.</p>
      </div>
    )
  }

  // 2. Om du är inloggad på riktigt, skicka profilen till din Guard!
  return (
    <SubscriptionGuard profile={profile} requiredLevel="paid">
      <div className="p-8">
        <div className="bg-green-100 text-green-800 p-4 rounded mb-6 font-bold">
          🎉 Match! Du är inloggad på riktigt och har en aktiv prenumeration.
        </div>
        <Momsrapport />
      </div>
    </SubscriptionGuard>
  )
}