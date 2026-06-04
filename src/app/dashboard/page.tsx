// src/app/dashboard/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabaseClient'  // ← ÄNDRAD
import { useSearchParams } from 'next/navigation'
import DashboardClient from './DashboardClient'

function DashboardContent() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const params = useSearchParams()
  const status = params.get('status')

  // ← BORTTAGEN: const supabase = createBrowserClient(...)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      setUser(user)

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      setProfile(data)
      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Laddar din dashboard...</div>
  if (!user) return <div className="p-8 text-center text-red-500 font-bold">Du är inte inloggad. Logga in för att se denna sida.</div>

  return (
    <DashboardClient
      user={{ id: user.id, email: user.email ?? '' }}
      profile={profile}
      stripeStatus={status}
    />
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Laddar...</div>}>
      <DashboardContent />
    </Suspense>
  )
}