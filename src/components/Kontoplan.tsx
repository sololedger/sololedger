'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Kontoplan() {
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [newAccount, setNewAccount] = useState({
    id: '',
    name: '',
    debit_account: '',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: ''
  })
  const [saving, setSaving] = useState(false)

  // Lista med unika förslag på nya konton (utan dubbletter)
  const kontoforslag = [
    { id: 'lokalhyra', name: 'Lokalhyra', debit: '5010', credit: '1930', vat: 0, comment: 'Hyra för kontor, studio eller lager' },
    { id: 'el-lokal', name: 'El för lokal', debit: '5020', credit: '1930', vat: 25, comment: 'Separat elavtal för arbetsplatsen' },
    { id: 'reklam', name: 'Reklam & Annonsering', debit: '5900', credit: '1930', vat: 25, comment: 'Google Ads, Meta-annonser, trycksaker' },
    { id: 'hemsida', name: 'Hemsida & Verktyg', debit: '6230', credit: '1930', vat: 25, comment: 'Webbhotell, domäner och programvaror (SaaS)' },
    { id: 'frakt', name: 'Frakt & Porto', debit: '5710', credit: '1930', vat: 25, comment: 'PostNord, DHL och fraktkostnader' },
    { id: 'forsakring', name: 'Företagsförsäkring', debit: '6310', credit: '1930', vat: 0, comment: 'Ansvars- och sakförsäkring för firman' },
    { id: 'materialinkop', name: 'Inköp av material (Utrustning)', debit: '5410', credit: '1930', vat: 25, comment: 'Blixtar, objektiv, studiobakgrunder och tillbehör' },
    { id: 'milersattning', name: 'Milersättning (Egen bil)', debit: '5843', credit: '2018', vat: 0, comment: 'När du kör privat bil i tjänsten (25 kr/mil)' },
  ]

  useEffect(() => {
    loadKontoplan()
  }, [])

  // SÄKRAD HÄMTNING: Hämtar användaren och filtrerar baserat på user_id
  async function loadKontoplan() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id) // ✅ Säkrat med RLS-filter
        .order('name')

      if (error) {
        console.error(error)
        return
      }

      if (data) setKontoplan(data)
    } catch (err) {
      console.error('Kunde inte ladda kontoplan:', err)
    }
  }

  function applyForslag(forslag: any) {
    setNewAccount({
      id: forslag.id,
      name: forslag.name,
      debit_account: forslag.debit,
      credit_account: forslag.credit,
      default_vat_rate: forslag.vat,
      comment: forslag.comment
    })
  }

  async function handleAddAccount(e: any) {
    e.preventDefault()
    if (!newAccount.id || !newAccount.name || !newAccount.debit_account || !newAccount.credit_account) {
      alert('Fyll i ID, namn, debitkonto och kreditkonto.')
      return
    }
    setSaving(true)
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Hittade ingen inloggad användare.")

      const { error } = await supabase.from('accounts').insert([{
        id: newAccount.id.toLowerCase().trim(),
        name: newAccount.name.trim(),
        debit_account: newAccount.debit_account.trim(),
        credit_account: newAccount.credit_account.trim(),
        default_vat_rate: Number(newAccount.default_vat_rate),
        comment: newAccount.comment.trim(),
        user_id: user.id
      }])
      if (error) throw error
      setNewAccount({ id: '', name: '', debit_account: '', credit_account: '1930', default_vat_rate: 0, comment: '' })
      await loadKontoplan()
    } catch (err: any) {
      console.error(err)
      alert('Kunde inte spara konto: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // SÄKRAD RADERING: Kräver matchning på både id och user_id i koden
  async function handleDelete(id: string) {
    if (!confirm(`Radera kontot "${id}"? Det påverkar inte redan bokförda transaktioner.`)) return
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id) // ✅ Explicit säkerhet även vid radering

      if (error) {
        alert('Kunde inte radera: ' + error.message)
        return
      }
      
      await loadKontoplan()
    } catch (err: any) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-8">
      {/* Formulär för nytt konto */}
      <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
        <h2 className="text-sm font-black uppercase mb-2 text-emerald-600 tracking-widest">Lägg till konto</h2>
        
        {/* Sektion för snabba kontoförslag */}
        <div className="mb-6">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Förslag på vanliga konton (klicka för att fylla i):</p>
          <div className="flex flex-wrap gap-2">
            {kontoforslag.map(forslag => (
              <button
                key={forslag.id}
                type="button"
                onClick={() => applyForslag(forslag)}
                className="text-[11px] font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100/70 hover:bg-emerald-100 hover:text-emerald-800 transition-all shadow-sm"
              >
                + {forslag.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddAccount}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">ID (t.ex. resor)</label>
              <input
                type="text"
                value={newAccount.id}
                onChange={e => setNewAccount({ ...newAccount, id: e.target.value })}
                placeholder="resor"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Namn</label>
              <input
                type="text"
                value={newAccount.name}
                onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Resor"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Kommentar</label>
              <input
                type="text"
                value={newAccount.comment}
                onChange={e => setNewAccount({ ...newAccount, comment: e.target.value })}
                placeholder="T.ex. tåg, taxi, parkering"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Debitkonto</label>
              <input
                type="text"
                value={newAccount.debit_account}
                onChange={e => setNewAccount({ ...newAccount, debit_account: e.target.value })}
                placeholder="5800"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Kreditkonto</label>
              <input
                type="text"
                value={newAccount.credit_account}
                onChange={e => setNewAccount({ ...newAccount, credit_account: e.target.value })}
                placeholder="1930"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Standard moms %</label>
              <select
                value={newAccount.default_vat_rate}
                onChange={e => setNewAccount({ ...newAccount, default_vat_rate: Number(e.target.value) })}
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs cursor-pointer border border-transparent focus:border-emerald-300 transition-all"
              >
                <option value={0}>0%</option>
                <option value={6}>6%</option>
                <option value={12}>12%</option>
                <option value={25}>25%</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 text-white h-[58px] rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:bg-gray-300"
            >
              {saving ? '...' : 'Spara konto'}
            </button>
          </div>
        </form>
      </div>

      {/* Kontolista */}
      <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[9px] font-black text-gray-600 uppercase tracking-widest border-b">
            <tr>
              <th className="p-6">Namn</th>
              <th className="p-6">Debet</th>
              <th className="p-6">Kredit</th>
              <th className="p-6">Moms</th>
              <th className="p-6">Kommentar</th>
              <th className="p-6 text-right pr-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {kontoplan.map(acc => (
              <tr key={acc.id} className="hover:bg-gray-50/50 transition-all">
                <td className="p-6">
                  <p className="font-black text-gray-800">{acc.name}</p>
                  <p className="text-[9px] text-gray-300 font-mono mt-0.5">{acc.id}</p>
                </td>
                
                {/* 🎨 Uppdaterade och snygga Debet-badges */}
                <td className="p-6">
                  <span className="inline-flex items-center gap-1.5 font-mono font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl text-xs shadow-sm">
                    <span>{acc.debit_account}</span>
                    <span className="text-[9px] font-sans opacity-50 bg-emerald-200/50 px-1 rounded font-black">D</span>
                  </span>
                </td>
                
                {/* 🎨 Uppdaterade och snygga Kredit-badges */}
                <td className="p-6">
                  <span className="inline-flex items-center gap-1.5 font-mono font-black text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-xl text-xs shadow-sm">
                    <span>{acc.credit_account}</span>
                    <span className="text-[9px] font-sans opacity-60 bg-orange-200/40 px-1 rounded font-black">K</span>
                  </span>
                </td>
                
                <td className="p-6 font-bold text-gray-400 text-xs">
                  {acc.default_vat_rate > 0 ? `${acc.default_vat_rate}%` : '—'}
                </td>
                <td className="p-6 text-xs text-gray-400 italic">{acc.comment || '—'}</td>
                <td className="p-6 text-right pr-8">
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="text-red-100 hover:text-red-400 font-bold transition-colors text-sm"
                    title="Radera konto"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}