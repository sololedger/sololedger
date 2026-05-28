'use client'
import { useState } from 'react'
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
  balances
}: OverviewCardsProps) {
  return (
    <>
      {/* ── ÖVERSIKTSKORT ──────────────────────────────────────────── */}
      <div className="border-2 border-emerald-500 rounded-[2.5rem] p-6 bg-white shadow-sm mb-6">
        <h2 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider mb-4 px-2">
          Översikt: SoloLedger / Bokföring / Kontoplan / NE Bilaga
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-center uppercase tracking-tighter font-black">
          <button
            onClick={() => setActiveModal('bank')}
            className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer text-left"
          >
            <p className="text-[9px] text-gray-400 mb-1">Bank (1930) <span className="text-emerald-300">↗</span></p>
            <p className={`text-xl font-black ${data.bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {data.bankSaldo.toLocaleString()} kr
            </p>
          </button>
          <button
            onClick={() => setActiveModal('skatt')}
            className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-orange-200 hover:shadow-md transition-all cursor-pointer text-left"
          >
            <p className="text-[9px] text-gray-400 mb-1">Skatt ({taxRate}%) <span className="text-orange-300">↗</span></p>
            <p className="text-xl text-orange-500">-{data.skattReserv.toLocaleString()} kr</p>
          </button>
          <button
            onClick={() => setActiveModal('moms')}
            className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-green-200 hover:shadow-md transition-all cursor-pointer text-left"
          >
            <p className="text-[9px] text-gray-400 mb-1">Moms <span className="text-green-300">↗</span></p>
            <p className={`text-xl ${data.momsNetto <= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {data.momsNetto.toLocaleString()} kr
            </p>
          </button>
          <button
            onClick={() => setActiveModal('resultat')}
            className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer text-left"
          >
            <p className="text-[9px] text-gray-400 mb-1">Resultat <span className="text-gray-300">↗</span></p>
            <p className="text-xl text-gray-700">{data.bokfortResultat.toLocaleString()} kr</p>
          </button>
          <div className="bg-emerald-600 p-6 rounded-[2rem] text-white shadow-lg">
            <p className="text-[9px] opacity-80 mb-1 uppercase">Säkert uttag</p>
            <p className="text-2xl italic font-black">{data.sakertUttag.toLocaleString()} kr</p>
          </div>
        </div>
      </div>

      {/* ── MODALER ─────────────────────────────────────────────────── */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-8 text-gray-300 hover:text-gray-600 text-2xl font-black transition-colors"
            >
              ×
            </button>

            {activeModal === 'bank' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-emerald-600 mb-1">Bank (1930)</h2>
                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur saldot beräknas</p>
                <div className="space-y-3">
                  {transactions.map(tx => {
                    const journal = journalMap[tx.id] || []
                    const bankEntry = journal.find((e: any) => e.account_number === '1930')
                    if (!bankEntry) return null
                    const amount = Number(bankEntry.debit) - Number(bankEntry.credit)
                    return (
                      <div key={tx.id} className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <div>
                          <p className="font-bold text-sm text-gray-700">{tx.description}</p>
                          <p className="text-[10px] text-gray-400 font-bold">{tx.date}</p>
                        </div>
                        <span className={`font-black text-sm tabular-nums ${amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {amount >= 0 ? '+' : ''}{amount.toLocaleString('sv-SE')} kr
                        </span>
                      </div>
                    )
                  }).filter(Boolean)}
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-gray-400">Saldo</span>
                  <span className={`text-2xl font-black ${data.bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {data.bankSaldo.toLocaleString('sv-SE')} kr
                  </span>
                </div>
              </>
            )}

            {activeModal === 'skatt' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-orange-500 mb-1">Skattreservat</h2>
                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur skatten beräknas</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Intäkter (3xxx)</span>
                    <span className="font-black text-green-600">+{data.intakter.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Kostnader (4–7xxx)</span>
                    <span className="font-black text-red-500">−{data.kostnader.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Bokfört resultat</span>
                    <span className={`font-black ${data.bokfortResultat >= 0 ? 'text-gray-700' : 'text-red-500'}`}>{data.bokfortResultat.toLocaleString('sv-SE')} kr</span>
                  </div>
                  {data.ejAvdragsgillt > 0 && (
                    <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-5 py-3">
                      <span className="text-xs font-black text-orange-500 uppercase">+ Ej avdragsgilla (6992)</span>
                      <span className="font-black text-orange-500">+{data.ejAvdragsgillt.toLocaleString('sv-SE')} kr</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-orange-600 uppercase">Skattemässigt resultat</span>
                    <span className="font-black text-orange-600">{data.skattemassigVinst.toLocaleString('sv-SE')} kr</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-gray-400">{data.skattemassigVinst.toLocaleString('sv-SE')} kr × {taxRate}%</span>
                  <span className="text-2xl font-black text-orange-500">−{data.skattReserv.toLocaleString('sv-SE')} kr</span>
                </div>
              </>
            )}

            {activeModal === 'moms' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-green-600 mb-1">Moms</h2>
                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur momsen beräknas</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-red-50 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-xs font-black text-red-600 uppercase">Utgående moms (2611)</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">Moms på din försäljning — ska betalas in</p>
                    </div>
                    <span className="font-black text-red-500">+{Math.abs(balances['2611'] || 0).toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center bg-green-50 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-xs font-black text-green-600 uppercase">Ingående moms (2641)</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">Moms du betalat på kostnader — dras av</p>
                    </div>
                    <span className="font-black text-green-600">−{Math.abs(balances['2641'] || 0).toLocaleString('sv-SE')} kr</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-gray-400">Att betala / få tillbaka</span>
                  <span className={`text-2xl font-black ${data.momsNetto <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {data.momsNetto.toLocaleString('sv-SE')} kr
                  </span>
                </div>
              </>
            )}

            {activeModal === 'resultat' && (
              <>
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-gray-700 mb-1">Resultat</h2>
                <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur resultatet beräknas</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Intäkter (3xxx)</span>
                    <span className="font-black text-green-600">+{data.intakter.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                    <span className="text-xs font-black text-gray-500 uppercase">Kostnader (4–7xxx)</span>
                    <span className="font-black text-red-500">−{data.kostnader.toLocaleString('sv-SE')} kr</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-gray-400">Bokfört resultat</span>
                  <span className={`text-2xl font-black ${data.bokfortResultat >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
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