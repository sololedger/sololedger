// Presentation only: preserve the signed bookkeeping/report value at the boundary.
export function vatNetPresentation(net: number) {
  return {
    label: net < 0 ? 'Moms att få tillbaka' : net > 0 ? 'Moms att betala' : 'Moms i balans',
    amount: Math.abs(net),
    tone: net < 0 ? 'text-emerald-600' : net > 0 ? 'text-red-500' : 'text-gray-600',
  }
}
