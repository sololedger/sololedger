'use client'

import { Fragment, useState } from 'react'
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
  // Paginering sker på VISUELLA rader. En ångrad SIE-import med t.ex.
  // 50 tekniska KORRVER räknas alltså som en rad tills den fälls ut.
  const [visibleCount, setVisibleCount] = useState(50)
  const [expandedUndoBatches, setExpandedUndoBatches] = useState<Set<string>>(new Set())

  const neutralizedVerNrs = new Set(
    transactions
      .filter(tx => tx.is_correction && tx.corrects_ver_nr != null)
      .map(tx => tx.corrects_ver_nr)
  )

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
    } catch {
      alert('Något gick fel vid hämtning av bilagan. Försök igen.')
    }
  }

  function toggleUndoBatch(batchId: string) {
    setExpandedUndoBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  function getUndoFilename(description: string | null | undefined) {
    if (!description) return 'SIE-import'

    // Beskrivningen från undo-RPC:n kan innehålla olika typer av bindestreck
    // beroende på tidigare/testad version, t.ex.
    // "Ångrad SIE-import: fil.se -- korrigering av VER-12"
    // eller "Ångrad SIE-import: fil.se — korrigering av VER-12".
    const match = description.match(
      /Ångrad SIE-import:\s*(.*?)\s*(?:—|–|--|-)\s*korrigering/i
    )

    return match?.[1]?.trim() || 'SIE-import'
  }

  const enriched = transactions.map((tx) => {
    const journal = journalMap[tx.id] || []
    const isCorrection = tx.is_correction === true
    const verNr = journal[0]?.ver_nr
    const isNeutralized = !isCorrection && verNr != null && neutralizedVerNrs.has(verNr)

    const isImported = tx.source === 'sie_import'
    const isOpeningBalance = tx.source === 'sie_opening_balance'
    const isSieUndo = tx.source === 'sie_import_undo'
    const accountDef = kontoplan.find(k => k.id === tx.type)

    // H5: historisk visning ska bygga på det som faktiskt bokfördes,
    // inte på hur kategorin ser ut i dagens kontoplan.
    const isIncome =
      !isImported &&
      !isOpeningBalance &&
      !isSieUndo &&
      (
        journal.some((e: any) =>
          String(e.account_number || '').startsWith('3') && Number(e.credit) > 0
        ) ||
        tx.type === 'egen_insättning'
      )

    // En KORRVER är i sig en giltig ny bokföringspost. Därför stryks inte
    // korrigeringsraden längre över. Det är ORIGINALVERIFIKATIONEN som
    // markeras neutraliserad och genomstruken.
    const rowClass = isCorrection
      ? 'bg-amber-50/55 hover:bg-amber-50/80'
      : isNeutralized
      ? 'bg-gray-50 opacity-60'
      : editingId === tx.id
      ? 'bg-amber-50/50'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50/40 hover:bg-sky-50/60'
      : 'hover:bg-gray-50/50'

    const textClass = isCorrection
      ? 'text-amber-700'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : (isImported || isOpeningBalance)
      ? 'text-sky-900'
      : 'text-gray-700'

    const verClass = isCorrection
      ? 'text-amber-500'
      : isNeutralized
      ? 'text-gray-300 line-through'
      : (isImported || isOpeningBalance)
      ? 'text-sky-500'
      : 'text-emerald-600'

    const amountClass = isCorrection
      ? 'text-amber-600'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : (isImported || isOpeningBalance)
      ? 'text-sky-700'
      : isIncome
      ? 'text-emerald-600'
      : 'text-rose-600'

    const badgeClass = isCorrection
      ? 'bg-amber-50 border-amber-200 text-amber-600'
      : isNeutralized
      ? 'bg-gray-50 border-gray-100 text-gray-300'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50 border-sky-100 text-sky-600'
      : 'bg-gray-50 border-gray-100 text-gray-500'

    const sortedJournal = [...journal].sort(
      (a: any, b: any) => (Number(b.debit) > 0 ? -1 : 1)
    )

    return {
      tx,
      journal: sortedJournal,
      isCorrection,
      verNr,
      isNeutralized,
      isImported,
      isOpeningBalance,
      isSieUndo,
      accountDef,
      isIncome,
      rowClass,
      textClass,
      verClass,
      amountClass,
      badgeClass,
    }
  })

  // Gruppindelning för AUTOMATISKA rättelser efter "Ångra SIE-import".
  // Vanliga KORRVER flyttas inte: de ligger kvar i datum-/VER-ordning så
  // bokföringens tidslinje och verifikationsföljd fortfarande är tydlig.
  const undoGroups = new Map<string, typeof enriched>()
  for (const item of enriched) {
    if (!item.isSieUndo || !item.tx.import_batch_id) continue
    const id = String(item.tx.import_batch_id)
    const existing = undoGroups.get(id) || []
    existing.push(item)
    undoGroups.set(id, existing)
  }

  type DisplayItem =
    | { kind: 'transaction'; item: (typeof enriched)[number] }
    | { kind: 'sieUndoGroup'; batchId: string; items: typeof enriched }

  const displayItems: DisplayItem[] = []
  const emittedUndoBatches = new Set<string>()

  for (const item of enriched) {
    if (item.isSieUndo && item.tx.import_batch_id) {
      const batchId = String(item.tx.import_batch_id)
      if (emittedUndoBatches.has(batchId)) continue
      emittedUndoBatches.add(batchId)
      displayItems.push({
        kind: 'sieUndoGroup',
        batchId,
        items: undoGroups.get(batchId) || [item],
      })
    } else {
      displayItems.push({ kind: 'transaction', item })
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
        <p className="p-12 text-center text-gray-300 italic font-medium">
          Inga transaktioner bokförda för {selectedYear}
        </p>
      </div>
    )
  }

  const visibleItems = displayItems.slice(0, visibleCount)

  return (
    <>
      {/* ══════════════════════ DESKTOP ══════════════════════ */}
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
            {visibleItems.map((displayItem) => {
              if (displayItem.kind === 'sieUndoGroup') {
                const { batchId, items } = displayItem
                const first = items[0]
                const verNrs = items
                  .map(i => Number(i.verNr))
                  .filter(n => Number.isFinite(n))
                  .sort((a, b) => a - b)
                const minVer = verNrs[0]
                const maxVer = verNrs[verNrs.length - 1]
                const expanded = expandedUndoBatches.has(batchId)
                const filename = getUndoFilename(first?.tx?.description)

                return (
                  <Fragment key={`undo-${batchId}`}>
                    <tr className="bg-amber-50/60 hover:bg-amber-50/90 transition-colors">
                      <td className="p-8 font-bold text-amber-600 text-sm">
                        {first?.tx?.date}
                        {verNrs.length > 0 && (
                          <p className="text-[10px] font-black italic text-amber-500">
                            {minVer === maxVer ? `VER-${minVer}` : `VER-${minVer}–${maxVer}`}
                          </p>
                        )}
                      </td>

                      <td className="p-8">
                        <p className="text-[10px] font-black text-amber-600 uppercase mb-1">
                          ↩ Ångrad SIE-import
                        </p>
                        <p className="font-bold text-amber-800">
                          {filename}
                        </p>
                        <p className="text-[10px] text-amber-600/70 font-bold mt-1">
                          {items.length} rättelseverifikationer skapades automatiskt
                        </p>
                      </td>

                      <td className="p-8 text-right">
                        <span className="text-[10px] font-black uppercase text-amber-500">
                          Neutraliserad
                        </span>
                      </td>

                      <td className="p-8">
                        <span className="inline-flex items-center border rounded-lg px-2 py-1 font-mono text-[10px] font-bold bg-amber-50 border-amber-200 text-amber-600">
                          {items.length} KORRVER
                        </span>
                      </td>

                      <td className="p-8 text-right pr-12">
                        <button
                          onClick={() => toggleUndoBatch(batchId)}
                          className="text-[10px] font-black uppercase tracking-wide text-amber-600 hover:text-amber-800 transition-colors"
                        >
                          {expanded ? 'Dölj detaljer ↑' : 'Visa detaljer ↓'}
                        </button>
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="bg-amber-50/25">
                        <td colSpan={5} className="px-8 py-5">
                          <div className="rounded-2xl border border-amber-100 bg-white/70 overflow-hidden divide-y divide-amber-50">
                            {items.map((detail) => (
                              <div
                                key={detail.tx.id}
                                className="grid grid-cols-[120px_1fr_auto] gap-4 items-center px-5 py-3"
                              >
                                <div>
                                  <p className="text-[10px] font-black text-amber-500">
                                    VER-{detail.verNr ?? '–'}
                                  </p>
                                  <p className="text-[9px] text-gray-400 font-bold">
                                    korrigerar VER-{detail.tx.corrects_ver_nr ?? '–'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-gray-600">
                                    {String(detail.tx.description || '').replace(/^↩\s*/, '')}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {detail.journal.map((e: any) => (
                                      <span
                                        key={e.id}
                                        className="border border-amber-100 bg-amber-50 text-amber-600 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold"
                                      >
                                        {e.account_number} {Number(e.debit) > 0 ? 'D' : 'K'}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <p className="font-black text-sm text-amber-600 whitespace-nowrap">
                                  {Number(detail.tx.amount || 0).toLocaleString('sv-SE')} kr
                                </p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              }

              const {
                tx,
                journal,
                isCorrection,
                verNr,
                isNeutralized,
                isImported,
                isOpeningBalance,
                accountDef,
                isIncome,
                rowClass,
                textClass,
                verClass,
                amountClass,
                badgeClass,
              } = displayItem.item

              return (
                <tr key={tx.id} className={`transition-colors ${rowClass}`}>
                  <td className="p-8 font-bold text-gray-400 text-sm">
                    <span className={isCorrection ? 'text-amber-600' : isNeutralized ? 'text-gray-400' : ''}>
                      {tx.date}
                    </span>
                    {verNr && (
                      <p className={`text-[10px] font-black italic ${verClass}`}>
                        VER-{verNr}
                      </p>
                    )}
                    {isImported && (
                      <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">
                        SIE {tx.source_ver_series}{tx.source_ver_number}
                      </p>
                    )}
                  </td>

                  <td className="p-8">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      {isCorrection ? (
                        <p className="text-[10px] font-black text-amber-600 uppercase">
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
                        ? 'text-amber-700 text-xs pl-4 border-l-2 border-amber-200'
                        : textClass
                    }`}>
                      {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
                    </p>

                    {isCorrection && tx.corrects_ver_nr != null && (
                      <p className="text-[9px] text-amber-500/80 font-bold mt-1 pl-4">
                        Rättar VER-{tx.corrects_ver_nr}
                      </p>
                    )}

                    {tx.file_url && !isNeutralized && (
                      <button
                        onClick={() => handleOpenAttachment(tx.file_url)}
                        className="text-emerald-400 text-xs mt-1 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        📎 Visa bilaga
                      </button>
                    )}
                  </td>

                  <td className={`p-8 text-right font-black text-lg whitespace-nowrap ${amountClass}`}>
                    {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </td>

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
                              isNeutralized
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

                  <td className="p-8 text-right pr-12">
                    <div className="flex items-center justify-end gap-4">
                      {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && !isYearLocked && (
                        <button
                          onClick={() => onEdit(tx)}
                          className="text-gray-200 hover:text-emerald-600 transition-colors"
                          title={tx.booked ? "Hantera bilaga" : "Redigera"}
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
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════ MOBIL ══════════════════════ */}
      <div className="md:hidden flex flex-col gap-3">
        {visibleItems.map((displayItem) => {
          if (displayItem.kind === 'sieUndoGroup') {
            const { batchId, items } = displayItem
            const first = items[0]
            const verNrs = items
              .map(i => Number(i.verNr))
              .filter(n => Number.isFinite(n))
              .sort((a, b) => a - b)
            const minVer = verNrs[0]
            const maxVer = verNrs[verNrs.length - 1]
            const expanded = expandedUndoBatches.has(batchId)
            const filename = getUndoFilename(first?.tx?.description)

            return (
              <div
                key={`mobile-undo-${batchId}`}
                className="rounded-[1.75rem] border border-amber-100 bg-amber-50/70 p-5 shadow-sm"
              >
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-bold text-sm text-amber-600">{first?.tx?.date}</p>
                    {verNrs.length > 0 && (
                      <p className="text-[10px] font-black italic text-amber-500">
                        {minVer === maxVer ? `VER-${minVer}` : `VER-${minVer}–${maxVer}`}
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] font-black uppercase text-amber-600 border border-amber-200 rounded-lg px-2 py-1">
                    {items.length} KORRVER
                  </span>
                </div>

                <p className="text-[10px] font-black text-amber-600 uppercase mt-3">
                  ↩ Ångrad SIE-import
                </p>
                <p className="font-bold text-amber-800 mt-1">{filename}</p>
                <p className="text-[10px] text-amber-600/70 font-bold mt-1">
                  {items.length} rättelseverifikationer skapades automatiskt
                </p>

                <button
                  onClick={() => toggleUndoBatch(batchId)}
                  className="w-full h-10 mt-4 rounded-xl bg-white/70 border border-amber-100 text-amber-600 font-black text-[10px] uppercase tracking-wide"
                >
                  {expanded ? 'Dölj detaljer ↑' : 'Visa detaljer ↓'}
                </button>

                {expanded && (
                  <div className="mt-3 rounded-xl border border-amber-100 bg-white/70 divide-y divide-amber-50 overflow-hidden">
                    {items.map(detail => (
                      <div key={detail.tx.id} className="p-3">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black text-amber-500">
                              VER-{detail.verNr ?? '–'} · rättar VER-{detail.tx.corrects_ver_nr ?? '–'}
                            </p>
                            <p className="text-xs font-bold text-gray-600 mt-1">
                              {String(detail.tx.description || '').replace(/^↩\s*/, '')}
                            </p>
                          </div>
                          <p className="font-black text-xs text-amber-600 whitespace-nowrap">
                            {Number(detail.tx.amount || 0).toLocaleString('sv-SE')} kr
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          const {
            tx,
            journal,
            isCorrection,
            verNr,
            isNeutralized,
            isImported,
            isOpeningBalance,
            accountDef,
            isIncome,
            textClass,
            verClass,
            amountClass,
            badgeClass,
          } = displayItem.item

          return (
            <div
              key={tx.id}
              className={`rounded-[1.75rem] border p-5 shadow-sm transition-colors ${
                isCorrection
                  ? 'bg-amber-50/60 border-amber-100'
                  : isNeutralized
                  ? 'bg-gray-50 border-gray-100 opacity-70'
                  : editingId === tx.id
                  ? 'bg-amber-50/50 border-amber-200'
                  : (isImported || isOpeningBalance)
                  ? 'bg-sky-50/40 border-sky-100'
                  : 'bg-white border-gray-100'
              }`}
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div>
                  <p className={`font-bold text-sm ${isCorrection ? 'text-amber-600' : isNeutralized ? 'text-gray-400' : 'text-gray-500'}`}>
                    {tx.date}
                  </p>
                  {verNr && (
                    <p className={`text-[10px] font-black italic ${verClass}`}>
                      VER-{verNr}
                    </p>
                  )}
                  {isImported && (
                    <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">
                      SIE {tx.source_ver_series}{tx.source_ver_number}
                    </p>
                  )}
                </div>

                <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                  {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                  {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2 mb-1.5">
                {isCorrection ? (
                  <p className="text-[10px] font-black text-amber-600 uppercase">↩ Korrigering</p>
                ) : isNeutralized ? (
                  <p className="text-[10px] font-black text-gray-300 uppercase line-through">
                    {accountDef?.name || tx.type}
                  </p>
                ) : isOpeningBalance ? (
                  <p className="text-[10px] font-black text-sky-500 uppercase">Ingående balans</p>
                ) : isImported ? (
                  <p className="text-[10px] font-black text-sky-500 uppercase">Importerad verifikation</p>
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
              </div>

              <p className={`font-bold text-sm mb-2 ${
                isCorrection
                  ? 'text-amber-700 text-xs pl-3 border-l-2 border-amber-200'
                  : textClass
              }`}>
                {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
              </p>

              {isCorrection && tx.corrects_ver_nr != null && (
                <p className="text-[9px] text-amber-500/80 font-bold mb-2 pl-3">
                  Rättar VER-{tx.corrects_ver_nr}
                </p>
              )}

              {tx.file_url && !isNeutralized && (
                <button
                  onClick={() => handleOpenAttachment(tx.file_url)}
                  className="text-emerald-400 text-xs mb-2 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
                >
                  📎 Visa bilaga
                </button>
              )}

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
                        isNeutralized
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

              {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && !isYearLocked && (
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => onEdit(tx)}
                    className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 font-black text-[10px] uppercase tracking-wide transition-colors"
                  >
                    ✎ {tx.booked ? "Hantera bilaga" : "Redigera"}
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
          )
        })}
      </div>

      {displayItems.length > visibleCount && (
        <div className="flex justify-center pt-6 pb-2">
          <button
            onClick={() => setVisibleCount(prev => prev + 50)}
            className="px-8 h-11 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-wider transition-colors border border-gray-100"
          >
            Visa fler ({displayItems.length - visibleCount} kvar)
          </button>
        </div>
      )}
    </>
  )
}
