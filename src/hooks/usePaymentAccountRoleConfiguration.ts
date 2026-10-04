import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearConfiguredPaymentAccountRole,
  getConfiguredPaymentAccountRoles,
  setConfiguredPaymentAccountRole,
} from '@/lib/paymentAccountRoles'
import {
  mergeConfiguredPaymentAccountRole,
  removeConfiguredPaymentAccountRole,
  type ConfiguredPaymentAccountRole,
  type PaymentAccountRole,
} from '@/lib/paymentAccountRoleState'

export function usePaymentAccountRoleConfiguration(userId: string | null | undefined) {
  const [configuredRoles, setConfiguredRoles] = useState<ConfiguredPaymentAccountRole[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    if (!userId) {
      setConfiguredRoles([])
      setLoaded(false)
      setError(null)
      setLoading(false)
      return
    }

    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setLoading(true)
    setError(null)

    try {
      const roles = await getConfiguredPaymentAccountRoles()
      if (requestId.current !== currentRequestId) return
      setConfiguredRoles(roles)
      setLoaded(true)
    } catch (err) {
      if (requestId.current !== currentRequestId) return
      setConfiguredRoles([])
      setLoaded(false)
      setError(
        err instanceof Error
          ? err.message
          : 'Kunde inte hämta betalningskonton.'
      )
    } finally {
      if (requestId.current === currentRequestId) {
        setLoading(false)
      }
    }
  }, [userId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void reload()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      requestId.current += 1
    }
  }, [reload])

  const saveRole = useCallback(
    async (role: PaymentAccountRole, accountNumber: string) => {
      const saved = await setConfiguredPaymentAccountRole(role, accountNumber)
      setConfiguredRoles(current =>
        mergeConfiguredPaymentAccountRole(current, saved)
      )
      setLoaded(true)
      setError(null)
      return saved
    },
    []
  )

  const clearRole = useCallback(async (role: PaymentAccountRole) => {
    await clearConfiguredPaymentAccountRole(role)
    setConfiguredRoles(current => removeConfiguredPaymentAccountRole(current, role))
    setLoaded(true)
    setError(null)
  }, [])

  return {
    configuredRoles,
    loading,
    loaded,
    error,
    reload,
    saveRole,
    clearRole,
  }
}
