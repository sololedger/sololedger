'use client'
import { supabase } from '@/lib/supabaseClient'

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

  // Bygg ett set av alla ver_nr som har blivit korrigerade
  const neutralizedVerNrs = new Set(
    transactions
      .filter(tx => tx.is_correction && tx.corrects_ver_nr != null)
      .map(tx => tx.corrects_ver_nr)
  )

  // Separat funktion för att öppna bilaga — undviker await direkt i JSX
  async function handleOpenAttachment(fileUrl: string) {
    try {
      const { data } = await supabase.storage
        .from('attachments')
        .createSignedUrl(fileUrl, 60)

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      } else {
        alert('Kunde inte hämta bilagan. Kontrollera att du har behörighet.')
      }
    } catch (err) {
      alert('Något gick fel vid hämtning av bilagan. Försök igen.')
    }
  }

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
              const verNr = journal[0]?.ver_nr
              const isNeutralized = !isCorrection && verNr != null && neutralizedVerNrs.has(verNr)

              const accountDef = kontoplan.find(k => k.id === tx.type)
              const isIncome = (accountDef?.credit_account?.startsWith('3') || tx.type === 'egen_insättning') ?? false

              // ── Radklasser per typ ──────────────────────────────────
              const rowClass = isCorrection
                ? 'bg-amber-50/70 opacity-80'
                : isNeutralized
                ? 'bg-gray-50 opacity-60'
                : editingId === tx.id
                ? 'bg-amber-50/50'
                : 'hover:bg-gray-50/50'

              // ── Textfärg datum/beskrivning per typ ─────────────────
              const textClass = isCorrection
                ? 'text-amber-600 line-through'
                : isNeutralized
                ? 'text-gray-400 line-through'
                : 'text-gray-700'

              // ── VER-nr färg per typ ─────────────────────────────────
              const verClass = isCorrection
                ? 'text-amber-400 line-through'
                : isNeutralized
                ? 'text-gray-300 line-through'
                : 'text-emerald-600'

              // ── Beloppsfärg per typ ─────────────────────────────────
              const amountClass = isCorrection
                ? 'text-amber-400 line-through'
                : isNeutralized
                ? 'text-gray-400 line-through'
                : isIncome
                ? 'text-emerald-600'
                : 'text-rose-600'

              // ── Kontoplan-badge färg per typ ────────────────────────
              const badgeClass = isCorrection
                ? 'bg-amber-50 border-amber-100 text-amber-400'
                : isNeutralized
                ? 'bg-gray-50 border-gray-100 text-gray-300'
                : 'bg-gray-50 border-gray-100 text-gray-500'

              return (
                <tr key={tx.id} className={`transition-colors ${rowClass}`}>

                  {/* ── DATUM / VER ── */}
                  <td className="p-8 font-bold text-gray-400 text-sm">
                    <span className={isCorrection ? 'text-amber-500' : isNeutralized ? 'text-gray-400' : ''}>
                      {tx.date}
                    </span>
                    {verNr && (
                      <p className={`text-[10px] font-black italic ${verClass}`}>
                        VER-{verNr}
                      </p>
                    )}
                  </td>

                  {/* ── HÄNDELSE ── */}
                  <td className="p-8">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      {isCorrection ? (
                        <p className="text-[10px] font-black text-amber-500 uppercase">
                          ↩ Korrigering
                        </p>
                      ) : isNeutralized ? (
                        <p className="text-[10px] font-black text-gray-300 uppercase line-through">
                          {accountDef?.name || tx.type}
                        </p>
                      ) : (
                        <p className="text-[10px] font-black text-emerald-500 uppercase">
                          {accountDef?.name || tx.type}
                        </p>
                      )}

                      {!isCorrection && !isNeutralized && (
                        <span className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200">
                          Moms: {tx.vat_rate}%
                        </span>
                      )}

                      {tx.booked && !isCorrection && !isNeutralized && (
                        <span className="text-[8px] font-black uppercase text-gray-300 border border-gray-200 px-1.5 py-0.5 rounded-md">
                          Låst
                        </span>
                      )}
                    </div>

                    <p className={`font-bold ${
                      isCorrection
                        ? 'text-amber-600 line-through text-xs pl-4 border-l-2 border-amber-200'
                        : textClass
                    }`}>
                      {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
                    </p>

                    {tx.file_url && !isNeutralized && (
                      <button
                        onClick={() => handleOpenAttachment(tx.file_url)}
                        className="text-emerald-400 text-xs mt-1 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        📎 Visa bilaga
                      </button>
                    )}
                  </td>

                  {/* ── BELOPP ── */}
                  <td className={`p-8 text-right font-black text-lg ${amountClass}`}>
                    {!isCorrection && !isNeutralized && (isIncome ? '+ ' : '- ')}
                    {tx.amount.toLocaleString()} kr
                  </td>

                  {/* ── BOKFÖRING ── */}
                  <td className="p-8">
                    <div className="flex flex-wrap gap-1.5">
                      {journal
                        .sort((a: any, b: any) => Number(b.debit) > 0 ? -1 : 1)
                        .map((e: any) => {
                          const isDebit = Number(e.debit) > 0
                          return (
                            <span
                              key={e.id}
                              className={`inline-flex items-center gap-0.5 border rounded-lg px-2 py-1 font-mono text-[10px] font-bold ${badgeClass}`}
                            >
                              {e.account_number}
                              <span className={
                                isCorrection || isNeutralized
                                  ? 'text-gray-300'
                                  : isDebit
                                  ? 'text-emerald-500'
                                  : 'text-orange-400'
                              }>
                                {isDebit ? ' D' : ' K'}
                              </span>
                            </span>
                          )
                        })}
                    </div>
                  </td>

                  {/* ── ÅTGÄRD ── */}
                  <td className="p-8 text-right pr-12">
                    <div className="flex items-center justify-end gap-4">
                      {!isCorrection && !isNeutralized && !isYearLocked && (
                        <button
                          onClick={() => onEdit(tx)}
                          className="text-gray-200 hover:text-emerald-600 transition-colors"
                          title="Redigera"
                        >
                          ✎
                        </button>
                      )}
                      {!isCorrection && !isNeutralized && !isYearLocked && (
                        <button
                          onClick={() => onDelete(tx)}
                          className="text-red-100 hover:text-red-500 font-bold transition-colors"
                          title="Korrigera"
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
