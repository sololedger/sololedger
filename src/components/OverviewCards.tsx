'use client'
import { DashboardData } from '@/lib/calculations'

interface OverviewCardsProps {
  data: DashboardData
  taxRate: number
  transactions: any[]
  journalMap: any
  setActiveModal: (modal: null | 'bank' | 'skatt' | 'moms' | 'resultat') => void
  activeModal: null | 'bank' | 'skatt' | 'moms' | 'resultat'
  balances: any
}

export default function OverviewCards({
  data,
  taxRate,
  transactions,
  journalMap,
  setActiveModal,
  activeModal,
  balances,
}: OverviewCardsProps) {
  return (
    <>
      {/* ── ÖVERSIKTSKORT ─────────────────────────────────────────── */}
      <div className="border border-gray-100 rounded-[2.5rem] p-6 bg-white shadow-sm mb-6">
        <h2 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-5 px-2">
          Översikt
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">

          {/* Bank */}
          <button
            onClick={() => setActiveModal('bank')}
            className="group p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-emerald-200 hover:shadow-md transition-all text-left"
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
            className="group p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-orange-200 hover:shadow-md transition-all text-left"
          >
            <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2">
              Skatt · {taxRate}%
            </p>
            <p className="text-xl font-black tabular-nums text-orange-500">
              −{data.skattReserv.toLocaleString('sv-SE')} kr
            </p>
            <p className="text-xs text-orange-300 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Visa beräkning ↗
            </p>
          </button>

          {/* Moms */}
          <button
            onClick={() => setActiveModal('moms')}
            className="group p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-green-200 hover:shadow-md transition-all text-left"
          >
            <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-2">
              Moms
            </p>
            <p className={`text-xl font-black tabular-nums ${data.momsNetto <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {data.momsNetto.toLocaleString('sv-SE')} kr
            </p>
            <p className="text-xs text-green-400 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Visa detaljer ↗
            </p>
          </button>

          {/* Resultat */}
          <button
            onClick={() => setActiveModal('resultat')}
            className="group p-6 rounded-[1.75rem] border border-gray-100 bg-white hover:border-gray-300 hover:shadow-md transition-all text-left"
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

          {/* Säkert uttag — accent-kort */}
          <div className="p-6 rounded-[1.75rem] bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg flex flex-col justify-between">
            <p className="text-xs font-black uppercase tracking-widest opacity-70 mb-2">
              Säkert uttag
            </p>
            <p className="text-3xl font-black tabular-nums leading-none">
              {data.sakertUttag.toLocaleString('sv-SE')} kr
            </p>
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
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-8 text-gray-300 hover:text-gray-600 text-2xl font-black transition-colors"
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
                  Transaktionshistorik
                </p>

                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                  {transactions.map(tx => {
                    const journal = journalMap[tx.id] || []
                    const bankEntry = journal.find((e: any) => e.account_number === '1930')
                    if (!bankEntry) return null

                    const amount = Number(bankEntry.debit) - Number(bankEntry.credit)
                    const isCorrection = tx.is_correction === true

                    return (
                      <div
                        key={tx.id}
                        className={`flex justify-between items-center rounded-2xl px-4 py-3 transition-all ${
                          isCorrection
                            ? 'bg-amber-50/60 opacity-60'
                            : 'bg-gray-50/60 hover:bg-gray-100/60'
                        }`}
                      >
                        <div>
                          <p className={`font-bold text-sm ${isCorrection ? 'text-amber-500 line-through' : 'text-gray-700'}`}>
                            {isCorrection
                              ? `↩ ${tx.description.replace('↩ ', '')}`
                              : tx.description}
                          </p>
                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">{tx.date}</p>
                        </div>
                        <span className={`font-black text-sm tabular-nums ${
                          isCorrection
                            ? 'text-amber-400 line-through'
                            : amount >= 0
                            ? 'text-emerald-600'
                            : 'text-red-500'
                        }`}>
                          {amount >= 0 ? '+' : ''}{amount.toLocaleString('sv-SE')} kr
                        </span>
                      </div>
                    )
                  }).filter(Boolean)}
                </div>

                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex flex-col gap-2 font-black uppercase tracking-tighter text-[11px] text-gray-500">
                  <div className="flex justify-between items-center">
                    <span>Tot Försäljning</span>
                    <span className="text-emerald-600">+{data.intakter.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Tot Kostnader</span>
                    <span className="text-red-500">−{data.kostnader.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-dashed border-gray-200 text-sm">
                    <span className="text-gray-700 font-black">Aktuellt Saldo</span>
                    <span className={`text-xl font-black ${data.bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {data.bankSaldo.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* ── SKATT-MODAL ── */}
            {activeModal === 'skatt' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-orange-500 mb-1">
                  Skattreservat
                </h2>
                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">
                  Hur skatten beräknas
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Total Försäljning (3xxx)</span>
                    <span className="font-black text-emerald-600">+{data.intakter.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Totala Kostnader (4–7xxx)</span>
                    <span className="font-black text-red-500">−{data.kostnader.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Bokfört resultat</span>
                    <span className={`font-black ${data.bokfortResultat >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                      {data.bokfortResultat.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                  {data.ejAvdragsgillt > 0 && (
                    <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-5 py-3">
                      <span className="text-xs font-black text-orange-500 uppercase">+ Ej avdragsgilla (6992)</span>
                      <span className="font-black text-orange-500">+{data.ejAvdragsgillt.toLocaleString('sv-SE')} kr</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-5 py-3 border border-orange-200">
                    <span className="text-xs font-black text-orange-600 uppercase">Skattemässigt resultat</span>
                    <span className="font-black text-orange-600">
                      {data.skattemassigVinst.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-gray-400">
                    {data.skattemassigVinst.toLocaleString('sv-SE')} kr × {taxRate}%
                  </span>
                  <span className="text-2xl font-black text-orange-500">
                    −{data.skattReserv.toLocaleString('sv-SE')} kr
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
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-red-50 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-xs font-black text-red-600 uppercase">Utgående moms (2611)</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                        Moms på din försäljning — ska betalas in
                      </p>
                    </div>
                    <span className="font-black text-red-500">
                      +{Math.abs(balances['2611'] || 0).toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-xs font-black text-emerald-600 uppercase">Ingående moms (2641)</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                        Moms du betalat på kostnader — dras av
                      </p>
                    </div>
                    <span className="font-black text-emerald-600">
                      −{Math.abs(balances['2641'] || 0).toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-gray-400">
                    Momsbalans (Utgående − Ingående)
                  </span>
                  <span className={`text-2xl font-black ${data.momsNetto <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {data.momsNetto <= 0 ? 'Få tillbaka: ' : 'Att betala: '}
                    {Math.abs(data.momsNetto).toLocaleString('sv-SE')} kr
                  </span>
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
                  <div className="flex justify-between items-center bg-emerald-50 rounded-2xl px-5 py-3 border border-emerald-100">
                    <span className="text-xs font-black text-emerald-700 uppercase">
                      Total Försäljning (3xxx)
                    </span>
                    <span className="font-black text-emerald-700">
                      +{data.intakter.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-rose-50 rounded-2xl px-5 py-3 border border-rose-100">
                    <span className="text-xs font-black text-rose-700 uppercase">
                      Totala Kostnader (4–7xxx)
                    </span>
                    <span className="font-black text-rose-700">
                      −{data.kostnader.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
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
