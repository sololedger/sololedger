import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadWithdrawal, saveWithdrawal, WithdrawalConflictError } from '@/lib/withdrawalService'
import type { WithdrawalFact } from '@/lib/withdrawalAssessment'

export function useWithdrawal(owner: string, asOf: string, refreshKey: unknown) {
  const scope = useMemo(() => ({ owner, asOf, refreshKey }), [owner, asOf, refreshKey])
  const active = useRef<typeof scope | null>(scope)
  const sequence = useRef(0)
  useLayoutEffect(() => {
    active.current = scope
    sequence.current++
    return () => { active.current = null }
  }, [scope])
  const [state, setState] = useState<{
    scope: typeof scope; data: Awaited<ReturnType<typeof loadWithdrawal>> | null; error: string | null
  } | null>(null)
  const [saving, setSaving] = useState(false)
  async function reload() {
    if (active.current !== scope) return
    const attempt = ++sequence.current
    setState({ scope, data: null, error: null })
    try {
      const data = await loadWithdrawal(owner, asOf)
      if (active.current !== scope || sequence.current !== attempt) return
      setState({ scope, data, error: null })
      return 'updated' as const
    } catch (e) {
      if (active.current !== scope || sequence.current !== attempt) return
      setState({ scope, data: null, error: e instanceof Error ? e.message : 'Uttagsunderlaget kunde inte hämtas.' })
      return 'failed' as const
    }
  }
  useEffect(() => {
    const counter = sequence
    let mounted = true
    // The render already masks a different scope; start the external read
    // after this effect without a synchronous loading-state render cascade.
    queueMicrotask(() => { if (mounted) void reload() })
    return () => { mounted = false; counter.current++ }
    // The immutable scope includes identity, valuation date and accounting refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  const visible = state?.scope === scope ? state : null
  const busy = useRef(false)
  async function save(facts: WithdrawalFact[]) {
    if (busy.current || !visible?.data || active.current !== scope) throw new Error('Ladda aktuellt underlag innan du sparar.')
    busy.current = true
    setSaving(true)
    try {
      const outcome = await saveWithdrawal(owner, visible.data.snapshot, facts)
      if (active.current !== scope) return
      if (outcome === 'uncertain') {
        sequence.current++
        setState({ scope, data: null, error: 'Det gick inte att avgöra om uppgiften sparades. Läs in aktuella uppgifter innan du försöker igen.' })
        return 'uncertain' as const
      }
      const refreshed = await reload()
      if (active.current !== scope) return
      return refreshed === 'updated' ? 'updated' as const : 'saved-without-reload' as const
    } catch (e) {
      if (e instanceof WithdrawalConflictError && active.current === scope) await reload()
      throw e
    } finally { busy.current = false; if (active.current) setSaving(false) }
  }
  return { data: visible?.data ?? null, error: visible?.error ?? null, loading: !visible?.data && !visible?.error, saving, reload, save }
}
