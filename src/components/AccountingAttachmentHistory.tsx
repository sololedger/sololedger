'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/supabaseFetchAll'

type EntityType = 'transaction' | 'customer_invoice' | 'supplier_invoice'
interface Props {
  owner: string
  entityType: EntityType
  entityId: string
  locked: boolean
  onUpload?: (file: File) => Promise<string>
}
interface Entry {
  id: number
  path: string
  original_path: string
  action: 'observed_existing' | 'initial' | 'replacement' | 'addition'
  actor_id: string | null
  recorded_at: string
  note: string
}
const columns = {
  transaction: 'transaction_id', customer_invoice: 'customer_invoice_id', supplier_invoice: 'supplier_invoice_id',
} as const
const labels = {
  observed_existing: 'Befintlig referens observerad', initial: 'Första registrerade bilaga',
  replacement: 'Ny bilagereferens', addition: 'Kompletterande underlag',
}

// A changed owner/target always gets fresh state, including pending requests.
export default function AccountingAttachmentHistory(props: Props) {
  return <HistorySession key={`${props.owner}:${props.entityType}:${props.entityId}`} {...props} />
}

function HistorySession({ owner, entityType, entityId, locked, onUpload }: Props) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const alive = useRef(true)
  const inFlight = useRef(false)
  const uploaded = useRef<{ file: File; path: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  async function load() {
    const data = await fetchAllRows<Entry>({
      context: 'bilagehistorik',
      createQuery: () => supabase.from('accounting_attachment_history')
        .select('id,path,original_path,action,actor_id,recorded_at,note', { count: 'exact' })
        .eq('user_id', owner).eq(columns[entityType], entityId).order('id'),
    })
    if (alive.current) setRows(data)
  }
  async function toggle() {
    if (inFlight.current) return
    setOpen(!open)
    if (open) return
    inFlight.current = true; setBusy(true); setError(''); setRows(null)
    try { await load() }
    catch { if (alive.current) setError('Bilagehistoriken kunde inte hämtas. Stäng och öppna den för att försöka igen.') }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  async function openFile(path: string) {
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    try {
      const { data, error: failure } = await supabase.storage.from('attachments').createSignedUrl(path, 60)
      if (failure || !data?.signedUrl || !tab) throw new Error('open failed')
      tab.location.href = data.signedUrl
    } catch {
      tab?.close()
      if (alive.current) setError('Bilagan kunde inte öppnas. Kontrollera att webbläsaren tillåter en ny flik och försök igen.')
    }
  }
  async function add() {
    if (inFlight.current || locked || !onUpload || !file || !note.trim()) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const path = uploaded.current?.file === file ? uploaded.current.path : await onUpload(file)
      uploaded.current = { file, path }
      if (!alive.current) return
      const { data, error: failure } = await supabase.rpc('add_accounting_attachment', {
        p_entity_type: entityType, p_entity_id: entityId, p_path: path, p_note: note.trim(),
      })
      if (failure || data?.success !== true) throw new Error('add failed')
      if (!alive.current) return
      uploaded.current = null; setFile(null); setNote('')
      await load()
    } catch {
      if (alive.current) setError('Tillägget kunde inte bekräftas. Läs om historiken före ett nytt försök. Året kan ha låsts. Tidigare underlag finns kvar.')
    } finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  return <div className="my-2 min-w-0 text-sm font-normal text-gray-700" data-testid="accounting-attachment-history">
    <button type="button" aria-expanded={open} disabled={busy} onClick={() => void toggle()} className="rounded border px-2 py-1 text-emerald-800">Bilagehistorik och tillägg</button>
    {open && <div className="mt-2 space-y-2 rounded border bg-white p-3">
      {busy && <p role="status">Hämtar eller sparar underlag…</p>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {rows?.length === 0 && <p>Ingen bilagehistorik registrerad.</p>}
      {rows && <ul className="space-y-3">{rows.map(row => <li key={row.id} className="break-words border-b pb-2">
        <p>{labels[row.action]} · {new Date(row.recorded_at).toLocaleString('sv-SE')}</p>
        <p className="text-xs">{row.actor_id === owner ? 'Registrerad av kontots användare.' : row.action === 'observed_existing' ? 'Tidigare registreringstid och användare är okända.' : 'Registrerad av serverprocess.'}</p>
        <p>{row.note}</p>
        <button type="button" className="mt-1 underline text-emerald-800" onClick={() => void openFile(row.path)}>Öppna bevarat underlag</button>
      </li>)}</ul>}
      {locked ? <p>Året är låst. Bevarade underlag kan läsas; nya tillägg är spärrade.</p> : onUpload && rows && <div className="space-y-2">
        <label className="block">Kompletterande bilaga <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); uploaded.current = null }} className="block max-w-full" /></label>
        <label className="block">Beskriv tillägget <input value={note} maxLength={500} disabled={busy} onChange={e => setNote(e.target.value)} className="block w-full rounded border p-2" /></label>
        <button type="button" disabled={busy || !file || !note.trim()} onClick={() => void add()} className="rounded border px-3 py-2">Spara bilagetillägg</button>
        <p className="text-xs">Tidigare bilagor och bokföringsbelopp bevaras.</p>
      </div>}
    </div>}
  </div>
}
