'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { useWithdrawal } from '@/hooks/useWithdrawal'
import { WithdrawalConflictError } from '@/lib/withdrawalService'

type Draft<T> = { input: T; signature: string; revision: string | null }

type Props<T> = {
  model: ReturnType<typeof useWithdrawal>
  factKey: 'buffer' | 'coverage' | 'bank' | 'other' | 'tax_account' | `income:${number}`
  initial: T
  value: (input: T) => Record<string, unknown>
  fields: (input: T, edit: (input: T) => void) => ReactNode
  subject: string
  reviewText: string
  onStart?: () => void
  canSubmit?: (input: T) => boolean
}

export default function WithdrawalControlForm<T>({ model, factKey, initial, value, fields, subject, reviewText, onStart, canSubmit }: Props<T>) {
  const [draft, setDraft] = useState<Draft<T> | null>(null)
  const [message, setMessage] = useState('')
  const [outcome, setOutcome] = useState<'updated' | 'saved-without-reload' | 'uncertain' | 'conflict' | null>(null)
  const pending = useRef(false)
  const snapshot = model.data?.snapshot
  const revision = snapshot?.revision?.id ?? null
  const input = draft?.input ?? initial
  const canSave = canSubmit?.(input) ?? true
  const stale = !!draft && !!snapshot && (draft.signature !== snapshot.signature || draft.revision !== revision)
  const needsReview = stale || outcome === 'uncertain' || outcome === 'conflict'
  const subjectLower = subject.toLocaleLowerCase('sv-SE')

  function discard() {
    setDraft(null)
    setOutcome(null)
    setMessage('')
  }

  function edit(input: T) {
    if (!snapshot || needsReview) return
    onStart?.()
    setDraft(previous => ({ signature: snapshot.signature, revision, ...previous, input }))
    setOutcome(null)
    setMessage('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!model.data || !snapshot || needsReview || pending.current || model.saving || !canSave) return
    pending.current = true
    onStart?.()
    setMessage('')
    setOutcome(null)
    setDraft({ input, signature: snapshot.signature, revision })
    try {
      const payload = value(input)
      const facts = model.data.assessment.facts.filter(fact => fact.key !== factKey)
      const saved = await model.save([...facts, { key: factKey, value: payload }])
      if (!saved) return
      setOutcome(saved)
      if (saved !== 'uncertain') setDraft(null)
    } catch (error) {
      if (error instanceof WithdrawalConflictError) setOutcome('conflict')
      else setMessage(error instanceof Error ? error.message : subject + ' kunde inte sparas.')
    } finally {
      pending.current = false
    }
  }

  return <form onSubmit={submit} className="space-y-3">
    <fieldset className="min-w-0 space-y-3" disabled={!snapshot || model.saving || needsReview}>
      {fields(input, edit)}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!canSave} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{model.saving ? 'Sparar…' : 'Spara kontrollen'}</button>
        {draft && <button type="button" onClick={discard} className="min-h-11 px-3 text-sm font-semibold text-slate-700 underline">Kasta utkast</button>}
      </div>
    </fieldset>
    {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{message}</p>}
    {outcome === 'updated' && snapshot && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Sparat · beräkningen är uppdaterad.</p>}
    {outcome === 'saved-without-reload' && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
      {subject} sparades. {snapshot ? 'Aktuella uppgifter har nu lästs in.' : 'Beräkningen kunde inte läsas in.'}
    </p>}
    {needsReview && <div role="status" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
      <p>{outcome === 'uncertain' ? `Det gick inte att avgöra om ${subjectLower} sparades.` : `Underlaget har ändrats sedan du började fylla i ${subjectLower}.`}</p>
      {snapshot && <>
        <p>{reviewText} Kontrollera uppgiften innan du börjar om.</p>
        <button type="button" onClick={discard} className="min-h-11 font-semibold underline">Börja om med aktuell uppgift</button>
      </>}
    </div>}
  </form>
}
