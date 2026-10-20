import { useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Home from '../../src/app/page'
import { focusControl } from './authFocusMocks'
import * as accounting from './accountingLoadMocks'
import { withdrawalMock } from './withdrawalMocks'
import { requireProfileContext } from '../../src/lib/profileContext'

// The real Home, useAuth, useAccountingData, boundary, dashboard and modal run
// together. Only network dependencies and unrelated panels are replaced.
function Harness() {
  useLayoutEffect(() => {
    Object.assign(window, { focusTest: {
      event: (owner: string | null, event?: string) => flushSync(() => focusControl.event(owner, event)),
      pendingProfiles: focusControl.pending,
      finishProfile: focusControl.finish,
      installVisibilityRecovery: focusControl.installVisibilityRecovery,
      accountingPending: () => accounting.pending.map(({ group, owner, year, kind }) => ({ group, owner, year, kind })),
      finishAccounting: accounting.finish,
      withdrawal: withdrawalMock,
      canWrite: () => { try { requireProfileContext(); return true } catch { return false } },
    } })
  }, [])
  return <Home />
}
createRoot(document.getElementById('root')!).render(<Harness />)
