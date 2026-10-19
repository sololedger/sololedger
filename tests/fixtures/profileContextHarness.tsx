import React, { useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useAuth } from '../../src/hooks/useAuth'
import ProfileSettings from '../../src/components/ProfileSettings'
import { bookStandardBookingAttempt } from '../../src/lib/accountingService'
import { verifiedProfileRpc } from '../../src/lib/profileWriteGuard'
import { control } from './profileContextMocks'
let latestAuth: ReturnType<typeof useAuth>
let prepared: Awaited<ReturnType<typeof verifiedProfileRpc>>
const oldVerifiers: (() => Promise<string>)[] = []
function Harness() {
  const auth = useAuth()
  useLayoutEffect(() => { latestAuth = auth }, [auth])
  return <><output id="state">{JSON.stringify({ user: auth.user?.id, profile: auth.profile, error: auth.profileError })}</output>
    {auth.profile && <ProfileSettings key={auth.profileContextKey} user={auth.user} profile={auth.profile}
      verifyProfile={auth.verifyProfile} onProfileUpdate={auth.setProfile} onUpdatePassword={async () => ({ success: true })}
      kontoplan={[]} kontoplanLoading={false} kontoplanLoaded={true} kontoplanError={null}
      paymentAccountRoles={[]} paymentAccountRolesLoading={false} paymentAccountRolesLoaded={true} paymentAccountRolesError={null}
      onRefreshPaymentAccountRoles={async () => {}} onSavePaymentAccountRole={async () => { throw Error('unused') }} onClearPaymentAccountRole={async () => {}} />}</>
}
Object.assign(window, { test: {
  ...control, prepare: async () => { prepared = await verifiedProfileRpc() },
  dispatchPrepared: async () => { try { await prepared.rpc('book_transaction_atomic', {}); return true } catch { return false } },
  unmount: () => root.unmount(),
  event: (id: string | null) => flushSync(() => control.event(id)),
  retry: () => { void latestAuth.retryProfile() },
  capture: () => oldVerifiers.push(latestAuth.verifyProfile) - 1,
  verifyOld: async (index: number) => { try { await oldVerifiers[index](); return true } catch { return false } },
  book: async () => {
    try {
      if (!latestAuth.user) return false
      await bookStandardBookingAttempt({ version: 1, userId: latestAuth.user.id, kind: 'ordinary', payload: {
        idempotency_key: crypto.randomUUID(), date: '2026-01-22', description: 'Synthetic', amount: 1250,
        type: 'programvaror', vat_rate: 25, input_vat_deduction_entitlement: 'profile_default', file_url: null,
      } })
      return true
    } catch { return false }
  },
} })
const root = createRoot(document.getElementById('root')!)
root.render(<Harness />)
