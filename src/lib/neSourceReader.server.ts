// Deliberately no route/server action: this read adapter is not wired into UI.
import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateNeSourceSnapshot } from './neSourceSnapshot'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'
  return JSON.stringify(value)
}

export function neSourceFingerprint(raw: Record<string, unknown>) {
  // captured_at changes on every read; only source content belongs in the hash.
  const { captured_at: _time, ...content } = raw
  void _time
  return createHash('sha256').update(canonical(content)).digest('hex')
}

export async function readNeSourceSnapshot(client: SupabaseClient, token: string, year: number) {
  if (!token || !Number.isInteger(year) || year < 1900 || year > 9998) throw new Error('Ogiltigt lässammanhang.')
  const identity = await client.auth.getUser(token)
  if (identity.error || !identity.data.user) throw new Error('Inloggningen kunde inte verifieras.')
  // Pin this verified bearer even if an injected client has another session.
  const { data, error } = await client.rpc('get_ne_source_snapshot', { p_year: year }).setHeader('Authorization', `Bearer ${token}`)
  if (error) throw new Error('NE-källunderlaget kunde inte hämtas. Ingen reservväg används.')
  const source = validateNeSourceSnapshot(data, identity.data.user.id, year)
  return { ...source, sourceFingerprint: neSourceFingerprint(source.raw) }
}
