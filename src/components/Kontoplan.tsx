'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface KontoplanProps {
  onAccountCreated?: () => Promise<void> | void
}

interface AccountForm {
  id: string
  name: string
  debit_account: string
  credit_account: string
  default_vat_rate: number
  comment: string
}

interface AccountRow extends AccountForm {
  user_id?: string
}

const EMPTY_ACCOUNT: AccountForm = {
  id: '',
  name: '',
  debit_account: '',
  credit_account: '1930',
  default_vat_rate: 0,
  comment: '',
}

// Liten, kuraterad BAS-hjälp för de konton SoloLedger använder oftast.
// Detta är medvetet INTE en full BAS-kontoplan.
const BAS_HELP: Record<string, string> = {
  '1790': 'Övriga förutbetalda kostnader och upplupna intäkter',
  '1930': 'Företagskonto / checkkonto / affärskonto',
  '2010': 'Eget kapital',
  '2011': 'Egna varuuttag',
  '2012': 'Avräkning för skatter och avgifter',
  '2013': 'Övriga egna uttag',
  '2014': 'Uttag förmåner',
  '2017': 'Egna insättningar / årets kapitaltillskott',
  '2018': 'Övriga egna insättningar',
  '2019': 'Årets resultat',
  '2611': 'Utgående moms 25 %',
  '2621': 'Utgående moms 12 %',
  '2631': 'Utgående moms 6 %',
  '2641': 'Debiterad ingående moms',
  '2650': 'Redovisningskonto för moms',
  '3010': 'Försäljning',
  '5010': 'Lokalhyra',
  '5410': 'Förbrukningsinventarier',
  '5420': 'Programvaror',
  '5710': 'Frakter och transporter',
  '5800': 'Resekostnader',
  '5900': 'Reklam och PR',
  '6230': 'Datakommunikation',
  '6310': 'Företagsförsäkringar',
  '6570': 'Bankkostnader',
  '6992': 'Övriga externa kostnader, ej avdragsgilla',
  '7830': 'Avskrivningar på maskiner och inventarier',
}

function basHelp(accountNumber: string) {
  const nr = accountNumber.trim()
  return BAS_HELP[nr] ?? null
}

function isPersonnelAccount(accountNumber: string) {
  const nr = Number(accountNumber.trim())
  return Number.isInteger(nr) && nr >= 7000 && nr <= 7699
}

function personnelAccountWarning(accountNumber: string) {
  if (!isPersonnelAccount(accountNumber)) return null

  return 'Personalkonto – konton 70xx–76xx används normalt för löner och andra personalkostnader. SoloLedger är avsett för enskild firma utan anställda. Kontrollera att detta verkligen är rätt konto.'
}

