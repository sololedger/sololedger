import type { ReactNode } from 'react'

export default function AccountingDataBoundary({ required = true, ready, error, year, onRetry, children }: {
  required?: boolean
  ready: boolean
  error: string | null
  year: number
  onRetry: () => void
  children: ReactNode
}) {
  if (!required || ready) return children
  return (
    <div role={error ? 'alert' : 'status'} className="rounded-2xl border bg-white p-6 text-gray-800">
      <p>{error ?? `Laddar ekonomiska uppgifter för ${year}…`}</p>
      {error && <button type="button" onClick={onRetry} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">Försök igen</button>}
    </div>
  )
}
