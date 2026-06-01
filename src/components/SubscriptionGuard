'use client'
import React from 'react'
import SubscribeButton from './SubscribeButton'

interface GuardProps {
  profile: {
    subscription_type: string
    subscription_end: string | null
  } | null
  requiredLevel: 'paid' | 'admin'
  fallback?: React.ReactNode
  children: React.ReactNode
}

export default function SubscriptionGuard({ profile, requiredLevel, fallback, children }: GuardProps) {
  // 1. Admin har alltid tillgång till allt
  if (profile?.subscription_type === 'admin') {
    return <>{children}</>
  }

  // 2. Om nivån kräver administratör men användaren saknar det
  if (requiredLevel === 'admin' && profile?.subscription_type !== 'admin') {
    return (
      <div className="p-8 text-center bg-red-50 rounded-[2rem] border border-red-200">
        <p className="text-sm font-black text-red-700 uppercase">🔒 Endast för administratörer</p>
      </div>
    )
  }

  // 3. Dubbelriktad tidskontroll (Säkrar upp om webhooks laggar eller missas)
  const isActive = 
    (profile?.subscription_type === 'paid' || profile?.subscription_type === 'trial') &&
    (!profile?.subscription_end || new Date(profile.subscription_end).getTime() > Date.now())

  // 4. Om prenumerationen inte är aktiv (eller har löpt ut) -> Visa betalvägg
  if (!isActive) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-200 text-center max-w-md mx-auto my-8 shadow-sm animate-in fade-in">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-2xl mb-4">💳</div>
        <h3 className="text-lg font-black uppercase tracking-tight text-gray-800">Funktionen kräver Premium</h3>
        <p className="text-xs text-gray-400 font-bold mt-1 mb-6 max-w-xs">
          Dina 14 dagars gratis testperiod har löpt ut. Aktivera SoloLedger Premium för att låsa upp obegränsad bokföring och deklarationsrapporter.
        </p>
        <SubscribeButton />
      </div>
    )
  }

  return <>{children}</>
}