'use client'

import { useState } from 'react'
import SubscribeButton from '@/components/SubscribeButton'

interface Profile {
  subscription_type: string
  subscription_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

interface Props {
  user: { id: string; email: string }
  profile: Profile | null
  stripeStatus: string | null
}

export default function DashboardClient({ user, profile, stripeStatus }: Props) {
  const [dismissedBanner, setDismissedBanner] = useState(false)

  const showSuccessBanner = stripeStatus === 'success' && !dismissedBanner
  const showCancelledBanner = stripeStatus === 'cancelled' && !dismissedBanner

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans">

      {/* 🎉 Stripe-feedback: Betalning Lyckades */}
      {showSuccessBanner && (
        <div className="mb-6 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎉</span>
            <div>
              <p className="text-sm font-bold text-emerald-800">Prenumeration aktiverad!</p>
              <p className="text-xs text-emerald-600">
                Du har nu full tillgång till SoloLedger Premium.
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissedBanner(true)}
            className="text-emerald-400 hover:text-emerald-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* ↩️ Stripe-feedback: Avbruten */}
      {showCancelledBanner && (
        <div className="mb-6 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">↩️</span>
            <div>
              <p className="text-sm font-bold text-amber-800">Köpet avbröts</p>
              <p className="text-xs text-amber-600">
                Inga kortuppgifter sparades. Du kan uppgradera när du vill.
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissedBanner(true)}
            className="text-amber-400 hover:text-amber-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Användarinfo & Status */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-1">
            Inloggad som
          </p>
          <p className="text-sm font-black text-gray-700">{user.email}</p>
          <p className="text-xs text-gray-500 mt-1">
            Nuvarande plan:{' '}
            <span className="font-bold uppercase text-blue-600">
              {profile?.subscription_type ?? 'free'}
            </span>
          </p>
        </div>

        {(profile?.subscription_type === 'free' || !profile) && (
          <SubscribeButton />
        )}
      </div>

      {/* Placeholder */}
      <div className="bg-gray-50 rounded-2xl p-8 border border-dashed border-gray-200 text-center text-gray-500">
        <p>Här kommer din app ligga sen ✅</p>
      </div>

    </div>
  )
}