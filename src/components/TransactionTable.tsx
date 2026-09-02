'use client'
import { useState } from 'react'
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
  onFavorite: (tx: any) => void
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
  onFavorite,
}: TransactionTableProps) {

  // Paginering: visa 50 rader åt gången istället för att rendera en
  // potentiellt tusentals rader lång lista (t.ex. efter en stor SIE-import).
  const [visibleCount, setVisibleCount] = useState(50)

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

  // ── Beräkna all härledd data EN gång per transaktion ──────────────
  // Delas mellan desktop-tabellen och mobil-kortvyn så logiken aldrig kan glida isär.
  const enriched = transactions.map((tx) => {
    const journal = journalMap[tx.id] || []
    const isCorrection = tx.is_correction === true
    const verNr = journal[0]?.ver_nr
    const isNeutralized = !isCorrection && verNr != null && neutralizedVerNrs.has(verNr)

    // Importerade SIE-verifikationer har varken en enskild kategori (type)
    // eller en enskild momssats (vat_rate) - de kan ha godtyckligt många
    // motkonton och representerar ingen "affärshändelse" i samma mening
    // som en manuellt bokförd rad. isIncome beräknas därför INTE för dem:
    // att låta accountDef bli undefined och tyst falla tillbaka till
    // isIncome=false skulle visa en importerad intäkt som en röd utgift.
    // Samma resonemang gäller isOpeningBalance - en ingående balans är
    // varken en inkomst eller en utgift, den har ingen +/- riktning alls.
    const isImported = tx.source === 'sie_import'
    const isOpeningBalance = tx.source === 'sie_opening_balance'
    const accountDef = kontoplan.find(k => k.id === tx.type)
    const isIncome = !isImported && !isOpeningBalance && ((accountDef?.credit_account?.startsWith('3') || tx.type === 'egen_insättning') ?? false)

    const rowClass = isCorrection
      ? 'bg-amber-50/70 opacity-80'
      : isNeutralized
      ? 'bg-gray-50 opacity-60'
      : editingId === tx.id
      ? 'bg-amber-50/50'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50/40 hover:bg-sky-50/60'
      : 'hover:bg-gray-50/50'

    const textClass = isCorrection
      ? 'text-amber-600 line-through'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : (isImported || isOpeningBalance)
      ? 'text-sky-900'
      : 'text-gray-700'

    const verClass = isCorrection
      ? 'text-amber-400 line-through'
      : isNeutralized
      ? 'text-gray-300 line-through'
      : (isImported || isOpeningBalance)
      ? 'text-sky-500'
      : 'text-emerald-600'

    // Neutral blå ton för importer/öppningsbalans istället för grönt/rött -
    // ingen av dem har en entydig "inkomst eller utgift"-riktning.
    const amountClass = isCorrection
      ? 'text-amber-400 line-through'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : (isImported || isOpeningBalance)
      ? 'text-sky-700'
      : isIncome
      ? 'text-emerald-600'
      : 'text-rose-600'

    const badgeClass = isCorrection
      ? 'bg-amber-50 border-amber-100 text-amber-400'
      : isNeutralized
      ? 'bg-gray-50 border-gray-100 text-gray-300'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50 border-sky-100 text-sky-600'
      : 'bg-gray-50 border-gray-100 text-gray-500'

    const sortedJournal = [...journal].sort((a: any, b: any) => (Number(b.debit) > 0 ? -1 : 1))

    return {
      tx, journal: sortedJournal, isCorrection, verNr, isNeutralized, isImported, isOpeningBalance,
      accountDef, isIncome, rowClass, textClass, verClass, amountClass, badgeClass,
    }
  })

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
        <p className="p-12 text-center text-gray-300 italic font-medium">
          Inga transaktioner bokförda för {selectedYear}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* ══════════════════════ DESKTOP: TABELL (md och uppåt) ══════════════════════ */}
      <div className="hidden md:block bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
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
            {enriched.slice(0, visibleCount).map(({ tx, journal, isCorrection, verNr, isNeutralized, isImported, isOpeningBalance, accountDef, isIncome, rowClass, textClass, verClass, amountClass, badgeClass }) => (
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
                  {/* Ingående balans har ingen egen SIE-serie/nummer (source_ver_series/
                      source_ver_number är null för den) - visa därför ingen referensrad
                      alls här istället för en tom "SIE " som skulle se trasig ut. */}
                  {isImported && (
                    <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">
                      SIE {tx.source_ver_series}{tx.source_ver_number}
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
                    ) : isOpeningBalance ? (
                      <p className="text-[10px] font-black text-sky-500 uppercase">
                        Ingående balans
                      </p>
                    ) : isImported ? (
                      <p className="text-[10px] font-black text-sky-500 uppercase">
                        Importerad verifikation
                      </p>
                    ) : (
                      <p className="text-[10px] font-black text-emerald-500 uppercase">
                        {accountDef?.name || tx.type}
                      </p>
                    )}

                    {/* Momsbadgen gäller bara affärshändelser - importer och
                        ingående balans har ingen enskild momssats (vat_rate är
                        null), se arkitekturanalysen. */}
                    {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (
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
                <td className={`p-8 text-right font-black text-lg whitespace-nowrap ${amountClass}`}>
                  {/* Inget +/- tecken för importer eller ingående balans: ingen av
                      dem har en entydig inkomst/utgift-riktning. */}
                  {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                  {tx.amount.toLocaleString()} kr
                </td>

                {/* ── BOKFÖRING ── */}
                <td className="p-8">
                  <div className="flex flex-wrap gap-1.5">
                    {journal.map((e: any) => {
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
                    {/* Redigeringsformuläret representerar en enskild kategoriserad
                        rad och kan inte visa/ändra en N-radig SIE-verifikation
                        eller en ingående balans korrekt - döljs därför helt
                        istället för att visa ett formulär som tyst tappar data.
                    {/* Redigeringsformuläret representerar en enskild kategoriserad
                        rad och kan inte visa/ändra en N-radig SIE-verifikation
                        eller en ingående balans korrekt - döljs därför helt
                        istället för att visa ett formulär som tyst tappar data.
                        Korrigering döljs nu också för importerad data och
                        ingående balans - SIE-data ska förbli den historiska
                        källrapportens speglade sanning, inte redigeras rad för
                        rad via appens vanliga korrigeringsflöde. En hel
                        importomgång kan istället tas bort/ångras separat (se
                        import_batches) den dagen den funktionen byggs. */}
                    {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && !isYearLocked && (
                      <button
                        onClick={() => onEdit(tx)}
                        className="text-gray-200 hover:text-emerald-600 transition-colors"
                        title="Redigera"
                      >
                        ✎
                      </button>
                    )}
                    {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && !isYearLocked && (
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
            ))}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════ MOBIL: KORTLISTA (under md) ══════════════════════ */}
      <div className="md:hidden flex flex-col gap-3">
        {enriched.slice(0, visibleCount).map(({ tx, journal, isCorrection, verNr, isNeutralized, isImported, isOpeningBalance, accountDef, isIncome, textClass, verClass, amountClass, badgeClass }) => (
          <div
            key={tx.id}
            className={`rounded-[1.75rem] border p-5 shadow-sm transition-colors ${
              isCorrection
                ? 'bg-amber-50/70 border-amber-100'
                : isNeutralized
                ? 'bg-gray-50 border-gray-100 opacity-70'
                : editingId === tx.id
                ? 'bg-amber-50/50 border-amber-200'
                : (isImported || isOpeningBalance)
                ? 'bg-sky-50/40 border-sky-100'
                : 'bg-white border-gray-100'
            }`}
          >
            {/* ── DATUM/VER + BELOPP ── */}
            <div className="flex justify-between items-start gap-3 mb-3">
              <div>
                <p className={`font-bold text-sm ${isCorrection ? 'text-amber-500' : isNeutralized ? 'text-gray-400' : 'text-gray-500'}`}>
                  {tx.date}
                </p>
                {verNr && (
                  <p className={`text-[10px] font-black italic ${verClass}`}>
                    VER-{verNr}
                  </p>
                )}
                {/* Ingående balans har ingen egen SIE-serie/nummer - ingen
                    referensrad här istället för en tom "SIE ". */}
                {isImported && (
                  <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">
                    SIE {tx.source_ver_series}{tx.source_ver_number}
                  </p>
                )}
              </div>
              <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                {tx.amount.toLocaleString()} kr
              </p>
            </div>

            {/* ── KATEGORI + BADGES ── */}
            <div className="flex items-center flex-wrap gap-2 mb-1.5">
              {isCorrection ? (
                <p className="text-[10px] font-black text-amber-500 uppercase">↩ Korrigering</p>
              ) : isNeutralized ? (
                <p className="text-[10px] font-black text-gray-300 uppercase line-through">
                  {accountDef?.name || tx.type}
                </p>
              ) : isOpeningBalance ? (
                <p className="text-[10px] font-black text-sky-500 uppercase">
                  Ingående balans
                </p>
              ) : isImported ? (
                <p className="text-[10px] font-black text-sky-500 uppercase">
                  Importerad verifikation
                </p>
              ) : (
                <p className="text-[10px] font-black text-emerald-500 uppercase">
                  {accountDef?.name || tx.type}
                </p>
              )}

              {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (
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

            {/* ── BESKRIVNING ── */}
            <p className={`font-bold text-sm mb-2 ${
              isCorrection
                ? 'text-amber-600 line-through text-xs pl-3 border-l-2 border-amber-200'
                : textClass
            }`}>
              {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
            </p>

            {tx.file_url && !isNeutralized && (
              <button
                onClick={() => handleOpenAttachment(tx.file_url)}
                className="text-emerald-400 text-xs mb-2 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
              >
                📎 Visa bilaga
              </button>
            )}

            {/* ── BOKFÖRING (badges) ── */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {journal.map((e: any) => {
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

            {/* ── ÅTGÄRDER (riktiga touch-knappar, inte bara ikoner) ── */}
            {/* Hela raden döljs för importerad data och ingående balans - se
                motsvarande kommentar i desktopvyn ovan för resonemanget. */}
            {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && !isYearLocked && (
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => onEdit(tx)}
                  className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 font-black text-[10px] uppercase tracking-wide transition-colors"
                >
                  ✎ Redigera
                </button>
                <button
                  onClick={() => onDelete(tx)}
                  className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-500 font-black text-[10px] uppercase tracking-wide transition-colors"
                >
                  ✕ Korrigera
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* "Visa fler" - gäller båda vyerna eftersom desktop/mobil bara skiljs
          åt med CSS (hidden md:block / md:hidden), inte villkorad rendering. */}
      {enriched.length > visibleCount && (
        <div className="flex justify-center pt-6 pb-2">
          <button
            onClick={() => setVisibleCount(prev => prev + 50)}
            className="px-8 h-11 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-wider transition-colors border border-gray-100"
          >
            Visa fler ({enriched.length - visibleCount} kvar)
          </button>
        </div>
      )}
    </>
  )
}