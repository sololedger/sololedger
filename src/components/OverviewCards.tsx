'use client'
import { useState, type ReactNode } from 'react'
import { DashboardData } from '@/lib/calculations'
import { buildBankAccountHistory, type BankHistoryEntry } from '@/lib/bankAccountHistory'

interface OverviewTransaction {
  id: string
  description: string
  date: string
  is_correction?: boolean | null
  corrects_ver_nr?: number | null
  source?: string | null
}

interface OverviewJournalEntry {
  account_number: string
  debit: number | string | null
  credit: number | string | null
  ver_nr?: number | null
}

export interface OverviewCardsProps {
  withdrawal?: ReactNode
  data: DashboardData
  taxRate: number | null
  selectedYear: number
  transactions: OverviewTransaction[]
  journalMap: Record<string, OverviewJournalEntry[] | undefined>
  setActiveModal: (modal: null | 'bank' | 'skatt' | 'moms' | 'resultat') => void
  activeModal: null | 'bank' | 'skatt' | 'moms' | 'resultat'
}

export default function OverviewCards({
  data,
  withdrawal,
  taxRate,
  selectedYear,
  transactions,
  journalMap,
  setActiveModal,
  activeModal,
}: OverviewCardsProps) {
  const [showBankCorrections, setShowBankCorrections] = useState(false)
  const bankHistory = buildBankAccountHistory({ transactions, journalMap })
  const bankEntries = showBankCorrections ? bankHistory.entries : bankHistory.defaultEntries
  const bankPeriodEnd = `${selectedYear}-12-31`

  function bankEntryLabel(entry: BankHistoryEntry) {
    if (entry.kind === 'correction') return 'Bokföringsrättelse'
    if (entry.kind === 'neutralized_original') return 'Rättad verifikation'
    if (entry.kind === 'uncertain_correction') return 'Rättelse - visas för kontroll'
    return entry.sourceLabel
  }

  return (
    <>
      {/* ── ÖVERSIKTSKORT ─────────────────────────────────────────── */}
      <div className="sl-section-shell border rounded-[2.5rem] p-4 sm:p-6 bg-white shadow-sm mb-6">
        <h2 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-5 px-2">
          Översikt
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

          {/* Bank */}
          <button
            onClick={() => setActiveModal('bank')}
            className="group p-4 sm:p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-emerald-200 hover:shadow-md transition-all text-left"
          >
            <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2">
              Bank · 1930
            </p>

            <p className={`text-xl font-black tabular-nums ${data.bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {data.bankSaldo.toLocaleString('sv-SE')} kr
            </p>

            <p className="text-xs text-emerald-400 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Visa historik ↗
            </p>
          </button>

          {/* Skatt */}
          <button
            onClick={() => setActiveModal('skatt')}
            className="group p-4 sm:p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-orange-200 hover:shadow-md transition-all text-left min-w-0"
          >
            <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2">
              Skatt{taxRate !== null && ` · ${taxRate}%`}
            </p>

            <p className="text-xl font-black tabular-nums text-orange-500">
              {taxRate === null ? 'Underlag saknas' : `−${data.skattReserv.toLocaleString('sv-SE')} kr`}
            </p>
            {data.taxReviewRequired && <p className="text-xs text-amber-800">Preliminärt – skatteunderlaget behöver granskas</p>}

            <p className="text-xs text-orange-300 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Visa beräkning ↗
            </p>
          </button>

          {/* Moms */}
          <button
            onClick={() => setActiveModal('moms')}
            className="group p-4 sm:p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-green-200 hover:shadow-md transition-all text-left"
          >
            <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2">
              Moms
            </p>

            {data.momsManualReviewRequired ? (
              <p className="text-lg font-black text-amber-600 leading-tight">
                Kontroll krävs
              </p>
            ) : (
              <p className={`text-xl font-black tabular-nums ${data.momsNetto <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {data.momsNetto.toLocaleString('sv-SE')} kr
              </p>
            )}

            <p className="text-xs text-green-400 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Visa detaljer ↗
            </p>
          </button>

          {/* Resultat */}
          <button
            onClick={() => setActiveModal('resultat')}
            className="group p-4 sm:p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-gray-300 hover:shadow-md transition-all text-left"
          >
            <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2">
              Resultat
            </p>

            <p className={`text-xl font-black tabular-nums ${data.bokfortResultat >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {data.bokfortResultat.toLocaleString('sv-SE')} kr
            </p>

            <p className="text-xs text-gray-400 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Visa resultaträkning ↗
            </p>
          </button>

          <div className="col-span-2 md:col-span-1 min-w-0 flex">
            {withdrawal ?? <p role="status">{data.taxReviewRequired ? 'Skatteunderlaget behöver granskas i NE-bilagan' : data.momsManualReviewRequired ? 'Moms behöver kontrolleras' : 'Viktig uppgift saknas. Ladda uttagsunderlaget.'}</p>}
          </div>

        </div>
      </div>

      {/* ── MODALER ──────────────────────────────────────────────────── */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-6 sm:p-10 relative max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-6 sm:top-6 sm:right-8 text-gray-300 hover:text-gray-600 text-2xl font-black transition-colors"
            >
              ×
            </button>

            {/* ── BANK-MODAL ── */}
            {activeModal === 'bank' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-emerald-600 mb-1">
                  Bank (1930)
                </h2>

                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">
                  Bokförda bankrader · inte bankverifierat kontoutdrag
                </p>

                {bankHistory.openingBalanceCount > 0 && (
                  <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase text-emerald-700">
                          Ingående balans
                        </p>
                        <p className="text-[10px] font-bold text-emerald-700/70 mt-0.5">
                          Från importerad bokföringshistorik
                        </p>
                      </div>
                      <span className={`font-black tabular-nums ${bankHistory.openingBalanceAmount >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                        {bankHistory.openingBalanceAmount >= 0 ? '+' : ''}
                        {bankHistory.openingBalanceAmount.toLocaleString('sv-SE')} kr
                      </span>
                    </div>
                  </div>
                )}

                {bankHistory.correctionEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBankCorrections(prev => !prev)}
                    className="mb-3 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-gray-500 hover:border-amber-200 hover:text-amber-600 transition-colors"
                  >
                    {showBankCorrections ? 'Dölj bokföringsrättelser' : `Visa bokföringsrättelser (${bankHistory.correctionEntries.length})`}
                  </button>
                )}

                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                  {bankEntries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-5 text-center">
                      <p className="text-xs font-black uppercase text-gray-500">
                        Inga bokförda bankrader att visa
                      </p>
                      {bankHistory.correctionEntries.length > 0 && !showBankCorrections && (
                        <p className="text-[10px] font-bold text-gray-400 mt-1">
                          Det finns bara interna bokföringsrättelser i perioden.
                        </p>
                      )}
                    </div>
                  ) : (
                    bankEntries.map(entry => (
                      <div
                        key={entry.id}
                        className={`rounded-2xl px-4 py-3 transition-all ${
                          entry.isInternalAdjustment
                            ? 'border border-amber-100 bg-amber-50/60'
                            : entry.direction === 'in'
                            ? 'bg-emerald-50/55 hover:bg-emerald-50'
                            : 'bg-gray-50/70 hover:bg-gray-100/70'
                        }`}
                      >
                        <div className="flex flex-wrap justify-between items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`font-bold text-sm break-words ${
                              entry.isInternalAdjustment ? 'text-amber-700' : 'text-gray-700'
                            }`}>
                              {entry.description}
                            </p>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide text-gray-400">
                              <span>{entry.date}</span>
                              <span>VER-{entry.verNr ?? '-'}</span>
                              <span className={entry.source === 'sie_import' ? 'text-blue-500' : entry.source === 'customer_invoice' ? 'text-emerald-600' : entry.isInternalAdjustment ? 'text-amber-600' : ''}>
                                {bankEntryLabel(entry)}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={`font-black text-sm tabular-nums ${
                              entry.isInternalAdjustment
                                ? 'text-amber-600'
                                : entry.amount >= 0
                                ? 'text-emerald-600'
                                : 'text-red-500'
                            }`}>
                              {entry.amount >= 0 ? '+' : ''}
                              {entry.amount.toLocaleString('sv-SE')} kr
                            </p>
                            <p className="text-[10px] font-black uppercase text-gray-300 mt-0.5">
                              {entry.amount >= 0 ? 'In' : 'Ut'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex flex-wrap justify-between items-center gap-2 font-black uppercase tracking-tighter">
                  <span className="text-[11px] text-gray-500">
                    Bokfört saldo per {bankPeriodEnd}
                  </span>

                  <span className={`text-xl font-black ${data.bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {data.bankSaldo.toLocaleString('sv-SE')} kr
                  </span>
                </div>
              </>
            )}

            {/* ── SKATT-MODAL ── */}
            {activeModal === 'skatt' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-orange-500 mb-1">
                  Skatteexempel · {selectedYear}
                </h2>

                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">
                  Årets skatteexempel använder samma årsprocent som Säkert uttag. Uttagskortet räknar flera år och tar även hänsyn till sparade skattebeslut och skattekontot.
                </p>

                <div className="space-y-3">
                  {data.taxReviewRequired && <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">Skatteberäkningen är preliminär. Granska kontona i NE-bilagan innan du använder beloppet som grund för uttag.</p>}
                  <div className="flex flex-wrap justify-between items-center gap-2 bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">
                      Bokförda intäkter
                    </span>
                    <span className="font-black text-emerald-600">
                      +{data.intakter.toLocaleString('sv-SE')} kr
                    </span>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-2 bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">
                      Bokförda kostnader
                    </span>
                    <span className="font-black text-red-500">
                      −{data.kostnader.toLocaleString('sv-SE')} kr
                    </span>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-2 bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">
                      Bokfört resultat
                    </span>
                    <span className={`font-black ${data.bokfortResultat >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                      {data.bokfortResultat.toLocaleString('sv-SE')} kr
                    </span>
                  </div>

                  {data.ejAvdragsgillt !== 0 && (
                    <div className="flex flex-wrap justify-between items-center gap-2 bg-orange-50 rounded-2xl px-5 py-3">
                      <span className="text-xs font-black text-orange-500 uppercase">
                        Ej avdragsgilla (R13)
                      </span>
                      <span className="font-black text-orange-500">
                        {data.ejAvdragsgillt > 0 ? '+' : ''}{data.ejAvdragsgillt.toLocaleString('sv-SE')} kr
                      </span>
                    </div>
                  )}

                  {(data.skattefriaIntakter ?? 0) !== 0 && (
                    <div className="flex flex-wrap justify-between items-center gap-2 bg-orange-50 rounded-2xl px-5 py-3">
                      <span className="text-xs font-black text-orange-500 uppercase">Skattefria intäkter (R14)</span>
                      <span className="font-black text-orange-500">{(-(data.skattefriaIntakter ?? 0)).toLocaleString('sv-SE')} kr</span>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-between items-center gap-2 bg-orange-50 rounded-2xl px-5 py-3 border border-orange-200">
                    <span className="text-xs font-black text-orange-600 uppercase">
                      Skattemässigt resultat
                    </span>
                    <span className="font-black text-orange-600">
                      {data.skattemassigVinst.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs font-black uppercase text-gray-400">
                    {taxRate === null ? 'Årsprocenten kunde inte hämtas' : `${data.skattemassigVinst.toLocaleString('sv-SE')} kr × ${taxRate}%`}
                  </span>

                  <span className="text-2xl font-black text-orange-500">
                    {taxRate === null ? 'Underlag saknas' : `−${data.skattReserv.toLocaleString('sv-SE')} kr`}
                  </span>
                </div>
              </>
            )}

            {/* ── MOMS-MODAL ── */}
            {activeModal === 'moms' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-emerald-600 mb-1">
                  Momsberäkning
                </h2>

                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">
                  Hur momsen beräknas
                </p>

                {data.momsManualReviewRequired && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                    <p className="text-xs font-black uppercase text-amber-700">
                      Manuell kontroll krävs
                    </p>
                    <p className="text-xs text-amber-700 font-bold mt-1">
                      {data.momsManualReviewMessage ?? 'Perioden innehåller moms som inte kan tolkas säkert automatiskt.'}
                    </p>
                  </div>
                )}

                <div className={`space-y-3 ${data.momsManualReviewRequired ? 'opacity-55' : ''}`}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-red-50 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-xs font-black text-red-600 uppercase">
                        Utgående moms
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                        Moms som ska redovisas
                      </p>
                    </div>

                    <span className="font-black text-red-500">
                      +{data.utgaendeMoms.toLocaleString('sv-SE')} kr
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-emerald-50 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-xs font-black text-emerald-600 uppercase">
                        Avdragsgill ingående moms
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                        Moms som dras av
                      </p>
                    </div>

                    <span className="font-black text-emerald-600">
                      −{data.ingaendeMoms.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs font-black uppercase text-gray-400">
                    Moms att betala eller få tillbaka
                  </span>

                  {data.momsManualReviewRequired ? (
                    <span className="text-xl font-black text-amber-600">
                      Kontroll krävs
                    </span>
                  ) : (
                    <span className={`text-2xl font-black ${data.momsNetto <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {data.momsNetto <= 0 ? 'Få tillbaka: ' : 'Att betala: '}
                      {Math.abs(data.momsNetto).toLocaleString('sv-SE')} kr
                    </span>
                  )}
                </div>
              </>
            )}

            {/* ── RESULTAT-MODAL ── */}
            {activeModal === 'resultat' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-gray-800 mb-1">
                  Resultaträkning
                </h2>

                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">
                  Översikt av intäkter och kostnader
                </p>

                <div className="space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-2 bg-emerald-50 rounded-2xl px-5 py-3 border border-emerald-100">
                    <span className="text-xs font-black text-emerald-700 uppercase">
                      Bokförda intäkter
                    </span>
                    <span className="font-black text-emerald-700">
                      +{data.intakter.toLocaleString('sv-SE')} kr
                    </span>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-2 bg-rose-50 rounded-2xl px-5 py-3 border border-rose-100">
                    <span className="text-xs font-black text-rose-700 uppercase">
                      Bokförda kostnader
                    </span>
                    <span className="font-black text-rose-700">
                      −{data.kostnader.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs font-black uppercase text-gray-400">
                    Verksamhetens Resultat
                  </span>

                  <span className={`text-2xl font-black ${data.bokfortResultat >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {data.bokfortResultat.toLocaleString('sv-SE')} kr
                  </span>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </>
  )
}
