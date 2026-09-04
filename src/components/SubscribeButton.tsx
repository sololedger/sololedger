'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface SubscribeButtonProps {
  user?: any
}

export default function SubscribeButton({ user }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleSubscribe() {
    setLoading(true)

    try {
      // Skickar inte längre user.id/user.email i body - servern hämtar
      // och verifierar identiteten själv ur access-token.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Din session har gått ut. Ladda om sidan och försök igen.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
      })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Kunde inte initiera betalning: ' + data.error)
      }
    } catch (err) {
      console.error(err)
      alert('Ett oväntat fel uppstod.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-widest px-6 py-4 rounded-2xl transition-all shadow-md disabled:bg-gray-300 w-full"
    >
      {loading ? 'Laddar...' : 'Aktivera SoloLedger Premium 💳'}
    </button>
  )
}