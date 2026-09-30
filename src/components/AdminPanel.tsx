'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  ADMIN_DELETE_DRY_RUN_COUNT_KEYS,
  ADMIN_DELETE_DRY_RUN_COUNT_LABELS,
  normalizeAdminDeleteDryRunCounts,
  type AdminDeleteDryRunCounts,
} from '@/lib/adminDeleteDryRun'

interface UserRow {
  id: string
  email: string
  company_name: string | null
  subscription_type: string
  subscription_end: string | null
  role: string
}

interface DryRunResult {
  userId: string
  email: string
  counts: AdminDeleteDryRunCounts
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Okänt fel'
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, company_name, subscription_type, subscription_end, role')
        .order('company_name')

      if (error) throw error
      setUsers(profiles || [])
    } catch (err: unknown) {
      setMessage({ text: 'Kunde inte ladda användare: ' + errorMessage(err), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDryRun(user: UserRow) {
    setDryRun(null)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('Ingen giltig inloggningssession hittades')
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'dry-run',
            userId: user.id,
          }),
        }
      )

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Okänt fel')
      }

      setDryRun({
        userId: json.userId,
        email: json.email,
        counts: normalizeAdminDeleteDryRunCounts(json.counts),
      })
    } catch (err: unknown) {
      setMessage({ text: 'Torrkörning misslyckades: ' + errorMessage(err), type: 'error' })
    }
  }

  async function handleDelete() {
    if (!dryRun) return
    setDeleting(true)
    setMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: 'delete', userId: dryRun.userId }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Okänt fel')

      setMessage({ text: `✅ ${dryRun.email} raderad.`, type: 'success' })
      setDryRun(null)
      await loadUsers()
    } catch (err: unknown) {
      setMessage({ text: 'Radering misslyckades: ' + errorMessage(err), type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function subscriptionBadge(type: string, end: string | null) {
    const expired = end ? new Date(end).getTime() < Date.now() : false
    if (type === 'paid' && !expired) return <span className="text-[10px] bg-emerald-100 text-emerald-700 font-black px-2 py-0.5 rounded-full">paid</span>
    if (type === 'trial' && !expired) return <span className="text-[10px] bg-blue-100 text-blue-700 font-black px-2 py-0.5 rounded-full">trial</span>
    return <span className="text-[10px] bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-full">free / utgången</span>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-800">Adminpanel</h2>
        <p className="text-[11px] text-gray-400 font-bold mt-0.5">{users.length} registrerade användare</p>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-2xl text-[11px] font-black ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="text-[11px] text-gray-400 font-bold">Laddar användare...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map(user => (
            <div key={user.id} className="bg-white rounded-2xl border shadow-sm px-4 sm:px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-800 truncate">{user.company_name || '—'}</p>
                  <p className="text-[11px] text-gray-400 font-bold mt-0.5 truncate">{user.email}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-1.5">
                    {subscriptionBadge(user.subscription_type, user.subscription_end)}
                    {user.role === 'admin' && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 font-black px-2 py-0.5 rounded-full">admin</span>
                    )}
                    {user.subscription_end && (
                      <span className="text-[10px] text-gray-400 font-bold">
                        t.o.m. {new Date(user.subscription_end).toLocaleDateString('sv-SE')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDryRun(user)}
                  disabled={user.role === 'admin'}
                  className="shrink-0 w-full sm:w-auto text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Torrkör radering
                </button>
              </div>

              {dryRun?.userId === user.id && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-red-700 mb-2">
                    Kommer att raderas för {dryRun.email}:
                  </p>
                  <ul className="text-[11px] text-red-600 font-bold space-y-0.5 mb-3">
                    {ADMIN_DELETE_DRY_RUN_COUNT_KEYS.map(key => (
                      <li key={key}>
                        • {dryRun.counts[key]} {ADMIN_DELETE_DRY_RUN_COUNT_LABELS[key]}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full sm:w-auto text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-50"
                    >
                      {deleting ? 'Raderar...' : '⚠️ Radera användare permanent'}
                    </button>
                    <button
                      onClick={() => setDryRun(null)}
                      className="w-full sm:w-auto text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl bg-white border text-gray-500 hover:bg-gray-50 transition-all"
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
