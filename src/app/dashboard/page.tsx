// src/app/dashboard/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useSearchParams } from 'next/navigation'
import DashboardClient from './DashboardClient'

// En inre komponent som säkert kan läsa URL-parametrar (status=success)
function DashboardContent() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const params = useSearchParams()
  const status = params.get('status')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function load() {
      // Skarpt och säkert anrop via getUser() på klientsidan
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

// Huvudkomponenten som Next.js letar efter. 
// Den omsluter allt i Suspense vilket lagar buggen direkt!
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Laddar...</div>}>
      <DashboardContent />
    </Suspense>
  )
}