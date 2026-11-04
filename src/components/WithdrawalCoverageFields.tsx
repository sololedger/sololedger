export function withdrawalCoverageValue(confirmed: boolean, firstDate: string) {
  if (!confirmed) throw new Error('Bekräfta bara om underlaget verkligen omfattar tidigare åtaganden. Om du är osäker, kontrollera dem först.')
  return { from: firstDate, noEarlierObligations: true }
}

export default function WithdrawalCoverageFields({ confirmed, onChange }: { confirmed: boolean; onChange: (confirmed: boolean) => void }) {
  return <label className="flex gap-3 text-sm leading-relaxed">
    <input type="checkbox" className="mt-1 size-4 shrink-0 accent-emerald-700" checked={confirmed} onChange={event => onChange(event.target.checked)} />
    <span>Underlaget omfattar tidigare åtaganden; inga ytterligare äldre belopp saknas.</span>
  </label>
}