export default function Kontoplan({ onAccountCreated }: KontoplanProps) {
  const [kontoplan, setKontoplan] = useState<AccountRow[]>([])
  const [newAccount, setNewAccount] = useState<AccountForm>(EMPTY_ACCOUNT)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const kontoforslag = [
    { id: 'lokalhyra', name: 'Lokalhyra', debit: '5010', credit: '1930', vat: 0, comment: 'Hyra för kontor, studio eller lager' },
    { id: 'el-lokal', name: 'El för lokal', debit: '5020', credit: '1930', vat: 25, comment: 'Separat elavtal för arbetsplatsen' },
    { id: 'reklam', name: 'Reklam & Annonsering', debit: '5900', credit: '1930', vat: 25, comment: 'Google Ads, Meta-annonser, trycksaker' },
    { id: 'hemsida', name: 'Hemsida & Verktyg', debit: '6230', credit: '1930', vat: 25, comment: 'Webbhotell, domäner och programvaror (SaaS)' },
    { id: 'frakt', name: 'Frakt & Porto', debit: '5710', credit: '1930', vat: 25, comment: 'PostNord, DHL och fraktkostnader' },
    { id: 'forsakring', name: 'Företagsförsäkring', debit: '6310', credit: '1930', vat: 0, comment: 'Ansvars- och sakförsäkring för firman' },
    { id: 'materialinkop', name: 'Inköp av material (Utrustning)', debit: '5410', credit: '1930', vat: 25, comment: 'Blixtar, objektiv, studiobakgrunder och tillbehör' },
    { id: 'milersattning', name: 'Milersättning (Egen bil)', debit: '5843', credit: '2018', vat: 0, comment: 'När du kör privat bil i tjänsten' },
  ]

  const befintligaIds = new Set(kontoplan.map(acc => acc.id))
  const tillgangligaForslag = kontoforslag.filter(forslag => !befintligaIds.has(forslag.id))

  useEffect(() => {
    loadKontoplan()
  }, [])

  async function loadKontoplan() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
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
    setEditingId(null)
    setNewAccount({
      id: forslag.id,
      name: forslag.name,
      debit_account: forslag.debit,
      credit_account: forslag.credit,
      default_vat_rate: forslag.vat,
      comment: forslag.comment,
    })
  }

  function startEdit(acc: AccountRow) {
    setEditingId(acc.id)
    setNewAccount({
      id: acc.id,
      name: acc.name,
      debit_account: acc.debit_account,
      credit_account: acc.credit_account,
      default_vat_rate: Number(acc.default_vat_rate ?? 0),
      comment: acc.comment ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setNewAccount(EMPTY_ACCOUNT)
  }

  function validateAccountNumber(value: string, label: string) {
    if (!/^\d{4}$/.test(value.trim())) {
      throw new Error(`${label} måste bestå av exakt fyra siffror, t.ex. 1930.`)
    }
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault()

    if (!newAccount.id || !newAccount.name || !newAccount.debit_account || !newAccount.credit_account) {
      alert('Fyll i ID, namn, debitkonto och kreditkonto.')
      return
    }

    setSaving(true)

    try {
      validateAccountNumber(newAccount.debit_account, 'Debitkonto')
      validateAccountNumber(newAccount.credit_account, 'Kreditkonto')

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Hittade ingen inloggad användare.')

      const payload = {
        name: newAccount.name.trim(),
        debit_account: newAccount.debit_account.trim(),
        credit_account: newAccount.credit_account.trim(),
        default_vat_rate: Number(newAccount.default_vat_rate),
        comment: newAccount.comment.trim(),
      }

      if (editingId) {
        const { error } = await supabase
          .from('accounts')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('accounts').insert([{
          id: newAccount.id.toLowerCase().trim(),
          ...payload,
          user_id: user.id,
        }])

        if (error) throw error
      }

      cancelEdit()
      await loadKontoplan()

      if (onAccountCreated) {
        await onAccountCreated()
      }
    } catch (err: any) {
      console.error(err)
      alert(`Kunde inte ${editingId ? 'uppdatera' : 'spara'} konto: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Radera kontot "${id}"? Det påverkar inte redan bokförda transaktioner.`)) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        alert('Kunde inte radera: ' + error.message)
        return
      }

      if (editingId === id) cancelEdit()

      await loadKontoplan()

      if (onAccountCreated) {
        await onAccountCreated()
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const debitHelp = basHelp(newAccount.debit_account)
  const creditHelp = basHelp(newAccount.credit_account)
  const debitPersonnelWarning = personnelAccountWarning(newAccount.debit_account)
  const creditPersonnelWarning = personnelAccountWarning(newAccount.credit_account)

  return (
    <div className="space-y-8">
      <div className="bg-white p-4 sm:p-8 rounded-[2.5rem] border shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-black uppercase text-emerald-600 tracking-widest">
              {editingId ? 'Redigera konto' : 'Lägg till konto'}
            </h2>
            <p className="text-[10px] text-gray-400 font-medium mt-1 max-w-2xl">
              SoloLedger använder en förenklad kontoplan för enskild firma utan personal.
              Du kan komplettera den med egna bokföringskategorier vid behov.
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 text-[10px] font-black uppercase tracking-wider transition-colors"
            >
              Avbryt redigering
            </button>
          )}
        </div>

        {!editingId && (
          <div className="mb-6">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Förslag på vanliga konton
            </p>

            {tillgangligaForslag.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tillgangligaForslag.map(forslag => (
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
            ) : (
              <p className="text-[10px] text-gray-400 italic">
                Alla snabbförslag finns redan i din kontoplan.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSaveAccount}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">
                ID {editingId ? '(kan inte ändras)' : '(t.ex. resor)'}
              </label>
              <input
                type="text"
                value={newAccount.id}
                onChange={e => setNewAccount({ ...newAccount, id: e.target.value })}
                placeholder="resor"
                disabled={Boolean(editingId)}
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Debitkonto</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={newAccount.debit_account}
                onChange={e => setNewAccount({ ...newAccount, debit_account: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="5800"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
                required
              />
              {debitHelp && (
                <p className="text-[9px] text-emerald-600 font-bold ml-1">BAS: {debitHelp}</p>
              )}
              {debitPersonnelWarning && (
                <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-amber-700 mb-0.5">
                    ⚠ Personalkonto
                  </p>
                  <p className="text-[9px] leading-relaxed text-amber-700">
                    {debitPersonnelWarning}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-gray-500 ml-1">Kreditkonto</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={newAccount.credit_account}
                onChange={e => setNewAccount({ ...newAccount, credit_account: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="1930"
                className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-xs border border-transparent focus:border-emerald-300 placeholder:text-gray-300/70 transition-all"
                required
              />
              {creditHelp && (
                <p className="text-[9px] text-orange-600 font-bold ml-1">BAS: {creditHelp}</p>
              )}
              {creditPersonnelWarning && (
                <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-amber-700 mb-0.5">
                    ⚠ Personalkonto
                  </p>
                  <p className="text-[9px] leading-relaxed text-amber-700">
                    {creditPersonnelWarning}
                  </p>
                </div>
              )}
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
              {saving ? '...' : editingId ? 'Spara ändringar' : 'Spara konto'}
            </button>
          </div>
        </form>
      </div>

      <div className="hidden md:block bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[9px] font-black text-gray-600 uppercase tracking-widest border-b">
            <tr>
              <th className="p-6">Namn</th>
              <th className="p-6">Debet</th>
              <th className="p-6">Kredit</th>
              <th className="p-6">Moms</th>
              <th className="p-6">Kommentar</th>
              <th className="p-6 text-right pr-8">Åtgärd</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {kontoplan.map(acc => (
              <tr key={acc.id} className="hover:bg-gray-50/50 transition-all">
                <td className="p-6">
                  <p className="font-black text-gray-800">{acc.name}</p>
                  <p className="text-[9px] text-gray-300 font-mono mt-0.5">{acc.id}</p>
                  {(isPersonnelAccount(acc.debit_account) || isPersonnelAccount(acc.credit_account)) && (
                    <span
                      className="inline-flex mt-1.5 text-[8px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1"
                      title="Konton 70xx–76xx används normalt för personalkostnader. SoloLedger är avsett för enskild firma utan anställda."
                    >
                      ⚠ Personalkonto
                    </span>
                  )}
                </td>

                <td className="p-6">
                  <span className="inline-flex items-center gap-1.5 font-mono font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl text-xs shadow-sm">
                    <span>{acc.debit_account}</span>
                    <span className="text-[9px] font-sans opacity-50 bg-emerald-200/50 px-1 rounded font-black">D</span>
                  </span>
                  {basHelp(acc.debit_account) && (
                    <p className="mt-1 text-[8px] text-gray-400 max-w-[180px]">{basHelp(acc.debit_account)}</p>
                  )}
                </td>

                <td className="p-6">
                  <span className="inline-flex items-center gap-1.5 font-mono font-black text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-xl text-xs shadow-sm">
                    <span>{acc.credit_account}</span>
                    <span className="text-[9px] font-sans opacity-60 bg-orange-200/40 px-1 rounded font-black">K</span>
                  </span>
                  {basHelp(acc.credit_account) && (
                    <p className="mt-1 text-[8px] text-gray-400 max-w-[180px]">{basHelp(acc.credit_account)}</p>
                  )}
                </td>

                <td className="p-6 font-bold text-gray-400 text-xs">
                  {acc.default_vat_rate > 0 ? `${acc.default_vat_rate}%` : '—'}
                </td>

                <td className="p-6 text-xs text-gray-400 italic">{acc.comment || '—'}</td>

                <td className="p-6 text-right pr-8">
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={() => startEdit(acc)}
                      className="text-gray-300 hover:text-emerald-600 font-bold transition-colors text-sm"
                      title="Redigera konto"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(acc.id)}
                      className="text-red-100 hover:text-red-400 font-bold transition-colors text-sm"
                      title="Radera konto"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-3">
        {kontoplan.length === 0 ? (
          <div className="bg-white rounded-[1.75rem] border p-8 text-center text-gray-300 italic font-medium shadow-sm">
            Inga konton tillagda ännu
          </div>
        ) : (
          kontoplan.map(acc => (
            <div key={acc.id} className="bg-white rounded-[1.75rem] border p-5 shadow-sm">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div>
                  <p className="font-black text-gray-800">{acc.name}</p>
                  <p className="text-[9px] text-gray-300 font-mono mt-0.5">{acc.id}</p>
                  {(isPersonnelAccount(acc.debit_account) || isPersonnelAccount(acc.credit_account)) && (
                    <span
                      className="inline-flex mt-1.5 text-[8px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1"
                      title="Konton 70xx–76xx används normalt för personalkostnader. SoloLedger är avsett för enskild firma utan anställda."
                    >
                      ⚠ Personalkonto
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(acc)}
                    className="shrink-0 text-gray-300 hover:text-emerald-600 font-bold transition-colors text-sm w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50"
                    title="Redigera konto"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="shrink-0 text-red-300 hover:text-red-500 font-bold transition-colors text-sm w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50"
                    title="Radera konto"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 font-mono font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl text-xs shadow-sm">
                  <span>{acc.debit_account}</span>
                  <span className="text-[9px] font-sans opacity-50 bg-emerald-200/50 px-1 rounded font-black">D</span>
                </span>

                <span className="inline-flex items-center gap-1.5 font-mono font-black text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-xl text-xs shadow-sm">
                  <span>{acc.credit_account}</span>
                  <span className="text-[9px] font-sans opacity-60 bg-orange-200/40 px-1 rounded font-black">K</span>
                </span>

                {acc.default_vat_rate > 0 && (
                  <span className="text-[10px] font-black uppercase bg-gray-100 text-gray-500 px-2 py-1 rounded-lg border border-gray-200">
                    Moms {acc.default_vat_rate}%
                  </span>
                )}
              </div>

              {(basHelp(acc.debit_account) || basHelp(acc.credit_account)) && (
                <div className="text-[9px] text-gray-400 mb-2 space-y-0.5">
                  {basHelp(acc.debit_account) && <p>D {acc.debit_account}: {basHelp(acc.debit_account)}</p>}
                  {basHelp(acc.credit_account) && <p>K {acc.credit_account}: {basHelp(acc.credit_account)}</p>}
                </div>
              )}

              {acc.comment && (
                <p className="text-xs text-gray-400 italic">{acc.comment}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
