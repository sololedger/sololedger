'use client'
import { useState } from 'react'
import FavoriteChips, { Favorite } from './FavoriteChips'

export interface FormData {
  date: string
  description: string
  amount: string
  type: string
  vatRate: number
  file: File | null
}

interface TransactionFormProps {
  formData: FormData
  setFormData: (data: FormData) => void
  kontoplan: any[]
  isYearLocked: boolean
  editingId: string | null
  editingBooked: boolean
  uploading: boolean
  periodisera: boolean
  setPeriodisera: (val: boolean) => void
  periodMonth: string
  setPeriodMonth: (val: string) => void
  onSubmit: (e: any) => void
  onCancelEdit: () => void
  userId: string
  lastSubmitted: { type: string; amount: string; vatRate: number } | null
  onSaveFavorite: (name: string) => Promise<void>
  onDismissFavorite: () => void
}

export default function TransactionForm({
  formData,
  setFormData,
  kontoplan,
  isYearLocked,
  editingId,
  editingBooked,
  uploading,
  periodisera,
  setPeriodisera,
  periodMonth,
  setPeriodMonth,
  onSubmit,
  onCancelEdit,
  userId,
  lastSubmitted,
  onSaveFavorite,
  onDismissFavorite,
}: TransactionFormProps) {
  const [favName, setFavName] = useState('')
  const [showFavInput, setShowFavInput] = useState(false)
  const [descriptionHighlight, setDescriptionHighlight] = useState(false)
  const [favRefreshKey, setFavRefreshKey] = useState(0)

  function handleFavoriteSelect(fav: Favorite) {
    setFormData({
      ...formData,
      type: fav.type,
      amount: fav.amount.toString(),
      vatRate: fav.vat_rate,
      description: '',
    })
    setDescriptionHighlight(true)
    setTimeout(() => setDescriptionHighlight(false), 2000)
  }

  async function handleSaveFav() {
    if (!favName.trim()) return
    await onSaveFavorite(favName.trim())
    setFavName('')
    setShowFavInput(false)
    setFavRefreshKey(k => k + 1)
  }
  return (
    <div className={`bg-white rounded-[2.5rem] border p-4 sm:p-8 mb-6 shadow-sm transition-all ${editingId ? 'border-amber-300 shadow-amber-100' : 'border-gray-100'}`}>

      {/* Favorit-chips — visas bara när man inte redigerar */}
      {!editingId && (
        <FavoriteChips userId={userId} onSelect={handleFavoriteSelect} refreshKey={favRefreshKey} />
      )}

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-end mb-4">

          {/* Datum */}
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Datum</label>
            <input
              type="date"
              value={formData.date}
              disabled={isYearLocked}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
              className={`p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
              required
            />
          </div>

          {/* Kategori */}
          <div className="lg:col-span-3 flex flex-col gap-1">
            <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Kategori</label>
            <select
  value={formData.type}
  onChange={e => {
    const acc = kontoplan.find(k => k.id === e.target.value)
    setFormData({ ...formData, type: e.target.value, vatRate: Number(acc?.default_vat_rate) || 0 })
  }}
  disabled={editingBooked || isYearLocked}
  className={`p-3 rounded-xl outline-none font-bold text-xs ${editingBooked || isYearLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 cursor-pointer'} ${isYearLocked ? 'opacity-40' : ''}`}
>
  {(() => {
    const income = kontoplan.filter(k => k.credit_account?.startsWith('3'))
    const special = kontoplan.filter(k => 
      k.id === 'ingående_balans' || 
      k.id === 'skattekonto_default' || 
      k.id === 'egen_insättning' ||
      k.id === 'eget_uttag' ||
      k.id === 'periodisering'
    )
    const costs = kontoplan.filter(k => 
      !income.includes(k) && !special.includes(k)
    )
    return (
      <>
        <optgroup label="── Intäkter ──">
          {income.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </optgroup>
        <optgroup label="── Kostnader ──">
          {costs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </optgroup>
        <optgroup label="── Övrigt ──">
          {special.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </optgroup>
      </>
    )
  })()}
</select>
          </div>

          <div className="col-span-2 lg:col-span-3 flex flex-col gap-1">
            <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Beskrivning</label>
            <input
              type="text"
              value={formData.description}
              disabled={isYearLocked}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className={`p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs transition-all ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''} ${descriptionHighlight ? 'ring-2 ring-amber-400 bg-amber-50 animate-pulse' : ''}`}
              placeholder={descriptionHighlight ? '← Fyll i beskrivning!' : ''}
              required
            />
          </div>

          {/* Moms % */}
          <div className="lg:col-span-1 flex flex-col gap-1">
            <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Moms %</label>
            <select
              value={formData.vatRate}
              onChange={e => setFormData({ ...formData, vatRate: Number(e.target.value) })}
              disabled={editingBooked || isYearLocked}
              className={`p-3 rounded-xl outline-none font-bold text-xs ${editingBooked || isYearLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 cursor-pointer'} ${isYearLocked ? 'opacity-40' : ''}`}
            >
              <option value={25}>25%</option>
              <option value={12}>12%</option>
              <option value={6}>6%</option>
              <option value={0}>0%</option>
            </select>
          </div>

          {/* Belopp */}
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Belopp inkl. moms</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              disabled={editingBooked || isYearLocked}
              className={`p-3 rounded-xl outline-none font-black text-sm ${editingBooked || isYearLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50'} ${isYearLocked ? 'opacity-40' : ''}`}
              required
            />
          </div>

          {/* Submit / Cancel */}
          <div className="col-span-2 lg:col-span-1 flex flex-col gap-1">
            {editingId && (
              <label className="text-[9px] font-black text-amber-400 uppercase ml-1">Redigerar</label>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || isYearLocked}
                className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${uploading ? 'bg-gray-400' : isYearLocked ? 'bg-gray-300 opacity-40 cursor-not-allowed' : editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {uploading ? '...' : editingId ? 'Spara' : 'OK'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="h-[42px] px-3 rounded-xl text-gray-400 hover:text-gray-600 font-bold text-sm transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bilaga */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-3 border-t border-gray-50">
          <label className="text-[9px] font-black text-gray-500 uppercase whitespace-nowrap">📎 Bilaga:</label>
          <input
            type="file"
            accept="image/*,.pdf"
            disabled={isYearLocked}
            onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
            className="text-xs text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[9px] file:font-black file:uppercase file:bg-gray-100 file:text-gray-500 hover:file:bg-gray-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {formData.file && (
            <span className="text-[9px] text-emerald-500 font-bold truncate max-w-[160px] sm:max-w-none">{formData.file.name}</span>
          )}
        </div>

        {/* Periodisering — visas bara när man inte redigerar */}
        {!editingId && (
          <div className={`mt-4 rounded-2xl border-2 transition-all duration-200 ${periodisera ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50/40'} ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
            <label className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={periodisera}
                  disabled={isYearLocked}
                  onChange={e => setPeriodisera(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-500 rounded-full transition-colors duration-200" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-gray-600 tracking-wide">
                  Periodisera till nästa räkenskapsår
                </span>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                  Kostnaden avser ett annat år — parkeras på konto 1790 och aktiveras automatiskt.
                </p>
              </div>
            </label>

            {periodisera && !isYearLocked && (
              <div className="px-5 pb-4 flex flex-wrap items-end gap-6 border-t border-blue-100">
                <div className="flex flex-col gap-1 mt-3">
                  <label className="text-[9px] font-black text-blue-500 uppercase ml-1">
                    Kostnaden avser (år/månad)
                  </label>
                  <input
                    type="month"
                    value={periodMonth}
                    onChange={e => setPeriodMonth(e.target.value)}
                    className="p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs text-blue-700 focus:border-blue-400 transition-colors"
                  />
                </div>
                <div className="mt-3 text-[9px] leading-relaxed text-blue-600 font-bold bg-blue-100/60 rounded-xl px-4 py-2.5 border border-blue-200">
                  <p className="font-black uppercase mb-1 text-blue-700">Vad händer?</p>
                  <p>📅 <strong>År 1 (idag):</strong> Bank krediteras. Moms bokas direkt. Netto → konto 1790.</p>
                  <p>🔄 <strong>År 2 ({periodMonth}-01):</strong> 1790 krediteras → kostnadskonto debiteras.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </form>

      {/* ⭐ Favorit-banner — dyker upp efter att en transaktion bokförts */}
      {lastSubmitted && !editingId && (
        <div className="mt-4 flex flex-wrap items-center gap-y-2 gap-x-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 animate-in fade-in duration-300">
          <span className="text-base">⭐</span>
          <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wide flex-1 min-w-[110px]">
            Spara som favorit?
          </p>
          {showFavInput ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={favName}
                onChange={e => setFavName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveFav()}
                placeholder="Namn på favorit..."
                autoFocus
                className="text-xs font-bold bg-white border border-emerald-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-400 transition-colors flex-1 min-w-0 sm:flex-none"
              />
              <button
                onClick={handleSaveFav}
                className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Spara
              </button>
              <button
                onClick={() => { setShowFavInput(false); setFavName('') }}
                className="text-gray-300 hover:text-gray-500 font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFavInput(true)}
                className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Ja, spara ⭐
              </button>
              <button
                onClick={onDismissFavorite}
                className="text-[10px] font-bold text-gray-300 hover:text-gray-400 transition-colors"
              >
                Nej tack
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}