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

  useEffect(() => {
    loadKontoplan()
  }, [])

  async function loadKontoplan() {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('name')
    if (error) { console.error(error); return }
    if (data) setKontoplan(data)
  }

  async function handleAddAccount(e: any) {
    e.preventDefault()
    if (!newAccount.id || !newAccount.name || !newAccount.debit_account || !newAccount.credit_account) {
      alert('Fyll i ID, namn, debitkonto och kreditkonto.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('accounts').insert([{
        id: newAccount.id.toLowerCase().trim(),
        name: newAccount.name.trim(),
        debit_account: newAccount.debit_account.trim(),
        credit_account: newAccount.credit_account.trim(),
        default_vat_rate: Number(newAccount.default_vat_rate),
        comment: newAccount.comment.trim()
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

  async function handleDelete(id: string) {
    if (!confirm(`Radera kontot "${id}"? Det påverkar inte redan bokförda transaktioner.`)) return
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) { alert('Kunde inte radera: ' + error.message); return }
    await loadKontoplan()
  }

  return (
    <div className="space-y-8">
      {/* Formulär för nytt konto */}
      <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
        <h2 className="text-sm font-black uppercase mb-6 text-blue-600 tracking-widest">Lägg till konto</h2>
        <form onSubmit={handleAddAccount}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-300 ml-1">ID (t.ex. resor)</label>
              <input
                type="text"
                value={newAccount.id}
                onChange={e => setNewAccount({ ...newAccount, id: e.target.value })}
                placeholder="resor"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-300 ml-1">Namn</label>
              <input
                type="text"
                value={newAccount.name}
                onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Resor"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-300 ml-1">Kommentar</label>
              <input
                type="text"
                value={newAccount.comment}
                onChange={e => setNewAccount({ ...newAccount, comment: e.target.value })}
                placeholder="T.ex. tåg, taxi, parkering"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-300 ml-1">Debitkonto</label>
              <input
                type="text"
                value={newAccount.debit_account}
                onChange={e => setNewAccount({ ...newAccount, debit_account: e.target.value })}
                placeholder="5800"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-300 ml-1">Kreditkonto</label>
              <input
                type="text"
                value={newAccount.credit_account}
                onChange={e => setNewAccount({ ...newAccount, credit_account: e.target.value })}
                placeholder="1930"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-300 ml-1">Standard moms %</label>
              <select
                value={newAccount.default_vat_rate}
                onChange={e => setNewAccount({ ...newAccount, default_vat_rate: Number(e.target.value) })}
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs cursor-pointer"
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
              className="bg-blue-600 text-white h-[58px] rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:bg-gray-300"
            >
              {saving ? '...' : 'Spara konto'}
            </button>
          </div>
        </form>
      </div>

      {/* Kontolista */}
      <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b">
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
                <td className="p-6">
                  <span className="font-mono font-black text-blue-500 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg text-xs">
                    {acc.debit_account} D
                  </span>
                </td>
                <td className="p-6">
                  <span className="font-mono font-black text-orange-400 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg text-xs">
                    {acc.credit_account} K
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
