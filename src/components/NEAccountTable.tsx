'use client'
import { Fragment, useEffect, useState } from 'react'
import type { NeReviewAccount, NeReviewEntry } from '@/lib/neReview'
import type { NeAccountCoverage } from '@/lib/neAccountCoverage'
import { getBasAccountHelp } from '@/lib/accountingKnowledge'
async function getNeReviewEntries(owner: string, year: number, account: string, period: 'annual' | 'cumulative', balance: number) {
  return (await import('@/lib/neReviewService')).getNeReviewEntries(owner, year, account, period, balance)
}
const money = (value: number) => `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`
const decisionBasis: Record<string, string> = { small_business_exempt: 'bekräftat småföretagarundantag vid bokningen', taxable: 'momspliktigt försäljningsunderlag vid bokningen', reviewed_legacy: 'granskat historiskt underlag', inherited_correction: 'ärvt beslut från den rättade bokningen' }
type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
function message(error: unknown) { return error instanceof Error ? error.message : 'Underlaget kunde inte läsas fullständigt.' }
function EntryList({ owner, year, account }: { owner: string; year: number; account: NeReviewAccount }) {
  const [state, setState] = useState<Load<NeReviewEntry[]>>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    getNeReviewEntries(owner, year, account.accountNumber, account.period, account.balance).then(data => {
      if (!cancelled) setState({ status: 'ready', data })
    }).catch(error => { if (!cancelled) setState({ status: 'error', message: message(error) }) })
    return () => { cancelled = true }
  }, [owner, year, account.accountNumber, account.period, account.balance])
  if (state.status === 'loading') return <p role="status">Läser bokföringsposter…</p>
  if (state.status === 'error') return <p role="alert" className="text-amber-950">Ofullständigt underlag: {state.message}</p>
  return <div className="mt-3">
    <p className="mb-2 text-xs text-gray-600">Alla {state.data.length} journalrader. Original, rättelser och ingående balans behålls.</p>
    <table className="w-full table-fixed text-left text-sm">
      <caption className="sr-only">Bokföringsposter för konto {account.accountNumber}</caption>
      <thead className="hidden md:table-header-group bg-gray-100 text-xs text-gray-600"><tr>
        <th className="w-28 p-2">Datum</th><th className="w-24 p-2">Verifikation</th><th className="p-2">Beskrivning</th><th className="w-28 p-2 text-right">Debet</th><th className="w-28 p-2 text-right">Kredit</th>
      </tr></thead>
      <tbody className="block md:table-row-group">{state.data.map(row => <tr key={row.id} className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-3 md:mb-0 md:table-row md:border-x-0 md:p-0">
        <td className="md:p-2 align-top"><span className="block text-xs text-gray-500 md:hidden">Datum</span>{row.date}{row.journalDate !== row.date && <small className="block">Journalrad: {row.journalDate}</small>}</td>
        <td className="md:p-2 align-top"><span className="block text-xs text-gray-500 md:hidden">Verifikation</span>{row.verNr == null ? 'Nummer saknas' : 'VER-'+row.verNr}</td>
        <td className="col-span-2 break-words md:p-2 align-top"><span className="block text-xs text-gray-500 md:hidden">Beskrivning</span><p>{row.description}</p>
          {row.rowDescription && row.rowDescription !== row.description && <p className="text-xs text-gray-600">Journalrad: {row.rowDescription}</p>}
          {account.accountNumber === '3010' && <p className="mt-1 text-xs text-gray-600">{row.decision
            ? 'Sparat historiskt beslut: '+row.decision.row+'. Beslutsgrund: '+(decisionBasis[row.decision.basis] ?? 'okänd beslutsgrund; behöver granskas')+'.'
            : Number(row.vatRate ?? 0) === 0 && (row.debit !== 0 || row.credit !== 0)
              ? 'Sparat R1/R2-beslut saknas. Fördelningen behöver granskas.'
              : 'Befintlig R1-koppling enligt bokföringsunderlaget; dagens momsprofil används inte.'}</p>}
        </td>
        <td className="md:p-2 md:text-right align-top"><span className="block text-xs text-gray-500 md:hidden">Debet</span>{money(row.debit)}</td>
        <td className="md:p-2 md:text-right align-top"><span className="block text-xs text-gray-500 md:hidden">Kredit</span>{money(row.credit)}</td>
      </tr>)}</tbody>
    </table>
    {state.data.length === 0 && <p>Inga bokföringsposter i perioden.</p>}
  </div>
}

