'use client'
import { useState } from 'react'

export default function SubscribeButton() {
  const [loading, setLoading] = useState(false)

  async function handleSubscribe() {
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', { method: 'POST' })
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
      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-widest px-6 py-4 rounded-2xl transition-all shadow-md disabled:bg-gray-300"
    >
      {loading ? 'Laddar...' : 'Aktivera SoloLedger Premium 💳'}
    </button>
  )
}