'use client'

interface TransactionTableProps {
  transactions: any[]
  journalMap: any
  kontoplan: any[]
  isYearLocked: boolean
  editingId: string | null
  selectedYear: number
  onEdit: (tx: any) => void
  onDelete: (tx: any) => void
}

export default function TransactionTable({
  transactions,
  journalMap,
  kontoplan,
  isYearLocked,
  editingId,
  selectedYear,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-gray-50 text-[9px] font-black uppercase text-gray-400 tracking-widest border-b">
          <tr>
            <th className="p-8">Datum / Ver</th>
            <th className="p-8">Händelse</th>
            <th className="p-8 text-right">Belopp</th>
            <th className="p-8">Bokföring</th>
            <th className="p-8 text-right pr-12">Åtgärd</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-12 text-center text-gray-300 italic font-medium">
                Inga transaktioner bokförda för {selectedYear}
              </td>
            </tr>
          ) : (
            transactions.map((tx) => {
              const journal = journalMap[tx.id] || []
              const isCorrection = tx.is_correction === true

              // Robust inkomstcheck: kolla credit_account på kontodefinitionen
              // istället för kontonamnet — fungerar oavsett vad kontot heter
              const accountDef = kontoplan.find(k => k.id === tx.type)
              const isIncome = accountDef?.credit_account?.startsWith('3') ?? false

              return (
                <tr
                  key={tx.id}
                  className={`transition-colors ${
                    isCorrection
                      ? 'bg-amber-50/60 opacity-75'
                      : editingId === tx.id
                        ? 'bg-amber-50/50'
                        : 'hover:bg-gray-50/50'
                  }`}
                >
                  <td className="p-8 font-bold text-gray-400 text-sm">
                    {isCorrection ? (
                      <span className="text-amber-500">{tx.date}</span>
                    ) : (
                      tx.date
                    )}
                    {journal[0]?.ver_nr && (
                      <p className={`text-[10px] font-black italic ${isCorrection ? 'text-amber-400' : 'text-emerald-600'}`}>
                        VER-{journal[0].ver_nr}
                      </p>
                    )}
                  </td>

                  <td className="p-8">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      {isCorrection ? (
                        <p className="text-[10px] font-black text-amber-500 uppercase flex items-center gap-1">
                          ↩ Korrigering
                        </p>
                      ) : (
                        <p className="text-[10px] font-black text-emerald-500 uppercase">
                          {kontoplan.find(k => k.id === tx.type)?.name || tx.type}
                        </p>
                      )}
                      {!isCorrection && (
                        <span className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200">
                          Moms: {tx.vat_rate}%
                        </span>
                      )}
                      {tx.booked && !isCorrection && (
                        <span className="text-[8px] font-black uppercase text-gray-300 border border-gray-200 px-1.5 py-0.5 rounded-md">
                          Låst
                        </span>
                      )}
                    </div>
                    <p className={`font-bold ${isCorrection ? 'text-amber-600 text-xs pl-4 border-l-2 border-amber-200' : 'text-gray-700'}`}>
                      {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
                    </p>
                    {tx.file_url && (
                      <a
                        href={tx.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 text-xs mt-1 inline-block hover:text-emerald-600"
                      >
                        📎 Visa bilaga
                      </a>
                    )}
                  </td>

                  <td className={`p-8 text-right font-black text-lg ${
                    isCorrection
                      ? 'text-amber-400 line-through'
                      : isIncome
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  }`}>
                    {!isCorrection && (isIncome ? '+ ' : '- ')}
                    {tx.amount.toLocaleString()} kr
                  </td>

                  <td className="p-8">
                    <div className="flex flex-wrap gap-1.5">
                      {journal
                        .sort((a: any, b: any) => Number(b.debit) > 0 ? -1 : 1)
                        .map((e: any) => {
                          const isDebit = Number(e.debit) > 0
                          return (
                            <span
                              key={e.id}
                              className={`inline-flex items-center gap-0.5 border rounded-lg px-2 py-1 font-mono text-[10px] font-bold ${
                                isCorrection
                                  ? 'bg-amber-50 border-amber-100 text-amber-400'
                                  : 'bg-gray-50 border-gray-100 text-gray-500'
                              }`}
                            >
                              {e.account_number}
                              <span className={isDebit ? 'text-emerald-500' : 'text-orange-400'}>
                                {isDebit ? ' D' : ' K'}
                              </span>
                            </span>
                          )
                        })}
                    </div>
                  </td>

                  <td className="p-8 text-right pr-12">
                    <div className="flex items-center justify-end gap-4">
                      {!isCorrection && !isYearLocked && (
                        <button
                          onClick={() => onEdit(tx)}
                          className="text-gray-200 hover:text-emerald-600 transition-colors"
                          title="Redigera beskrivning/datum/bilaga"
                        >
                          ✎
                        </button>
                      )}
                      {!isCorrection && !isYearLocked && (
                        <button
                          onClick={() => onDelete(tx)}
                          className="text-red-100 hover:text-red-500 font-bold transition-colors"
                          title="Skapa korrigeringsverifikation"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}