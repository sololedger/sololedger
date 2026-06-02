'use client'
import { useState } from 'react'

interface SubscribeButtonProps {
  user?: any
}

export default function SubscribeButton({ user }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleSubscribe() {
    setLoading(true)
    
    // 🔍 FELSÖKNING: Detta kommer synas i din webbläsarkonsol (F12) när du klickar
    console.log("Knappen försöker skicka följande user till API:", user)

    try {
      const res = await fetch('/api/checkout', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user?.id,
          userEmail: user?.email
        })
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