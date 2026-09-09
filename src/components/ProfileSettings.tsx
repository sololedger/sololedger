'use client'
import { useState, useEffect } from 'react' // 🌟 Importerat useEffect för synkning
import { supabase } from '@/lib/supabaseClient'

interface Props {
  user: any
  profile: any
  onProfileUpdate: (updated: any) => void
  onUpdatePassword: (newPassword: string) => Promise<{ success: true } | { success: false; error: string }>
  onBookkeepingChanged?: () => Promise<void> | void
}

interface SieImportBatch {
  id: string
  filename: string
  fiscal_year: number | null
  status: string
  verification_count: number
  imported_count: number
  completed_at: string | null
  undone_at: string | null
}

export default function ProfileSettings({ user, profile, onProfileUpdate, onUpdatePassword, onBookkeepingChanged }: Props) {
  const [companyName, setCompanyName] = useState(profile?.company_name || '')
  const [orgNr, setOrgNr] = useState(profile?.org_nr || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [sieImports, setSieImports] = useState<SieImportBatch[]>([])
  const [sieImportsLoading, setSieImportsLoading] = useState(true)
  const [sieImportsError, setSieImportsError] = useState<string | null>(null)
  const [undoingImportId, setUndoingImportId] = useState<string | null>(null)
  const [sieUndoNotice, setSieUndoNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // 🌟 Synka lokala states när profildatan har landat från Supabase
  useEffect(() => {
    if (profile?.company_name) setCompanyName(profile.company_name)
    if (profile?.org_nr) setOrgNr(profile.org_nr)
  }, [profile])

  useEffect(() => {
    if (!user?.id) {
      setSieImports([])
      setSieImportsLoading(false)
      return
    }

    let cancelled = false

    async function loadSieImports() {
      setSieImportsLoading(true)
      setSieImportsError(null)

      const { data, error } = await supabase
        .from('import_batches')
        .select('id, filename, fiscal_year, status, verification_count, imported_count, completed_at, undone_at')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false, nullsFirst: false })

      if (cancelled) return

      if (error) {
        setSieImports([])
        setSieImportsError('Kunde inte ladda SIE-importhistoriken.')
      } else {
        setSieImports((data || []) as SieImportBatch[])
      }

      setSieImportsLoading(false)
    }

    loadSieImports()

    return () => {
      cancelled = true
    }
  }, [user?.id])


  async function handleUndoSieImport(item: SieImportBatch) {
    if (item.status !== 'completed') return

    const ok = window.confirm(
      `Ångra SIE-importen "${item.filename}"?\n\n` +
      `${item.imported_count ?? item.verification_count ?? 0} importerade verifikationer kommer att rättas automatiskt med KORRVER. ` +
      `Originalverifikationerna ligger kvar för spårbarhet.\n\n` +
      `Ångringen kan stoppas om räkenskapsåret är låst eller om någon importerad verifikation redan har korrigerats.`
    )

    if (!ok) return

    setUndoingImportId(item.id)
    setSieUndoNotice(null)

    try {
      const { data, error } = await supabase.rpc('undo_sie_import_atomic', {
        p_import_batch_id: item.id,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Ångringen misslyckades av okänd anledning.')

      setSieImports((current) =>
        current.map((batch) =>
          batch.id === item.id
            ? { ...batch, status: 'undone', undone_at: data.undone_at ?? new Date().toISOString() }
            : batch
        )
      )

      // Uppdatera även bokföringsdata/NE/dashboard direkt så användaren
      // slipper göra en hard refresh efter en lyckad SIE-ångring.
      await onBookkeepingChanged?.()

      setSieUndoNotice({
        type: 'success',
        text: `✓ Importen "${item.filename}" är ångrad. ${data.correction_count ?? 0} rättelseverifikationer skapades automatiskt.`,
      })
    } catch (err: any) {
      setSieUndoNotice({
        type: 'error',
        text: err?.message || 'Kunde inte ångra SIE-importen.',
      })
    } finally {
      setUndoingImportId(null)
    }
  }

  async function handleSave(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user?.id) return
    setSaving(true)
    setSaved(false)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ company_name: companyName, org_nr: orgNr })
        .eq('id', user.id)

      if (error) throw error

      onProfileUpdate({ ...profile, company_name: companyName, org_nr: orgNr })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      alert('Kunde inte spara: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordNotice(null)

    if (newPassword.length < 6) {
      setPasswordNotice({ type: 'error', text: 'Lösenordet måste vara minst 6 tecken.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'Lösenorden matchar inte.' })
      return
    }

    setPasswordSaving(true)
    try {
      const result = await onUpdatePassword(newPassword)
      if (result.success) {
        setPasswordNotice({ type: 'success', text: '✓ Lösenordet är uppdaterat.' })
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordNotice({ type: 'error', text: result.error })
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      // Skickar inte längre userId i body - servern hämtar och verifierar
      // identiteten själv ur access-token (se /api/portal).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Din session har gått ut. Ladda om sidan och försök igen.')
        setPortalLoading(false)
        return
      }

      const res = await fetch('/api/portal', {
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
        alert('Kunde inte öppna kundportalen: ' + (data.error || 'Okänt fel'))
      }
    } catch (err: any) {
      alert('Fel: ' + err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  const subscriptionKey = (profile?.subscription_type || 'free') as 'free' | 'trial' | 'paid' | 'admin'

  const subscriptionLabel = {
    free: 'Gratisplan',
    trial: 'Testperiod (14 dagar)',
    paid: 'Premium',
    admin: 'Administratör'
  }[subscriptionKey] ?? 'Gratisplan'

  const subscriptionColor = {
    free: 'text-gray-500 bg-gray-50 border-gray-200',
    trial: 'text-amber-700 bg-amber-50 border-amber-200',
    paid: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    admin: 'text-purple-700 bg-purple-50 border-purple-200'
  }[subscriptionKey] ?? 'text-gray-500 bg-gray-50 border-gray-200'

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Kontoinformation */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6">Kontoinformation</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">E-postadress</label>
            <p className="text-sm font-bold text-gray-700 bg-gray-50 rounded-xl px-4 py-3">{user?.email || 'Ingen e-post'}</p>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Prenumerationsplan</label>
            <span className={`inline-block text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full border ${subscriptionColor}`}>
              {subscriptionLabel}
            </span>
            {profile?.subscription_end && (
              <p className="text-[10px] text-gray-400 font-bold mt-1">
                {profile.subscription_type === 'trial' ? 'Testperiod slutar' : 'Förnyas'}: {new Date(profile.subscription_end).toLocaleDateString('sv-SE')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Företagsinformation */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6">Företagsinformation</h2>
        <p className="text-[10px] text-gray-400 font-bold mb-6">Används i SIE-exporten och på rapporter.</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Företagsnamn</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Din Firma AB"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Organisationsnummer</label>
            <input
              type="text"
              value={orgNr}
              onChange={e => setOrgNr(e.target.value)}
              placeholder="556000-0000"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? 'Sparar...' : saved ? '✓ Sparat!' : 'Spara ändringar'}
          </button>
        </form>
      </div>

      {/* SIE-importhistorik */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">SIE-importer</h2>
            <p className="text-[10px] text-gray-400 font-bold mt-1">Historik över SIE-filer som importerats till ditt konto.</p>
          </div>
          {!sieImportsLoading && sieImports.length > 0 && (
            <span className="shrink-0 text-[10px] font-black text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              {sieImports.length} {sieImports.length === 1 ? 'import' : 'importer'}
            </span>
          )}
        </div>

        {sieUndoNotice && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-[11px] font-bold ${
            sieUndoNotice.type === 'error'
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {sieUndoNotice.text}
          </div>
        )}

        {sieImportsLoading ? (
          <p className="text-[11px] text-gray-400 font-bold">Laddar importhistorik...</p>
        ) : sieImportsError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-bold text-red-600">
            {sieImportsError}
          </div>
        ) : sieImports.length === 0 ? (
          <div className="rounded-xl bg-gray-50 px-4 py-4">
            <p className="text-[11px] font-bold text-gray-500">Inga SIE-filer har importerats ännu.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sieImports.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-700 truncate" title={item.filename}>
                      {item.filename || 'SIE-fil'}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] font-bold text-gray-400">
                      <span>Räkenskapsår: {item.fiscal_year ?? '—'}</span>
                      <span>{item.imported_count ?? item.verification_count ?? 0} verifikationer</span>
                      {item.completed_at && (
                        <span>Importerad {new Date(item.completed_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                      {item.status === 'undone' && item.undone_at && (
                        <span>Ångrad {new Date(item.undone_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 self-start sm:self-auto">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      item.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.status === 'undone'
                          ? 'bg-gray-100 text-gray-600 border-gray-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {item.status === 'completed' ? 'Importerad' : item.status === 'undone' ? 'Ångrad' : item.status}
                    </span>

                    {item.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleUndoSieImport(item)}
                        disabled={undoingImportId !== null}
                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {undoingImportId === item.id ? 'Ångrar...' : 'Ångra import'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-gray-400 font-bold mt-4">
          En ångrad import ligger kvar i historiken. SoloLedger skapar automatiska rättelseverifikationer i stället för att radera bokföring.
        </p>
      </div>

      {/* Byt lösenord */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6">Byt lösenord</h2>

        {passwordNotice && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-[11px] font-bold ${
            passwordNotice.type === 'error'
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {passwordNotice.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Nytt lösenord</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minst 6 tecken"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Bekräfta nytt lösenord</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Upprepa lösenordet"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={passwordSaving || !newPassword || !confirmPassword}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
          >
            {passwordSaving ? 'Uppdaterar...' : 'Byt lösenord'}
          </button>
        </form>
      </div>

      {/* Prenumerationshantering */}
      {(profile?.subscription_type === 'trial' || profile?.subscription_type === 'paid') && (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Hantera prenumeration</h2>
          <p className="text-[10px] text-gray-400 font-bold mb-6">Avsluta, byt betalmetod eller se fakturahistorik via Stripes säkra kundportal.</p>

          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-6 py-3 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
          >
            {portalLoading ? 'Öppnar...' : 'Hantera prenumeration →'}
          </button>
        </div>
      )}

    </div>
  )
}