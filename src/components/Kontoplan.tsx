'use client'

import { useState, useEffect, useRef } from 'react'
import { filterKontoplan, groupKontoplan, findKontoplanAccountMatches, type KontoplanVisibility } from '@/lib/kontoplanPresentation'
import CategoryVisibilityControl from './CategoryVisibilityControl'
import { supabase } from '@/lib/supabaseClient'
import {
  getBasAccountHelp,
  getBookingCategory,
  getQuickAccountPresetsV1,
} from '@/lib/accountingKnowledge'

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
  hidden_from_new_booking?: boolean
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
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<KontoplanVisibility>('all')
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(true)
  const selectedForm = useRef<HTMLFormElement>(null)
  const suggestionsSummary = useRef<HTMLElement>(null)
  const [formOpen, setFormOpen] = useState(false)
  const formHeading = useRef<HTMLHeadingElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const [saving, setSaving] = useState(false)
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  const kontoforslag = getQuickAccountPresetsV1()
  const befintligaIds = new Set(kontoplan.map(acc => acc.id))
  const tillgangligaForslag = kontoforslag.filter(
    forslag => !befintligaIds.has(forslag.id)
  )

  const selectedCategory = getBookingCategory(newAccount.id)
  const guidance = selectedCategory?.categoryGuidance ?? null
  const selectedQuickSuggestion = !showManualForm && !editingId
    ? kontoforslag.find(suggestion => suggestion.id === newAccount.id) : undefined
  const matchingCategories = selectedQuickSuggestion
    ? findKontoplanAccountMatches(kontoplan, newAccount.debit_account, newAccount.credit_account, newAccount.id) : []

  useEffect(() => {
    loadKontoplan()
  }, [])

  async function loadKontoplan() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

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

  function applyForslag(forslag: {
    id: string
    name: string
    debit_account: string
    credit_account: string
    default_vat_rate: number
    comment: string
  }, button: HTMLButtonElement) {
    const keepSuggestionsOpen = window.matchMedia('(min-width: 48rem)').matches
    setSuggestionsOpen(keepSuggestionsOpen)
    requestAnimationFrame(() => {
      if (keepSuggestionsOpen) button.scrollIntoView({ block: 'nearest' })
      else selectedForm.current?.focus()
    })
    setEditingId(null)
    setShowManualForm(false)
    setShowAdvancedSettings(false)
    setNewAccount({
      id: forslag.id,
      name: forslag.name,
      debit_account: forslag.debit_account,
      credit_account: forslag.credit_account,
      default_vat_rate: forslag.default_vat_rate,
      comment: forslag.comment,
    })
  }

  function startEdit(acc: AccountRow) {
    setFormOpen(true)
    setEditingId(acc.id)
    setShowManualForm(true)
    setShowAdvancedSettings(false)
    setNewAccount({
      id: acc.id,
      name: acc.name,
      debit_account: acc.debit_account,
      credit_account: acc.credit_account,
      default_vat_rate: Number(acc.default_vat_rate ?? 0),
      comment: acc.comment ?? '',
    })

    requestAnimationFrame(() => formHeading.current?.focus())
  }

  function cancelEdit() {
    setFormOpen(false)
    addButton.current?.focus()
    setEditingId(null)
    setShowManualForm(false)
    setShowAdvancedSettings(false)
    setNewAccount(EMPTY_ACCOUNT)
  }

  function validateAccountNumber(value: string, label: string) {
    if (!/^\d{4}$/.test(value.trim())) {
      throw new Error(
        `${label} måste bestå av exakt fyra siffror, t.ex. 1930.`
      )
    }
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault()

    if (
      !newAccount.id ||
      !newAccount.name ||
      !newAccount.debit_account ||
      !newAccount.credit_account
    ) {
      alert('Fyll i ID, namn, debitkonto och kreditkonto.')
      return
    }

    setSaving(true)

    try {
      validateAccountNumber(newAccount.debit_account, 'Debetkonto')
      validateAccountNumber(newAccount.credit_account, 'Kreditkonto')

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error('Hittade ingen inloggad användare.')
      }

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
        const { error } = await supabase.from('accounts').insert([
          {
            id: newAccount.id.toLowerCase().trim(),
            ...payload,
            user_id: user.id,
          },
        ])

        if (error) throw error
      }

      cancelEdit()
      await loadKontoplan()

      if (onAccountCreated) {
        await onAccountCreated()
      }
    } catch (err: unknown) {
      console.error(err)
      alert(
        `Kunde inte ${editingId ? 'uppdatera' : 'spara'} konto: ${err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)}`
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleVisibility(acc: AccountRow) {
    if (visibilitySaving || typeof acc.hidden_from_new_booking !== 'boolean') return
    setVisibilitySaving(true)
    setVisibilityError(null)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Hittade ingen inloggad användare.')
      const { data, error } = await supabase.from('accounts')
        .update({ hidden_from_new_booking: !acc.hidden_from_new_booking })
        .eq('id', acc.id).eq('user_id', user.id)
        .select('id, hidden_from_new_booking').single()
      if (error || !data || typeof data.hidden_from_new_booking !== 'boolean') {
        throw new Error('Synligheten kunde inte sparas. Läs in kontoplanen igen och försök på nytt.')
      }
      setKontoplan(current => current.map(item => item.id === acc.id
        ? { ...item, hidden_from_new_booking: data.hidden_from_new_booking } : item))
      await onAccountCreated?.()
    } catch (error: unknown) {
      setVisibilityError(error instanceof Error ? error.message : 'Synligheten kunde inte sparas.')
    } finally {
      setVisibilitySaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error('Hittade ingen inloggad användare.')
      }

      // H6: ett konto/kategori-ID som redan används av en bokförd transaktion
      // får inte tas bort. Backend-triggern är det slutliga skyddet; kontrollen här
      // ger bara användaren ett tydligt meddelande innan DELETE-försöket.
      const { count: usageCount, error: usageError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', id)
        .eq('booked', true)

      if (usageError) {
        throw new Error(
          `Kunde inte kontrollera om kontot används: ${usageError.message}`
        )
      }

      if ((usageCount ?? 0) > 0) {
        alert(
          `Kontot "${id}" används i ${usageCount} bokförd${usageCount === 1 ? '' : 'a'
          } transaktion${usageCount === 1 ? '' : 'er'} och kan därför inte raderas. ` +
          `Historiken måste bevaras.`
        )
        return
      }

      if (!confirm(`Radera det oanvända kontot "${id}"?`)) return

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
    } catch (err: unknown) {
      console.error(err)
      alert(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Kunde inte radera kontot.')
    }
  }

  const debitHelp = getBasAccountHelp(newAccount.debit_account)
  const creditHelp = getBasAccountHelp(newAccount.credit_account)
  const debitPersonnelWarning = personnelAccountWarning(
    newAccount.debit_account
  )
  const creditPersonnelWarning = personnelAccountWarning(
    newAccount.credit_account
  )

  const filtered = filterKontoplan(kontoplan, search, visibility)
  const groups = groupKontoplan(filtered)

  return (
    <div className="kontoplan-ux min-w-0 space-y-5 pb-6">

      <header className="space-y-3 rounded-[2rem] border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold text-gray-900">Bokföringskategorier</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-gray-700">Hantera kategorierna du väljer när du bokför. Sök, lägg till eller dölj kategorier du inte använder.</p>
        <details className="text-sm text-gray-700">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-gray-800">Bra att veta</summary>
          <div className="max-w-3xl space-y-2 pb-2 leading-relaxed">
            <p>Varje kategori har förinställda bokföringskonton och en förvald momssats. Kontrollera att inställningarna passar den aktuella händelsen.</p>
            <p>De vanligaste kategorierna finns redan. Dolda kategorier finns kvar i historik och rapporter och kan visas igen.</p>
            <p>0 % förvald moms innebär inte automatiskt att momsbehandlingen är korrekt.</p>
          </div>
        </details>
      </header>
      <section aria-label="Befintliga kategorier" className="space-y-5 rounded-[2rem] border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="block w-full max-w-xl text-sm font-semibold text-gray-800">Sök kategorier
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Namn, kontonummer eller kommentar" className="mt-2 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900 placeholder:text-gray-500" />
          </label>
          <button ref={addButton} type="button" aria-expanded={formOpen} aria-controls="kontoplan-form" onClick={() => {
            setSuggestionsOpen(true)
            setShowAllSuggestions(false)
            setEditingId(null)
            setNewAccount(EMPTY_ACCOUNT)
            setShowManualForm(false)
            setShowAdvancedSettings(false)
            setFormOpen(true)
            requestAnimationFrame(() => formHeading.current?.focus())
          }} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Lägg till kategori</button>
        </div>
        <div role="group" aria-label="Filtrera kategorier" className="flex flex-wrap gap-2">
          {([['all', 'Alla'], ['visible', 'Visade'], ['hidden', 'Dolda']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={visibility === value} onClick={() => setVisibility(value)} className={'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ' + (visibility === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')}>{label}</button>)}
        </div>
        <p role="status" className="text-sm text-gray-600">Visar {filtered.length} av {kontoplan.length} kategorier.</p>
        {visibilityError && <p role="alert" className="text-sm text-red-700">{visibilityError}</p>}
        {groups.map(group => <section key={group.label} aria-label={group.label} className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900">{group.label} <span className="font-normal text-gray-600">({group.rows.length})</span></h3>
          {group.rows.map(acc => <article key={acc.id} aria-label={acc.name} className="min-w-0 rounded-2xl border border-gray-200 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><h4 className="break-words text-base font-semibold text-gray-900">{acc.name}</h4>{acc.comment && <p className="mt-1 break-words text-sm leading-relaxed text-gray-700">{acc.comment}</p>}</div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" aria-label={'Redigera kategori: ' + acc.name} onClick={() => startEdit(acc)} className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Redigera</button>
                <button type="button" aria-label={'Radera kategori: ' + acc.name} onClick={() => void handleDelete(acc.id)} className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Radera</button>
              </div>
            </div>
            <dl aria-label="Kontoinställningar" className="mt-2 flex flex-wrap gap-2 text-sm text-gray-800">
              <div className="inline-flex items-baseline gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1"><dt><abbr title="Debetkonto" className="no-underline">D</abbr></dt><dd className="font-mono">{acc.debit_account}</dd></div>
              <div className="inline-flex items-baseline gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1"><dt><abbr title="Kreditkonto" className="no-underline">K</abbr></dt><dd className="font-mono">{acc.credit_account}</dd></div>
              <div className="inline-flex items-baseline gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1"><dt>Förvald moms</dt><dd>{acc.default_vat_rate} %</dd></div>
            </dl>
            <div className="mt-1"><CategoryVisibilityControl name={acc.name} hidden={acc.hidden_from_new_booking} disabled={visibilitySaving} onToggle={() => void toggleVisibility(acc)} /></div>
            {(isPersonnelAccount(acc.debit_account) || isPersonnelAccount(acc.credit_account)) && <p className="mt-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm leading-snug text-amber-900">{personnelAccountWarning(isPersonnelAccount(acc.debit_account) ? acc.debit_account : acc.credit_account)}</p>}
            <details className="mt-1 border-t border-gray-100">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">Konton och förvald moms</summary>
              <dl className="grid gap-4 py-2 sm:grid-cols-3">
                <div><dt className="text-sm font-semibold text-gray-700">Debetkonto</dt><dd className="mt-1 font-mono text-base text-gray-900">{acc.debit_account}</dd>{getBasAccountHelp(acc.debit_account) && <dd className="mt-1 text-sm text-gray-600">{getBasAccountHelp(acc.debit_account)}</dd>}</div>
                <div><dt className="text-sm font-semibold text-gray-700">Kreditkonto</dt><dd className="mt-1 font-mono text-base text-gray-900">{acc.credit_account}</dd>{getBasAccountHelp(acc.credit_account) && <dd className="mt-1 text-sm text-gray-600">{getBasAccountHelp(acc.credit_account)}</dd>}</div>
                <div><dt className="text-sm font-semibold text-gray-700">Förvald moms</dt><dd className="mt-1 text-base text-gray-900">{acc.default_vat_rate} %</dd></div>
              </dl>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">Förvald moms är en inställning för kategorin. 0 % innebär inte automatiskt att momsbehandlingen är korrekt.</p>
              <p className="mt-3 break-all text-xs text-gray-600">Kategori-ID: {acc.id}</p>
            </details>
          </article>)}
        </section>)}
        {filtered.length === 0 && <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-700">{kontoplan.length === 0 ? 'Inga kategorier tillagda ännu.' : 'Inga kategorier matchar sökningen och filtret.'}</p>}
      </section>
      {formOpen && <section id="kontoplan-form" aria-label="Kategoriformulär">
      <div className="bg-white p-4 sm:p-6 rounded-[2rem] border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 ref={formHeading} tabIndex={-1} className="scroll-mt-6 text-lg font-bold text-gray-900">
              {editingId ? 'Redigera bokföringskategori' : 'Lägg till bokföringskategori'}
            </h2>
            <p className="text-sm text-gray-600 font-medium mt-1 max-w-2xl leading-relaxed">
              SoloLedger har redan lagt till de vanligaste bokföringskategorierna åt
              dig. Lägg bara till fler när du behöver dem.
            </p>
          </div>

          {formOpen && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm font-semibold tracking-wider transition-colors"
            >
              {editingId ? 'Avbryt redigering' : 'Stäng tilläggsformuläret'}
            </button>
          )}
        </div>

        {(newAccount.id || showManualForm || editingId) && (
          <form ref={selectedForm} tabIndex={-1} aria-label="Vald kategori och inställningar" onSubmit={handleSaveAccount}>
            <p className="mb-4 text-sm leading-relaxed text-gray-700">Förvald moms är en inställning för kategorin. 0 % innebär inte automatiskt att momsbehandlingen är korrekt.</p>
            {(showManualForm || editingId) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor={"kontoplan-field-1"} className="text-sm font-semibold text-gray-500 ml-1">
                    ID {editingId ? '(kan inte ändras)' : '(t.ex. resor)'}
                  </label>
                  <input id={"kontoplan-field-1"}
                    type="text"
                    value={newAccount.id}
                    onChange={e =>
                      setNewAccount({ ...newAccount, id: e.target.value })
                    }
                    placeholder="resor"
                    disabled={Boolean(editingId)}
                    className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 placeholder:text-gray-600/70 transition-all disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor={"kontoplan-field-2"} className="text-sm font-semibold text-gray-500 ml-1">
                    Namn
                  </label>
                  <input id={"kontoplan-field-2"}
                    type="text"
                    value={newAccount.name}
                    onChange={e =>
                      setNewAccount({ ...newAccount, name: e.target.value })
                    }
                    placeholder="Resor"
                    className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 placeholder:text-gray-600/70 transition-all"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor={"kontoplan-field-3"} className="text-sm font-semibold text-gray-500 ml-1">
                    Kommentar
                  </label>
                  <input id={"kontoplan-field-3"}
                    type="text"
                    value={newAccount.comment}
                    onChange={e =>
                      setNewAccount({ ...newAccount, comment: e.target.value })
                    }
                    placeholder="T.ex. tåg, taxi, parkering"
                    className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 placeholder:text-gray-600/70 transition-all"
                  />
                </div>
              </div>
            )}

            {!showManualForm && !editingId && newAccount.id && (
              <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                <p className="text-sm font-semibold tracking-wider text-sky-800">
                  Vald bokföringskategori
                </p>
                <p className="mt-1 text-sm font-black text-gray-800">
                  {newAccount.name}
                </p>
                <button type="button" onClick={() => {
                  setSuggestionsOpen(true)
                  requestAnimationFrame(() => suggestionsSummary.current?.focus())
                }} className="mt-2 min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700">Byt kategori</button>
                {newAccount.comment && (
                  <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                    {newAccount.comment}
                  </p>
                )}
              </div>
            )}

            {matchingCategories.length > 0 && <aside role="note" aria-label="Befintliga kategorier med samma konton" className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
              <p className="font-semibold text-gray-900"><span aria-hidden="true">ℹ </span>Samma konton används redan</p>
              <p className="mt-1">Följande kategorier har också debetkonto {newAccount.debit_account} och kreditkonto {newAccount.credit_account}:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{matchingCategories.map(category => <li key={category.id} className="break-words">{category.name}{category.hidden_from_new_booking === true ? ' (dold)' : ''}</li>)}</ul>
              <p className="mt-2">Detta är inte automatiskt ett fel. Kategorier kan ha olika namn, användning och förvald moms.</p>
            </aside>}

            {guidance && (
              <div
                className={`mb-4 rounded-2xl border px-4 py-4 ${guidance.status === 'conditional'
                  ? 'border-amber-200 bg-amber-50'
                  : guidance.status === 'technical'
                    ? 'border-sky-200 bg-sky-50'
                    : 'border-sky-200 bg-sky-50'
                  }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm ${guidance.status === 'conditional'
                      ? 'bg-amber-100'
                      : guidance.status === 'technical'
                        ? 'bg-sky-100'
                        : 'bg-sky-100'
                      }`}
                  >
                    {guidance.status === 'conditional'
                      ? '⚠'
                      : guidance.status === 'technical'
                        ? '⚙'
                        : 'ℹ'}
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold tracking-wider ${guidance.status === 'conditional'
                        ? 'text-amber-700'
                        : guidance.status === 'technical'
                          ? 'text-sky-700'
                          : 'text-sky-800'
                        }`}
                    >
                      {guidance.status === 'conditional'
                        ? 'Kontrollera först'
                        : guidance.status === 'technical'
                          ? 'Teknisk kategori'
                          : 'Vägledning för kategorin'}
                    </p>

                    <p className="mt-1 text-sm font-semibold text-gray-700 leading-relaxed">
                      {guidance.summary}
                    </p>

                    {guidance.suitableWhen && (
                      <div className="mt-2">
                        <span className="text-sm font-semibold tracking-wider text-gray-500">
                          Passar när
                        </span>
                        <p className="mt-0.5 text-sm text-gray-600 leading-relaxed">
                          {guidance.suitableWhen}
                        </p>
                      </div>
                    )}

                    {guidance.warning && (
                      <div
                        className={`mt-2 rounded-xl px-3 py-2 ${guidance.status === 'conditional'
                          ? 'bg-amber-100/70'
                          : 'bg-white/60'
                          }`}
                      >
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {guidance.warning}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!showManualForm && !editingId && newAccount.id ? (
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-wider text-gray-500">
                      Bokföringsinställningar
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                    SoloLedger har förifyllt bokföringsinställningarna för den här kategorin.
                    </p>
                  </div>
                </div>

                {!showAdvancedSettings ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold tracking-wider text-gray-600">
                        Debetkonto
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-sky-800">
                          {newAccount.debit_account}
                        </span>
                        <span className="text-sm font-black text-emerald-600 bg-sky-100 px-1.5 py-0.5 rounded-md">
                          D
                        </span>
                      </div>
                      {debitHelp && (
                        <p className="mt-1 text-sm text-gray-500">
                          {debitHelp}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold tracking-wider text-gray-600">
                        Kreditkonto
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-orange-600">
                          {newAccount.credit_account}
                        </span>
                        <span className="text-sm font-black text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-md">
                          K
                        </span>
                      </div>
                      {creditHelp && (
                        <p className="mt-1 text-sm text-gray-500">
                          {creditHelp}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold tracking-wider text-gray-600">
                        Förvald moms
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-800">
                        {newAccount.default_vat_rate}%
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Förifyllt värde – kontrollera alltid underlaget.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={"kontoplan-field-4"} className="text-sm font-semibold text-gray-500 ml-1">
                        Debetkonto
                      </label>
                      <input id={"kontoplan-field-4"}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={newAccount.debit_account}
                        onChange={e =>
                          setNewAccount({
                            ...newAccount,
                            debit_account: e.target.value.replace(/\D/g, '').slice(0, 4),
                          })
                        }
                        className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 transition-all"
                        required
                      />
                      {debitHelp && (
                        <p className="text-sm text-emerald-600 font-bold ml-1">
                          BAS: {debitHelp}
                        </p>
                      )}
                      {debitPersonnelWarning && (
                        <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-sm font-semibold tracking-wider text-amber-700 mb-0.5">
                            ⚠ Personalkonto
                          </p>
                          <p className="text-sm leading-relaxed text-amber-700">
                            {debitPersonnelWarning}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor={"kontoplan-field-5"} className="text-sm font-semibold text-gray-500 ml-1">
                        Kreditkonto
                      </label>
                      <input id={"kontoplan-field-5"}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={newAccount.credit_account}
                        onChange={e =>
                          setNewAccount({
                            ...newAccount,
                            credit_account: e.target.value.replace(/\D/g, '').slice(0, 4),
                          })
                        }
                        className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 transition-all"
                        required
                      />
                      {creditHelp && (
                        <p className="text-sm text-orange-600 font-bold ml-1">
                          BAS: {creditHelp}
                        </p>
                      )}
                      {creditPersonnelWarning && (
                        <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-sm font-semibold tracking-wider text-amber-700 mb-0.5">
                            ⚠ Personalkonto
                          </p>
                          <p className="text-sm leading-relaxed text-amber-700">
                            {creditPersonnelWarning}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor={"kontoplan-field-6"} className="text-sm font-semibold text-gray-500 ml-1">
                        Förvald moms %
                      </label>
                      <select id={"kontoplan-field-6"}
                        value={newAccount.default_vat_rate}
                        onChange={e =>
                          setNewAccount({
                            ...newAccount,
                            default_vat_rate: Number(e.target.value),
                          })
                        }
                        className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm cursor-pointer border border-transparent focus:border-emerald-300 transition-all"
                      >
                        <option value={0}>0%</option>
                        <option value={6}>6%</option>
                        <option value={12}>12%</option>
                        <option value={25}>25%</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings(current => !current)}
                    className="text-left text-sm font-black text-gray-500 hover:text-sky-800 transition-colors"
                  >
                    {showAdvancedSettings
                      ? '− Dölj bokföringsinställningar'
                      : '+ Ändra bokföringsinställningar'}
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="sm:min-w-[220px] bg-emerald-600 text-white h-[52px] px-6 rounded-2xl font-semibold text-sm shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:bg-gray-300"
                  >
                    {saving ? '...' : 'Lägg till kategori'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="flex flex-col gap-1">
                  <label htmlFor={"kontoplan-field-7"} className="text-sm font-semibold text-gray-500 ml-1">
                    Debetkonto
                  </label>
                  <input id={"kontoplan-field-7"}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={newAccount.debit_account}
                    onChange={e =>
                      setNewAccount({
                        ...newAccount,
                        debit_account: e.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    placeholder="5800"
                    className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 placeholder:text-gray-600/70 transition-all"
                    required
                  />
                  {debitHelp && (
                    <p className="text-sm text-emerald-600 font-bold ml-1">
                      BAS: {debitHelp}
                    </p>
                  )}
                  {debitPersonnelWarning && (
                    <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-sm font-semibold tracking-wider text-amber-700 mb-0.5">
                        ⚠ Personalkonto
                      </p>
                      <p className="text-sm leading-relaxed text-amber-700">
                        {debitPersonnelWarning}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor={"kontoplan-field-8"} className="text-sm font-semibold text-gray-500 ml-1">
                    Kreditkonto
                  </label>
                  <input id={"kontoplan-field-8"}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={newAccount.credit_account}
                    onChange={e =>
                      setNewAccount({
                        ...newAccount,
                        credit_account: e.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    placeholder="1930"
                    className="p-4 bg-gray-50 rounded-2xl outline-none font-normal text-base border border-transparent focus:border-emerald-300 placeholder:text-gray-600/70 transition-all"
                    required
                  />
                  {creditHelp && (
                    <p className="text-sm text-orange-600 font-bold ml-1">
                      BAS: {creditHelp}
                    </p>
                  )}
                  {creditPersonnelWarning && (
                    <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-sm font-semibold tracking-wider text-amber-700 mb-0.5">
                        ⚠ Personalkonto
                      </p>
                      <p className="text-sm leading-relaxed text-amber-700">
                        {creditPersonnelWarning}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor={"kontoplan-field-9"} className="text-sm font-semibold text-gray-500 ml-1">
                    Förvald moms %
                  </label>
                  <select id={"kontoplan-field-9"}
                    value={newAccount.default_vat_rate}
                    onChange={e =>
                      setNewAccount({
                        ...newAccount,
                        default_vat_rate: Number(e.target.value),
                      })
                    }
                    className="p-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm cursor-pointer border border-transparent focus:border-emerald-300 transition-all"
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
                  className="bg-emerald-600 text-white h-[58px] rounded-2xl font-semibold text-sm shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:bg-gray-300"
                >
                  {saving
                    ? '...'
                    : editingId
                      ? 'Spara ändringar'
                      : 'Spara konto'}
                </button>
              </div>
            )}
          </form>
        )}

        {!editingId && (
          <details open={suggestionsOpen} onToggle={event => setSuggestionsOpen(event.currentTarget.open)} className="my-4 rounded-xl border border-gray-200 p-3">
            <summary ref={suggestionsSummary} className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-gray-800">{newAccount.id ? 'Välj en annan kategori' : 'Kategoriförslag'}</summary>
            <p className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-1">
              Vanliga kategorier att lägga till
            </p>

            <p className="text-sm text-gray-600 mb-3">
              Klicka på en kategori för att se vad den används till innan du lägger
              till den.
            </p>

            {tillgangligaForslag.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tillgangligaForslag.map((forslag, index) => {
                  const isSelected = newAccount.id === forslag.id

                  return (
                    <button
                      key={forslag.id}
                      data-category-suggestion={forslag.id}
                      aria-pressed={isSelected}
                      type="button"
                      onClick={event => {
                        if (newAccount.id === forslag.id) {
                          setSuggestionsOpen(true)
                          setNewAccount(EMPTY_ACCOUNT)
                          setShowManualForm(false)
                          setShowAdvancedSettings(false)
                        } else {
                          applyForslag(forslag, event.currentTarget)
                        }
                      }}
                      className={`${index >= 6 && !showAllSuggestions ? 'hidden md:inline-flex' : 'inline-flex'} items-center text-left text-sm font-semibold px-3 py-2 rounded-xl border transition-all shadow-sm ${isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100/70 hover:bg-emerald-100 hover:text-emerald-800'
                        }`}
                    >
                      {isSelected ? 'Vald:' : '+'} {forslag.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">
                Alla snabbförslag finns redan bland dina bokföringskategorier.
              </p>
            )}
            {tillgangligaForslag.length > 6 && <button type="button" aria-expanded={showAllSuggestions} onClick={() => setShowAllSuggestions(current => !current)} className="mt-3 min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 md:hidden">{showAllSuggestions ? 'Visa färre' : 'Visa alla kategoriförslag'}</button>}
          </details>
        )}

        {!editingId && !newAccount.id && (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => {
                setShowManualForm(current => !current)

                if (showManualForm) {
                  setNewAccount(EMPTY_ACCOUNT)
                }
              }}
              className="text-sm font-black text-gray-500 hover:text-emerald-700 transition-colors"
            >
              {showManualForm
                ? '− Stäng manuell inmatning'
                : '+ Lägg till egen kategori manuellt'}
            </button>
          </div>
        )}


      </div>
      </section>}
    </div>
  )
}
