'use client'
import { useState, useEffect } from 'react' // 🌟 Importerat useEffect för synkning
import { supabase } from '@/lib/supabaseClient'

interface Props {
  user: any
  profile: any
  onProfileUpdate: (updated: any) => void
  onUpdatePassword: (newPassword: string) => Promise<{ success: true } | { success: false; error: string }>
}

export default function ProfileSettings({ user, profile, onProfileUpdate, onUpdatePassword }: Props) {
  const [companyName, setCompanyName] = useState(profile?.company_name || '')
  const [orgNr, setOrgNr] = useState(profile?.org_nr || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // 🌟 Synka lokala states när profildatan har landat från Supabase
  useEffect(() => {
    if (profile?.company_name) setCompanyName(profile.company_name)
    if (profile?.org_nr) setOrgNr(profile.org_nr)
  }, [profile])

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