type AccountRow = NeAccountCoverage & Partial<Pick<NeReviewAccount, 'name' | 'nameSource' | 'contribution'>>
function AccountRows({ row, owner, year }: { row: AccountRow; owner?: string; year: number }) {
  const [open, setOpen] = useState(false)
  const help = getBasAccountHelp(row.accountNumber)
  const account: NeReviewAccount = { ...row, name: row.name ?? help ?? 'Kontonamn saknas', nameSource: row.nameSource ?? (help ? 'SoloLedgers BAS-hjälp; inte verifierat importnamn' : 'Inget verifierat namn tillgängligt') }
  return <Fragment>
    <tr className="grid grid-cols-2 gap-2 border-t border-gray-200 p-3 md:table-row md:p-0">
      <td className="font-semibold md:p-3 align-top"><span className="block text-xs font-normal text-gray-500 md:hidden">Konto</span>{row.accountNumber}</td>
      <td className="break-words md:p-3 align-top"><span className="block text-xs text-gray-500 md:hidden">Kontonamn</span>{account.name}</td>
      <td className="md:p-3 md:text-right align-top"><span className="block text-xs text-gray-500 md:hidden">Belopp</span>{money(row.balance)}<small className="block text-gray-500">{row.period === 'annual' ? 'Årets rörelse' : 'Till årets slut'}</small></td>
      <td className="break-words md:p-3 align-top"><span className="block text-xs text-gray-500 md:hidden">NE-koppling</span>{row.handling}</td>
      <td className="col-span-2 md:p-3 align-top"><span className="text-xs text-gray-600">{row.status === 'review' ? 'Behöver granskas' : row.status === 'excluded' ? 'Undantaget från direkt koppling' : 'Känd koppling'}</span>
        <details onToggle={event => setOpen(event.currentTarget.open)}>
          <summary aria-label={"Visa bokföringsposter för "+row.accountNumber} className="min-h-11 cursor-pointer py-2 font-medium text-gray-800">Visa detaljer</summary>
          {open && <div className="py-2 text-xs md:hidden"><p>{row.reason}</p><p>Namnkälla: {account.nameSource}</p></div>}
        </details>
      </td>
    </tr>
    {open && <tr className="block md:table-row"><td colSpan={5} className="block min-w-0 bg-gray-50 p-3 md:table-cell">
      <div className="hidden md:block text-sm"><p>{row.reason}</p><p className="text-xs text-gray-500">Namnkälla: {account.nameSource}</p></div>
      {row.balance === 0 && <p className="text-sm">Använt konto med nettosaldo 0.</p>}
      {row.contribution !== undefined && <p className="text-sm font-medium">Bidrag till denna R-ruta: {money(row.contribution)}</p>}
      <p className="mt-1 text-xs text-gray-600">Kontosaldo: debet minus kredit.</p>
      {owner ? <EntryList key={owner+':'+year+':'+row.period+':'+row.accountNumber+':'+row.balance} owner={owner} year={year} account={account} /> : <p>Öppna Kontrollera NE-underlaget för journalspårning.</p>}
    </td></tr>}
  </Fragment>
}
export default function NEAccountTable({ rows, owner, year }: { rows: AccountRow[]; owner?: string; year: number }) {
  return <table className="w-full table-fixed text-left text-sm">
    <caption className="sr-only">Kontounderlag med NE-kopplingar</caption>
    <thead className="hidden md:table-header-group bg-gray-50 text-xs text-gray-600"><tr>
      <th className="w-20 p-3">Konto</th><th className="p-3">Kontonamn</th><th className="w-36 p-3 text-right">Belopp</th><th className="w-32 p-3">NE-koppling</th><th className="w-52 p-3">Kopplingsstatus / detaljer</th>
    </tr></thead>
    <tbody className="block md:table-row-group">{rows.map(row => <AccountRows key={(owner ?? '')+':'+year+':'+row.period+':'+row.accountNumber+':'+row.balance} row={row} owner={owner} year={year} />)}</tbody>
  </table>
}
