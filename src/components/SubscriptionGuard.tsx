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
  if (!user) {
    return null
  }

  const userProfile = profile ?? { subscription_type: 'free', subscription_end: null }

  if (userProfile.subscription_type === 'admin') {
    return <>{children}</>
  }

  if (requiredLevel === 'admin' && userProfile.subscription_type !== 'admin') {
    return (
      <div className="p-6 sm:p-8 text-center bg-red-50 rounded-[2rem] border border-red-200">
        <p className="text-sm font-black text-red-700 uppercase">🔒 Endast för administratörer</p>
      </div>
    )
  }

  const isActive =
    (userProfile.subscription_type === 'paid' || userProfile.subscription_type === 'trial') &&
    (!userProfile.subscription_end || new Date(userProfile.subscription_end).getTime() > Date.now())

  if (!isActive) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-12 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-200 text-center max-w-md mx-auto my-8 shadow-sm animate-in fade-in">
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
