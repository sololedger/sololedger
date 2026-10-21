type Row = Record<string, unknown>
const profiles: Record<string, Row> = Object.fromEntries(['A', 'B'].map(id => [id, {
  id, email: `${id}@example.invalid`, company_name: `Company ${id}`, org_nr: null, vat_number: null,
  subscription_type: 'paid', subscription_end: null, role: 'user',
  vat_status: 'registered', vat_period_type: id === 'A' ? 'quarter' : 'month',
  vat_management_from: '2026-01-01', domestic_sales_vat_treatment: 'taxable',
  foreign_purchase_reporting: 'required', default_deduction_entitlement: id === 'A' ? 'full' : 'none',
}]))
let owner: string | null = null
let callback: (event: string, session: unknown) => void
const pending: { id: string; resolve: (value: unknown) => void }[] = []
const writes: { id: string; patch: Row }[] = []
const bookings: { owner: string; inputVat: number; args: unknown }[] = []
let wrongIdentity = false
export const control = {
  event(id: string | null, event = id ? 'SIGNED_IN' : 'SIGNED_OUT') { owner = id; callback(event, id ? { user: { id, email: `${id}@example.invalid` } } : null) },
  pending: () => pending.map(p => p.id),
  finish(index: number, error = false, row?: Row) {
    const [request] = pending.splice(index, 1)
    request.resolve(error ? { data: null, error: { message: 'Synthetic profile failure' } } : { data: row ?? { ...profiles[request.id] }, error: null })
  },
  profiles, writes, bookings,
  silentOwner(id: string) { owner = id },
  identityMismatch(value: boolean) { wrongIdentity = value },
}
function rpc(name: string, args?: unknown) {
  let token = owner
  const query = {
    setHeader(_name: string, value: string) { token = value.replace('Bearer ', ''); return query },
    then(resolve: (v: unknown) => void) {
      if (name === 'get_standard_booking_protocol') return Promise.resolve({ data: 1, error: null }).then(resolve)
      bookings.push({ owner: token!, inputVat: profiles[token!].default_deduction_entitlement === 'none' ? 0 : 250, args })
      return Promise.resolve({ data: { success: true, idempotent_replay: false, transaction_id: '00000000-0104-4000-8000-000000000001', ver_nr: 1 }, error: null }).then(resolve)
    },
  }
  return query
}
export const supabase = {
  auth: {
    onAuthStateChange(cb: typeof callback) { callback = cb; return { data: { subscription: { unsubscribe() {} } } } },
    getSession: async () => ({ data: { session: owner ? { access_token: owner } : null }, error: null }),
    getUser: async (token?: string) => ({ data: { user: { id: wrongIdentity ? 'other' : token ?? owner } }, error: null }),
  },
  rpc,
  from(table: string) {
    let id = '', patch: Row | null = null
    const query = {
      select() { return query }, eq(_key: string, value: string) { id = value; return query },
      abortSignal() { return query }, single() { return query }, maybeSingle() { return query }, order() { return query },
      setHeader() { return query }, update(value: Row) { patch = value; return query },
      then(resolve: (value: unknown) => void) {
        if (table !== 'profiles') return Promise.resolve({ data: [], error: null }).then(resolve)
        if (patch) {
          writes.push({ id, patch }); Object.assign(profiles[id], patch)
          return Promise.resolve({ data: { id }, error: null }).then(resolve)
        }
        return new Promise(r => pending.push({ id, resolve: r })).then(resolve)
      },
    }
    return query
  },
}
