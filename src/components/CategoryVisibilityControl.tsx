'use client'

interface Props {
  name: string
  hidden: boolean | undefined
  disabled: boolean
  onToggle: () => void
}

export default function CategoryVisibilityControl({ name, hidden, disabled, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span>{hidden === true ? 'Dold vid ny bokföring' : hidden === false ? 'Visas vid ny bokföring' : 'Synlighet kunde inte läsas'}</span>
      <button type="button" onClick={onToggle} disabled={disabled || typeof hidden !== 'boolean'}
        aria-label={hidden ? 'Visa igen: ' + name : 'Dölj vid ny bokföring: ' + name}
        className="rounded-lg border px-3 py-2 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
        {hidden ? 'Visa igen' : 'Dölj'}
      </button>
    </div>
  )
}
