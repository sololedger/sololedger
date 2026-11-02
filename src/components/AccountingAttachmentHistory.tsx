'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/supabaseFetchAll'
import { notifyAttachmentHistoryChanged } from '@/hooks/useAttachmentHistoryChanges'

type EntityType = 'transaction' | 'customer_invoice' | 'supplier_invoice'
interface Props {
  owner: string
  entityType: EntityType
  entityId: string
  locked: boolean
  onUpload?: (file: File) => Promise<string>
  variant?: 'manage' | 'list'
  hasChanges?: boolean
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
  observed_existing: 'Äldre bilagereferens', initial: 'Första registrerade bilaga',
  replacement: 'Byte av bilaga', addition: 'Kompletterande underlag',
}

// A changed owner/target always gets fresh state, including pending requests.
export default function AccountingAttachmentHistory(props: Props) {
  return <HistorySession key={`${props.owner}:${props.entityType}:${props.entityId}`} {...props} />
}

function HistorySession({ owner, entityType, entityId, locked, onUpload, variant = 'manage', hasChanges = false }: Props) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const headingId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const uploaded = useRef<{ file: File; path: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal() }, [open])

  async function load() {
    const data = await fetchAllRows<Entry>({
      context: 'bilagehistorik',
      createQuery: () => supabase.from('accounting_attachment_history')
        .select('id,path,original_path,action,actor_id,recorded_at,note', { count: 'exact' })
        .eq('user_id', owner).eq(columns[entityType], entityId).order('id'),
    })
    if (alive.current) setRows(data)
  }
  async function show() {
    if (inFlight.current) return
    if (open) return
    setOpen(true)
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
      if (!alive.current) { tab.close(); return }
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
      if (alive.current && entityType === 'transaction') notifyAttachmentHistoryChanged(owner, entityId)
    } catch {
      if (alive.current) setError('Tillägget kunde inte bekräftas. Läs om historiken före ett nytt försök. Året kan ha låsts.')
    } finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const changed = hasChanges || rows?.some(row => row.action === 'replacement' || row.action === 'addition')
  return <div className={`inline-flex min-w-0 items-center gap-2 text-xs font-normal text-gray-600${variant === 'list' ? ' ml-2' : ''}`} data-testid="accounting-attachment-history">
    {variant === 'list' ? <>
      {changed && <button type="button" aria-haspopup="dialog" onClick={() => void show()} className="py-1 underline decoration-gray-300 underline-offset-2 hover:text-emerald-800">Historik</button>}
      <details className="relative inline-block">
        <summary aria-label="Bilagealternativ" className="cursor-pointer list-none px-2 py-1 text-gray-500 hover:text-emerald-800">⋯</summary>
        <div className="absolute right-0 z-20 w-40 rounded border bg-white p-2 shadow-sm">
          <button type="button" aria-haspopup="dialog" onClick={event => { const menu = event.currentTarget.closest('details'); returnFocus.current = menu?.querySelector('summary') ?? null; menu?.removeAttribute('open'); void show() }} className="w-full rounded p-2 text-left hover:bg-gray-50">Hantera bilagor</button>
        </div>
      </details>
    </> : <button type="button" aria-haspopup="dialog" onClick={() => void show()} className="py-1 underline decoration-gray-300 underline-offset-2 hover:text-emerald-800">Hantera bilagor</button>}
    {open && createPortal(<dialog ref={dialog} aria-labelledby={headingId} onClose={() => { setOpen(false); returnFocus.current?.focus(); returnFocus.current = null }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-700 shadow-xl backdrop:bg-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={headingId} className="text-base font-bold">Hantera bilagor</h2>
        <button type="button" onClick={() => dialog.current?.close()} className="rounded px-3 py-2 hover:bg-gray-100">Stäng</button>
      </div>
      <div className="space-y-4">
      {busy && <p role="status">Hämtar eller sparar underlag…</p>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {rows?.length === 0 && <p>Ingen bilagehistorik registrerad.</p>}
      {rows && <ul className="space-y-3">{rows.map(row => <li key={row.id} className="break-words border-b pb-2">
        <p className="font-medium">{labels[row.action]}{row.path === row.original_path ? ' · Ursprunglig referens' : ''}</p>
        <p className="text-xs">Registrerad referens. Filens innehåll är inte verifierat.</p>
        {row.action === 'addition' && <p>{row.note}</p>}
        <button type="button" className="my-1 underline text-emerald-800" onClick={() => void openFile(row.path)}>Öppna bilaga</button>
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer py-1">Registreringsuppgifter</summary>
          <p>{new Date(row.recorded_at).toLocaleString('sv-SE')}</p>
          <p>{row.actor_id === owner ? 'Registrerad av kontots användare.' : row.action === 'observed_existing' ? 'Tidigare registreringstid och användare är okända.' : 'Registrerad av serverprocess.'}</p>
          {row.action !== 'addition' && <p>Registrerad anteckning: {row.note}</p>}
        </details>
      </li>)}</ul>}
      {locked ? <p>Året är låst. Du kan öppna bilagor men inte ändra eller lägga till.</p> : onUpload && rows && <div className="space-y-2 border-t pt-4">
        <label className="block">Kompletterande bilaga <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); uploaded.current = null }} className="block max-w-full" /></label>
        <label className="block">Beskriv tillägget <input value={note} maxLength={500} disabled={busy} onChange={e => setNote(e.target.value)} className="block w-full rounded border p-2" /></label>
        <button type="button" disabled={busy || !file || !note.trim()} onClick={() => void add()} className="rounded border px-3 py-2">Spara bilagetillägg</button>
        <p className="text-xs">Tillägget ändrar inte tidigare referenser eller bokföringsbelopp.</p>
      </div>}
      </div>
    </dialog>, document.body)}
  </div>
}
