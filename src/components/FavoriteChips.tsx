'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface Favorite {
  id: string
  name: string
  type: string
  amount: number
  vat_rate: number
}

interface Props {
  userId: string
  onSelect: (fav: Favorite) => void
  refreshKey: number
}

export default function FavoriteChips({ userId, onSelect, refreshKey }: Props) {
  const [favorites, setFavorites] = useState<Favorite[]>([])

  useEffect(() => {
    loadFavorites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey])

  async function loadFavorites() {
    const { data } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setFavorites(data)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('favorites').delete().eq('id', id)
    setFavorites(prev => prev.filter(f => f.id !== id))
  }

  if (favorites.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap gap-2 items-center">
      <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">⭐ Favoriter:</span>
      {favorites.map(fav => (
        <div
          key={fav.id}
          onClick={() => onSelect(fav)}
          className="group flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 rounded-xl px-3 py-1.5 cursor-pointer transition-all"
        >
          <span className="text-[11px] font-black">{fav.name}</span>
          <span className="text-[10px] text-emerald-400 font-bold">{fav.amount.toLocaleString()} kr</span>
          <button
            onClick={(e) => handleDelete(fav.id, e)}
            className="text-emerald-200 hover:text-red-400 font-black text-xs transition-colors ml-1"
            title="Ta bort favorit"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}