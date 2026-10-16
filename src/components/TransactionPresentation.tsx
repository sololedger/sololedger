import type { HistoryPresentation } from '@/lib/transactionHistoryPresentation'

// Shared by the ordinary desktop/mobile views and expanded attachment groups.
export default function TransactionPresentation({ presentation, original }: {
  presentation: HistoryPresentation
  original: string
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="break-words text-sm font-bold text-gray-800">{presentation.title}</p>
      {presentation.badge && (
        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
          {presentation.badge}
        </span>
      )}
      {presentation.explanation && <p className="text-xs text-gray-600">{presentation.explanation}</p>}
      <details className="text-xs text-gray-600">
        <summary className="w-fit cursor-pointer rounded py-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-600">
          Visa originalbeskrivning
        </summary>
        <p className="mt-1 whitespace-pre-wrap break-words">{original}</p>
      </details>
    </div>
  )
}
