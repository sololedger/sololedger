'use client'
import React from 'react'
import SubscribeButton from './SubscribeButton'

interface GuardProps {
  user?: any
  profile: {
    subscription_type: string
    subscription_end: string | null
  } | null
  requiredLevel: 'paid' | 'admin'
  fallback?: React.ReactNode
  children: React.ReactNode
}

export default function SubscriptionGuard({ user, profile, requiredLevel, fallback, children }: GuardProps) {
  // Vänta tills vi vet om användaren är inloggad.
  // Viktigt: kolla BARA user här, inte profile — profile kan vara null
  // temporärt medan den laddas (async delay), och det ska inte blockera rendering.
  if (!user) {
    return null
  }

  // Om profile inte laddat klart ännu: behandla som free-användare.
  // Detta är korrekt UX — en betalande användare som ser paywall i 200ms
  // är bättre än en tom skärm. Profile laddas alltid in getSession-blocket
  // INNAN authLoading sätts till false, så i praktiken är profile alltid
  // satt när vi når den här komponenten. Fallbacken är ett extra säkerhetsnät.
  const userProfile = profile ?? { subscription_type: 'free', subscription_end: null }

  // Admin har alltid tillgång till allt
  if (userProfile.subscription_type === 'admin') {
    return <>{children}</>
  }

  // Om nivån kräver administratör men användaren saknar det
  if (requiredLevel === 'admin' && userProfile.subscription_type !== 'admin') {
    return (
      <div className="p-8 text-center bg-red-50 rounded-[2rem] border border-red-200">
        <p className="text-sm font-black text-red-700 uppercase">🔒 Endast för administratörer</p>
      </div>
    )
  }

  // Dubbelriktad tidskontroll (säkrar upp om webhooks laggar eller missas)
  const isActive =
    (userProfile.subscription_type === 'paid' || userProfile.subscription_type === 'trial') &&
    (!userProfile.subscription_end || new Date(userProfile.subscription_end).getTime() > Date.now())

  if (!isActive) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-200 text-center max-w-md mx-auto my-8 shadow-sm animate-in fade-in">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-2xl mb-4">💳</div>
        <h3 className="text-lg font-black uppercase tracking-tight text-gray-800">Funktionen kräver Premium</h3>
        <p className="text-xs text-gray-400 font-bold mt-1 mb-6 max-w-xs">
          Dina 14 dagars gratis testperiod har löpt ut. Aktivera SoloLedger Premium för att låsa upp obegränsad bokföring och deklarationsrapporter.
        </p>
        <SubscribeButton user={user} />
      </div>
    )
  }

  return <>{children}</>
}