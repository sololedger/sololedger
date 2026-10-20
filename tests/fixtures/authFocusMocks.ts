import { supabase as profileClient, control as profile } from './profileContextMocks'
import * as accounting from './accountingLoadMocks'
import { GoTrueClient } from '@supabase/auth-js'

export const supabase = {
  ...profileClient,
  from(table: string) { return table === 'profiles' ? profileClient.from(table) : accounting.supabase.from() },
}
export const focusControl = {
  ...profile,
  event(owner: string | null, event?: string) { accounting.setOwner(owner); profile.event(owner, event) },
  async installVisibilityRecovery(owner: string) {
    const key = 'kan105-synthetic-session'
    const session = JSON.stringify({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 7200, token_type: 'bearer',
      user: { id: owner, email: `${owner}@example.invalid` } })
    const memory = new Map([[key, session]])
    let armed = false
    const auth = new GoTrueClient({ url: 'https://auth-focus.invalid', storageKey: key,
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
      storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v) }, removeItem: k => { memory.delete(k) } },
      fetch: async () => { throw new Error('Test must not use the network') },
    })
    auth.onAuthStateChange((event, next) => {
      if (armed && event === 'SIGNED_IN') flushEvent(next?.user.id ?? null, event)
    })
    await auth.initialize()
    armed = true
  },
}

function flushEvent(owner: string | null, event: string) { focusControl.event(owner, event) }
