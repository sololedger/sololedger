'use client'

import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  getTransactionSourceUiPolicy,
  shouldOfferGenericTransactionCorrection,
  shouldOfferGenericTransactionEdit,
} from '@/lib/transactionSourceUi'
import { isOwnerDepositCategoryId } from '@/lib/accountCategoryUi'
import { transactionVatBadges } from '@/lib/transactionVatPresentation'
import {
  DEFAULT_TRANSACTION_HISTORY_FILTERS,
  TRANSACTION_HISTORY_CATEGORY_OPTIONS,
  TRANSACTION_HISTORY_SORT_OPTIONS,
  filterAndSortTransactionHistoryItems,
  hasActiveTransactionHistoryFilters,
  type TransactionHistoryCategoryFilter,
  type TransactionHistoryFilterState,
  type TransactionHistorySortMode,
} from '@/lib/transactionHistoryFilters'

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
  const [filters, setFilters] = useState<TransactionHistoryFilterState>({
    ...DEFAULT_TRANSACTION_HISTORY_FILTERS,
  })

  useEffect(() => {
    setVisibleCount(50)
  }, [filters.search, filters.category, filters.sort, transactions.length])

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

  const enriched = transactions.map((tx, originalIndex) => {
    const journal = journalMap[tx.id] || []
    const isCorrection = tx.is_correction === true
    const verNr = journal[0]?.ver_nr
    const isNeutralized = !isCorrection && verNr != null && neutralizedVerNrs.has(verNr)

    const isImported = tx.source === 'sie_import'
    const isOpeningBalance = tx.source === 'sie_opening_balance'
    const isSieUndo = tx.source === 'sie_import_undo'
    const sourceUiPolicy = getTransactionSourceUiPolicy(tx)
    const isVatClosing = sourceUiPolicy.kind === 'vat_closing'
    const isVatV2 = sourceUiPolicy.kind === 'vat_v2'
    const isVatSettlement = sourceUiPolicy.kind === 'vat_settlement'
    const isTaxAccountMovement = sourceUiPolicy.kind === 'tax_account_movement'
    const isFixedAsset = sourceUiPolicy.kind === 'fixed_asset'
    const isFixedAssetDepreciation = sourceUiPolicy.kind === 'fixed_asset_depreciation'
    const isFixedAssetReclassification =
      sourceUiPolicy.kind === 'fixed_asset_reclassification'
    const isFixedAssetSystemSource =
      isFixedAsset || isFixedAssetDepreciation || isFixedAssetReclassification
    const isSystemManaged = sourceUiPolicy.systemManaged
    const offerGenericEdit = shouldOfferGenericTransactionEdit(tx)
    const offerGenericCorrection = shouldOfferGenericTransactionCorrection(tx)
    const accountDef = kontoplan.find(k => k.id === tx.type)

    // H5: historisk visning ska bygga på det som faktiskt bokfördes,
    // inte på hur kategorin ser ut i dagens kontoplan.
    const isIncome =
      !isImported &&
      !isOpeningBalance &&
      !isSieUndo &&
      !isVatClosing &&
      !isVatSettlement &&
      !isTaxAccountMovement &&
      (
        journal.some((e: any) =>
          String(e.account_number || '').startsWith('3') && Number(e.credit) > 0
        ) ||
        isOwnerDepositCategoryId(tx.type)
      )

    const vatBadges = transactionVatBadges({
      transaction: tx,
      journalRows: journal,
      isSystemManaged,
      isIncome,
    })

    // En KORRVER är i sig en giltig ny bokföringspost. Därför stryks inte
    // korrigeringsraden längre över. Det är ORIGINALVERIFIKATIONEN som
    // markeras neutraliserad och genomstruken.
    const rowClass = isCorrection
      ? 'bg-amber-50/55 hover:bg-amber-50/80'
      : isNeutralized
      ? 'bg-gray-50 opacity-60'
      : editingId === tx.id
      ? 'bg-amber-50/50'
      : isVatV2
      ? 'bg-indigo-50/40 hover:bg-indigo-50/65'
      : isVatClosing
      ? 'bg-violet-50/45 hover:bg-violet-50/70'
      : isVatSettlement
      ? 'bg-sky-50/45 hover:bg-sky-50/70'
      : isTaxAccountMovement
      ? 'bg-cyan-50/45 hover:bg-cyan-50/70'
      : isFixedAssetSystemSource
      ? 'bg-emerald-50/45 hover:bg-emerald-50/70'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50/40 hover:bg-sky-50/60'
      : 'hover:bg-emerald-50/30'

    const textClass = isCorrection
      ? 'text-amber-700'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : isVatV2
      ? 'text-indigo-900'
      : isVatClosing
      ? 'text-violet-900'
      : isVatSettlement
      ? 'text-sky-900'
      : isTaxAccountMovement
      ? 'text-cyan-900'
      : isFixedAssetSystemSource
      ? 'text-emerald-900'
      : (isImported || isOpeningBalance)
      ? 'text-sky-900'
      : 'text-gray-700'

    const verClass = isCorrection
      ? 'text-amber-500'
      : isNeutralized
      ? 'text-gray-300 line-through'
      : isVatV2
      ? 'text-indigo-500'
      : isVatClosing
      ? 'text-violet-500'
      : isVatSettlement
      ? 'text-sky-500'
      : isTaxAccountMovement
      ? 'text-cyan-500'
      : isFixedAssetSystemSource
      ? 'text-emerald-500'
      : (isImported || isOpeningBalance)
      ? 'text-sky-500'
      : 'text-emerald-600'

    const amountClass = isCorrection
      ? 'text-amber-600'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : isVatV2
      ? 'text-indigo-600'
      : isVatClosing
      ? 'text-violet-600'
      : isVatSettlement
      ? 'text-sky-700'
      : isTaxAccountMovement
      ? 'text-cyan-700'
      : isFixedAssetSystemSource
      ? 'text-emerald-700'
      : (isImported || isOpeningBalance)
      ? 'text-sky-700'
      : isIncome
      ? 'text-emerald-600'
      : 'text-rose-600'

    const badgeClass = isCorrection
      ? 'bg-amber-50 border-amber-200 text-amber-600'
      : isNeutralized
      ? 'bg-gray-50 border-gray-100 text-gray-300'
      : isVatV2
      ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
      : isVatClosing
      ? 'bg-violet-50 border-violet-100 text-violet-600'
      : isVatSettlement
      ? 'bg-sky-50 border-sky-100 text-sky-600'
      : isTaxAccountMovement
      ? 'bg-cyan-50 border-cyan-100 text-cyan-600'
      : isFixedAssetSystemSource
      ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
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
      isVatClosing,
      isVatV2,
      isVatSettlement,
      isTaxAccountMovement,
      isFixedAsset,
      isFixedAssetDepreciation,
      isFixedAssetReclassification,
      isFixedAssetSystemSource,
      isSystemManaged,
      offerGenericEdit,
      offerGenericCorrection,
      accountDef,
      isIncome,
      vatBadges,
      rowClass,
      textClass,
      verClass,
      amountClass,
      badgeClass,
      originalIndex,
    }
  })

  const filteredEnriched = filterAndSortTransactionHistoryItems({
    items: enriched,
    filters,
    accounts: kontoplan,
  })

  const filtersActive = hasActiveTransactionHistoryFilters(filters)

  // Gruppindelning för AUTOMATISKA rättelser efter "Ångra SIE-import".
  // Vanliga KORRVER flyttas inte: de ligger kvar i datum-/VER-ordning så
  // bokföringens tidslinje och verifikationsföljd fortfarande är tydlig.
  const undoGroups = new Map<string, typeof filteredEnriched>()
  for (const item of filteredEnriched) {
    if (!item.isSieUndo || !item.tx.import_batch_id) continue
    const id = String(item.tx.import_batch_id)
    const existing = undoGroups.get(id) || []
    existing.push(item)
    undoGroups.set(id, existing)
  }

  type DisplayItem =
    | { kind: 'transaction'; item: (typeof enriched)[number] }
    | { kind: 'sieUndoGroup'; batchId: string; items: typeof filteredEnriched }

  const displayItems: DisplayItem[] = []
  const emittedUndoBatches = new Set<string>()

  for (const item of filteredEnriched) {
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
      <div className="bg-white rounded-[2.5rem] border sl-section-shell overflow-hidden shadow-sm">
        <p className="sl-secondary-copy p-12 text-center italic font-medium">
          Inga transaktioner bokförda för {selectedYear}
        </p>
      </div>
    )
  }

  const visibleItems = displayItems.slice(0, visibleCount)
  const noFilteredResults = filtersActive && displayItems.length === 0
  const clearFilters = () => {
    setFilters({ ...DEFAULT_TRANSACTION_HISTORY_FILTERS })
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <label className="relative w-full md:max-w-md">
            <span className="sr-only">Sök transaktionshistorik</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-gray-300"
            >
              ⌕
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters(prev => ({ ...prev, search: event.target.value }))}
              placeholder="VER, beskrivning eller konto"
              className="h-10 w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-4 text-sm font-bold text-gray-700 shadow-sm outline-none transition-colors placeholder:text-gray-300 focus:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-100"
            />
          </label>

          <label className="flex items-center gap-2 md:w-auto">
            <span className="sr-only">Sortering</span>
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-300">
              Sortering
            </span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters(prev => ({
                ...prev,
                sort: event.target.value as TransactionHistorySortMode,
              }))}
              className="h-9 max-w-full rounded-xl border border-gray-200 bg-white px-3 text-xs font-black text-gray-500 shadow-sm outline-none transition-colors focus:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-100"
            >
              {TRANSACTION_HISTORY_SORT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="sr-only">Kategori</span>
          {TRANSACTION_HISTORY_CATEGORY_OPTIONS.map(option => {
            const active = filters.category === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters(prev => ({
                  ...prev,
                  category: option.value as TransactionHistoryCategoryFilter,
                }))}
                className={`h-8 rounded-full border px-3 text-[10px] font-black uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 ${
                  active
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
                }`}
              >
                {option.label}
              </button>
            )
          })}

          {filtersActive && (
            <>
              <span className="mx-1 hidden h-4 w-px bg-gray-200 sm:block" aria-hidden="true" />
              <span className="text-[11px] font-bold text-gray-400">
                Visar {filteredEnriched.length} inkluderade av {transactions.length} transaktioner
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="h-8 rounded-full border border-gray-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              >
                Rensa
              </button>
            </>
          )}
        </div>
      </div>

      {noFilteredResults ? (
        <div className="bg-white rounded-[2rem] border sl-section-shell overflow-hidden shadow-sm">
          <p className="sl-secondary-copy p-10 text-center italic font-medium">
            Inga transaktioner matchar sökning eller filter.
          </p>
        </div>
      ) : (
        <>
      {/* ══════════════════════ DESKTOP ══════════════════════ */}
      <div className="hidden md:block bg-white rounded-[2.5rem] border sl-section-shell overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[9px] font-black uppercase sl-table-heading tracking-widest border-b border-gray-200">
            <tr>
              <th className="p-8">Datum / Ver</th>
              <th className="p-8">Händelse</th>
              <th className="p-8 text-right">Belopp</th>
              <th className="p-8">Bokföring</th>
              <th className="p-8 text-right pr-12">Åtgärd</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
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
                isVatClosing,
                isVatV2,
                isVatSettlement,
                isTaxAccountMovement,
                isFixedAsset,
                isFixedAssetDepreciation,
                isFixedAssetReclassification,
                isFixedAssetSystemSource,
                isSystemManaged,
                offerGenericEdit,
                offerGenericCorrection,
                accountDef,
                isIncome,
                vatBadges,
                rowClass,
                textClass,
                verClass,
                amountClass,
                badgeClass,
              } = displayItem.item

              return (
                <tr key={tx.id} className={`group transition-all duration-150 ${rowClass}`}>
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
                      ) : isVatClosing ? (
                        <p className="text-[10px] font-black text-violet-600 uppercase">
                          Momsavslut
                        </p>
                      ) : isVatV2 ? (
                        <p className="text-[10px] font-black text-indigo-600 uppercase">
                          VAT V2 utlandsinköp
                        </p>
                      ) : isVatSettlement ? (
                        <p className="text-[10px] font-black text-sky-600 uppercase">
                          Momsavräkning
                        </p>
                      ) : isTaxAccountMovement ? (
                        <p className="text-[10px] font-black text-cyan-600 uppercase">
                          Skattekontorörelse
                        </p>
                      ) : isFixedAsset ? (
                        <p className="text-[10px] font-black text-emerald-600 uppercase">
                          Inventarie
                        </p>
                      ) : isFixedAssetDepreciation ? (
                        <p className="text-[10px] font-black text-emerald-600 uppercase">
                          Inventarieavskrivning
                        </p>
                      ) : isFixedAssetReclassification ? (
                        <p className="text-[10px] font-black text-emerald-600 uppercase">
                          Inventarieomklassning
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

                      {!isCorrection && !isNeutralized && vatBadges.length > 0 && (
                        vatBadges.map((badge) => (
                          <span
                            key={`${badge.label}-${badge.value}`}
                            className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200"
                          >
                            {badge.label}: {badge.value}
                          </span>
                        ))
                      )}

                      {!isCorrection && !isNeutralized && !isSystemManaged && vatBadges.length === 0 && (
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

                    {tx.file_url && !isNeutralized && !isVatClosing && (
                      <button
                        onClick={() => handleOpenAttachment(tx.file_url)}
                        className="text-emerald-400 text-xs mt-1 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        📎 Visa bilaga
                      </button>
                    )}
                  </td>

                  <td className={`p-8 text-right font-black text-lg whitespace-nowrap ${amountClass}`}>
                    {isVatClosing ? (
                      <span className="text-[10px] font-black uppercase tracking-wide text-violet-500">
                        Systembokning
                      </span>
                    ) : isVatV2 ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : isVatSettlement ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : isTaxAccountMovement ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : isFixedAssetSystemSource ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : (
                      <>
                        {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </>
                    )}
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
                    <div className="flex items-center justify-end gap-1">
                      {!isCorrection && !isNeutralized && offerGenericEdit && !isYearLocked && (
                        <button
                          onClick={() => onEdit(tx)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:bg-emerald-50 hover:text-emerald-600 transition-all"
                          title={tx.booked ? "Hantera bilaga" : "Redigera"}
                        >
                          ✎
                        </button>
                      )}
                      {!isCorrection && !isNeutralized && offerGenericCorrection && !isYearLocked && (
                        <button
                          onClick={() => onDelete(tx)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all font-bold"
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
            isVatClosing,
            isVatV2,
            isVatSettlement,
            isTaxAccountMovement,
            isFixedAsset,
            isFixedAssetDepreciation,
            isFixedAssetReclassification,
            isFixedAssetSystemSource,
            isSystemManaged,
            offerGenericEdit,
            offerGenericCorrection,
            accountDef,
            isIncome,
            vatBadges,
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
                : isVatV2
                ? 'bg-indigo-50/40 border-indigo-100'
                : isVatClosing
                ? 'bg-violet-50/45 border-violet-100'
                : isVatSettlement
                ? 'bg-sky-50/45 border-sky-100'
                : isTaxAccountMovement
                ? 'bg-cyan-50/45 border-cyan-100'
                : isFixedAssetSystemSource
                ? 'bg-emerald-50/45 border-emerald-100'
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

                {isVatClosing ? (
                  <p className="font-black text-[10px] uppercase tracking-wide text-violet-500 text-right">
                    Systembokning
                  </p>
                ) : isVatV2 ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : isVatSettlement ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : isTaxAccountMovement ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : isFixedAssetSystemSource ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                )}
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
                ) : isVatClosing ? (
                  <p className="text-[10px] font-black text-violet-600 uppercase">Momsavslut</p>
                ) : isVatV2 ? (
                  <p className="text-[10px] font-black text-indigo-600 uppercase">VAT V2 utlandsinköp</p>
                ) : isVatSettlement ? (
                  <p className="text-[10px] font-black text-sky-600 uppercase">Momsavräkning</p>
                ) : isTaxAccountMovement ? (
                  <p className="text-[10px] font-black text-cyan-600 uppercase">Skattekontorörelse</p>
                ) : isFixedAsset ? (
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Inventarie</p>
                ) : isFixedAssetDepreciation ? (
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Inventarieavskrivning</p>
                ) : isFixedAssetReclassification ? (
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Inventarieomklassning</p>
                ) : isImported ? (
                  <p className="text-[10px] font-black text-sky-500 uppercase">Importerad verifikation</p>
                ) : (
                  <p className="text-[10px] font-black text-emerald-500 uppercase">
                    {accountDef?.name || tx.type}
                  </p>
                )}

                {!isCorrection && !isNeutralized && vatBadges.length > 0 && (
                  vatBadges.map((badge) => (
                    <span
                      key={`${badge.label}-${badge.value}`}
                      className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200"
                    >
                      {badge.label}: {badge.value}
                    </span>
                  ))
                )}

                {!isCorrection && !isNeutralized && !isSystemManaged && vatBadges.length === 0 && (
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

              {tx.file_url && !isNeutralized && !isVatClosing && (
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

              {!isCorrection && !isNeutralized && (offerGenericEdit || offerGenericCorrection) && !isYearLocked && (
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  {offerGenericEdit && (
                    <button
                      onClick={() => onEdit(tx)}
                      className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 font-black text-[10px] uppercase tracking-wide transition-colors"
                    >
                      ✎ {tx.booked ? "Hantera bilaga" : "Redigera"}
                    </button>
                  )}
                  {offerGenericCorrection && (
                    <button
                      onClick={() => onDelete(tx)}
                      className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-500 font-black text-[10px] uppercase tracking-wide transition-colors"
                    >
                      ✕ Korrigera
                    </button>
                  )}
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
      )}
    </>
  )
}
