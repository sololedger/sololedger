import React, { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import ProfileSettings from '../../src/components/ProfileSettings'
import type { ProfileSettingsDraft } from '../../src/lib/profileSettingsDraft'
import { useAuth } from '../../src/hooks/useAuth'
import { bookStandardBookingAttempt } from '../../src/lib/accountingService'
import { control } from './profileContextMocks'

let latest: ReturnType<typeof useAuth>
let navigate: (visible: boolean) => void
function Session({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [draft, setDraft] = useState<ProfileSettingsDraft | null>(null)
  const [visible, setVisible] = useState(true)
  useLayoutEffect(() => { navigate = setVisible }, [])
  return <><output id="saved">{JSON.stringify(auth.profile)}</output>
    {visible && auth.profile && <ProfileSettings key={auth.profileContextKey} user={auth.user} profile={auth.profile}
      draft={draft} onDraftChange={setDraft} verifyProfile={auth.verifyProfile} onProfileUpdate={auth.setProfile}
      onUpdatePassword={async () => ({ success: true })}
      kontoplan={[{id:'bank',name:'Bank',debit_account:'1930',credit_account:'3001'},{id:'private',name:'Privat',debit_account:'2018',credit_account:'1930'}]} kontoplanLoading={false} kontoplanLoaded={true} kontoplanError={null}
      paymentAccountRoles={[]} paymentAccountRolesLoading={false} paymentAccountRolesLoaded={true} paymentAccountRolesError={null}
      onRefreshPaymentAccountRoles={async () => {}} onSavePaymentAccountRole={async () => { throw Error('unused') }} onClearPaymentAccountRole={async () => {}} />}</>
}
function Harness() {
  const auth = useAuth()
  useLayoutEffect(() => { latest = auth }, [auth])
  return <Session key={auth.user?.id ?? 'signed-out'} auth={auth} />
}
Object.assign(window, { test: { ...control,
  event: (id: string | null) => flushSync(() => control.event(id)),
  navigate: (visible: boolean) => flushSync(() => navigate(visible)),
  retry: () => { void latest.retryProfile() },
  book: () => bookStandardBookingAttempt({ version: 1, userId: latest.user!.id, kind: 'ordinary', payload: {
    idempotency_key: crypto.randomUUID(), date: '2026-01-22', description: 'Synthetic', amount: 1250,
    type: 'programvaror', vat_rate: 25, input_vat_deduction_entitlement: 'profile_default', file_url: null,
  } }),
} })
createRoot(document.getElementById('root')!).render(<Harness />)
