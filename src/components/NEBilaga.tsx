'use client'
import { useState } from 'react'

interface NEData {
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  R5: number;
  R6: number;
  R7: number;
  R8: number;
  R9: number;
  R10: number;
  R11: number;
  R12: number;
  R14: number;
  IB_kapital: number;
  insattningar: number;
  uttag: number;
  bank: number;
  B10_total: number;
  B1: number;
  B2: number;
  B3: number;
  B4: number;
  B5: number;
  B6: number;
  B7: number;
  B8: number;
  B9: number;
  B13: number;
  B14: number;
  B15: number;
  B16: number;
  B13_forutbetalda: number;
}

interface NEBilagaProps {
  neData: NEData | null;
  selectedYear: number;
  isYearLocked: boolean;
  onLockYear: () => Promise<void>;
}

function fmt(value: number | undefined | null): string {
  const n = value ?? 0
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('sv-SE')
  if (n < 0) return `−${formatted} kr`
  return `${formatted} kr`
}

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[9px] font-black flex items-center justify-center hover:bg-emerald-100 hover:text-emerald-600 transition-colors focus:outline-none"
        aria-label="Info"
        type="button"
      >
        ?
      </button>
      {visible && (
        <span className="absolute z-50 left-6 top-1/2 -translate-y-1/2 w-64 bg-gray-900 text-white text-[10px] font-medium leading-relaxed px-3 py-2 rounded-xl shadow-xl pointer-events-none">
          {text}
          <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 border-4 border-transparent border-r-gray-900" />
        </span>
      )}
    </span>
  )
}

export default function NEBilaga({ neData, selectedYear, isYearLocked, onLockYear }: NEBilagaProps) {
  const [showAllNERows, setShowAllNERows] = useState(false)
  if (!neData) return <div className="p-12 text-gray-400 italic">Hämtar data från huvudboken...</div>

  const R14 = neData.R14 ?? 0
  const r14Color = R14 > 0 ? 'text-green-600' : R14 < 0 ? 'text-red-500' : 'text-gray-400'
  const r14Bg   = R14 > 0 ? 'bg-green-50 border-green-200' : R14 < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'

  // Balanskontroll ska alltid köras, även om bankkontot är 0 eller negativt.
  // Ett negativt banksaldo är fortfarande en del av balansräkningen och får
  // inte dölja en faktisk obalans.
  const tillgangar =
    (neData.B1 ?? 0) + (neData.B2 ?? 0) + (neData.B3 ?? 0) + (neData.B4 ?? 0) +
    (neData.B5 ?? 0) + (neData.B6 ?? 0) + (neData.B7 ?? 0) + (neData.B8 ?? 0) +
    (neData.B9 ?? 0)

  const kapitalOchSkulder =
    (neData.B10_total ?? 0) + (neData.B13 ?? 0) + (neData.B14 ?? 0) +
    (neData.B15 ?? 0) + (neData.B16 ?? 0)

  // Full NE-balanskontroll: B1-B9 = B10 + B13-B16.
  const balansDiff = Math.round((tillgangar - kapitalOchSkulder) * 100) / 100

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="bg-white p-5 sm:p-8 md:p-12 rounded-[3rem] border shadow-sm">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-emerald-600 mb-8 border-b pb-4">
          NE-Bilaga Specifikation
        </h2>

        {Math.abs(balansDiff) > 1 && (
          <div className="mb-8 bg-red-50 border-2 border-red-200 p-4 sm:p-6 rounded-2xl text-red-600 font-black text-xs uppercase text-center italic tracking-widest animate-pulse">
            ⚠️ Systemvarning: Obalans upptäckt ({balansDiff.toLocaleString('sv-SE')} kr). Tillgångar matchar inte eget kapital och skulder.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {/* VÄNSTER KOLUMN: RESULTAT (R) */}
          <div className="space-y-0">
            <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4 italic underline">
              Resultat (R)
            </h3>

            <div className={`${!showAllNERows && Math.abs(neData.R1 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R1 Momspliktiga intäkter</span>
              <span className="whitespace-nowrap">{fmt(neData.R1)}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R2 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R2 Momsfria intäkter</span>
              <span className="whitespace-nowrap">{fmt(neData.R2)}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R3 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R3 Bil- och bostadsförmån m.m.</span>
              <span className="whitespace-nowrap">{fmt(neData.R3)}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R4 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R4 Ränteintäkter m.m.</span>
              <span className="whitespace-nowrap">{fmt(neData.R4)}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R5 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R5 Varor, material och tjänster</span>
              <span className="whitespace-nowrap">{fmt(-Math.abs(neData.R5 ?? 0))}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R6 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R6 Övriga externa kostnader</span>
              <span className="whitespace-nowrap">{fmt(-Math.abs(neData.R6 ?? 0))}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R7 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span className="flex items-center flex-wrap">
                R7 Anställd personal
                <Tooltip text="SoloLedger är avsett för enskild firma utan anställda. Denna ruta ska därför normalt vara 0 kr." />
              </span>
              <span className="whitespace-nowrap">{fmt(-Math.abs(neData.R7 ?? 0))}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R8 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R8 Räntekostnader m.m.</span>
              <span className="whitespace-nowrap">{fmt(-Math.abs(neData.R8 ?? 0))}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R9 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R9 Avskrivningar byggnader/mark</span>
              <span className="whitespace-nowrap">{fmt(-Math.abs(neData.R9 ?? 0))}</span>
            </div>

            <div className={`${!showAllNERows && Math.abs(neData.R10 ?? 0) < 0.005 ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600`}>
              <span>R10 Avskrivningar inventarier m.m.</span>
              <span className="whitespace-nowrap">{fmt(-Math.abs(neData.R10 ?? 0))}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAllNERows(v => !v)}
              className="w-full mt-2 mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {showAllNERows ? '− Dölj tomma deklarationsrutor' : '+ Visa alla deklarationsrutor'}
            </button>


            <div className="my-3 border-t-2 border-dashed border-gray-300" />

            <div className="flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-700">
              <span>R11 Bokfört resultat</span>
              <span className={`whitespace-nowrap ${neData.R11 < 0 ? 'text-red-500' : ''}`}>{fmt(neData.R11)}</span>
            </div>

            <div className="flex flex-wrap justify-between gap-x-3 border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span className="flex items-center flex-wrap">
                R12 Ej avdragsgilla kostnader
                <Tooltip text="Detta är kostnader som inte är skattemässigt avdragsgilla, t.ex. konto 6992." />
              </span>
              <span className="whitespace-nowrap">{fmt(neData.R12)}</span>
            </div>

            <div className={`mt-4 p-4 sm:p-6 rounded-2xl border flex flex-wrap justify-between items-center gap-3 font-black italic ${r14Bg}`}>
              <span className={`text-xs uppercase flex items-center flex-wrap ${r14Color}`}>
                R14 Skattemässigt resultat
                <Tooltip text="Detta är ditt skattemässiga resultat (R14 i NE-bilagan)." />
              </span>
              <span className={`text-2xl tracking-tighter whitespace-nowrap ${r14Color}`}>{fmt(R14)}</span>
            </div>
          </div>

          {/* HÖGER KOLUMN: BALANS (B) */}
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 mb-4">
              <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest italic underline">
                Balans (B)
              </h3>
              <span className="text-[9px] text-gray-400 font-bold italic">
                NE förenklat årsbokslut
              </span>
            </div>

            <div className="rounded-3xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
                Tillgångar
              </div>

              {[
                ['B1', 'Immateriella anläggningstillgångar', neData.B1],
                ['B2', 'Byggnader och markanläggningar', neData.B2],
                ['B3', 'Mark och andra tillgångar som inte får skrivas av', neData.B3],
                ['B4', 'Maskiner och inventarier', neData.B4],
                ['B5', 'Övriga anläggningstillgångar', neData.B5],
                ['B6', 'Varulager', neData.B6],
                ['B7', 'Kundfordringar', neData.B7],
                ['B8', 'Övriga fordringar', neData.B8],
                ['B9', 'Kassa och bank', neData.B9],
              ].filter(([, , value]) => showAllNERows || Math.abs(Number(value ?? 0)) >= 0.005).map(([code, label, value]) => (
                <div
                  key={String(code)}
                  className="flex flex-wrap justify-between gap-x-3 border-t border-gray-100 px-4 py-2.5 text-sm italic font-bold text-gray-600"
                >
                  <span><strong className="text-gray-800">{code}</strong> {label}</span>
                  <span className="whitespace-nowrap">{fmt(Number(value ?? 0))}</span>
                </div>
              ))}

              <div className="flex flex-wrap justify-between gap-x-3 border-t-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-black uppercase italic text-gray-500">
                <span>Summa tillgångar</span>
                <span className="whitespace-nowrap">{fmt(tillgangar)}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
                Eget kapital & skulder
              </div>

              <div className="border-t border-gray-100 p-4 bg-emerald-50/30">
                <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 text-sm font-black italic">
                  <span className="flex items-center flex-wrap">
                    B10 Eget kapital
                    <Tooltip text="Eget kapital = kapital vid årets början + ackumulerat resultat + egna insättningar − egna uttag/skatteavräkning." />
                  </span>
                  <span className="text-emerald-600 whitespace-nowrap">{fmt(neData.B10_total)}</span>
                </div>

                <div className="mt-3 space-y-1.5 text-[9px] font-black uppercase tracking-tighter opacity-70">
                  <div className="flex flex-wrap justify-between gap-x-3 italic">
                    <span>IB kapital (2010/2019):</span>
                    <span>{fmt(neData.IB_kapital)}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 italic">
                    <span>Ackumulerat resultat:</span>
                    <span>{fmt((neData.B10_total ?? 0) - (neData.IB_kapital ?? 0) - (neData.insattningar ?? 0) + (neData.uttag ?? 0))}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 text-emerald-600 italic">
                    <span>Egna insättningar (2018):</span>
                    <span>+{fmt(neData.insattningar)}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 text-orange-600 italic">
                    <span className="flex items-center flex-wrap">
                      Uttag & skatteavräkning (2012/2013)
                      <Tooltip text="Privata uttag samt ägarens skatter och avgifter minskar eget kapital." />
                    </span>
                    <span>{fmt(-Math.abs(neData.uttag ?? 0))}</span>
                  </div>
                </div>
              </div>

              <div className={`${!showAllNERows ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-t border-gray-100 px-4 py-2.5 text-sm italic font-bold text-gray-300 bg-gray-50/50`}>
                <span className="flex items-center">
                  B11 Obeskattade reserver
                  <Tooltip text="B11 fylls inte i när du upprättar förenklat årsbokslut." />
                </span>
                <span>—</span>
              </div>

              <div className={`${!showAllNERows ? "hidden " : ""}flex flex-wrap justify-between gap-x-3 border-t border-gray-100 px-4 py-2.5 text-sm italic font-bold text-gray-300 bg-gray-50/50`}>
                <span className="flex items-center">
                  B12 Avsättningar
                  <Tooltip text="B12 fylls inte i när du upprättar förenklat årsbokslut." />
                </span>
                <span>—</span>
              </div>

              {[
                ['B13', 'Låneskulder', neData.B13],
                ['B14', 'Skatteskulder', neData.B14],
                ['B15', 'Leverantörsskulder', neData.B15],
                ['B16', 'Övriga skulder', neData.B16],
              ].filter(([, , value]) => showAllNERows || Math.abs(Number(value ?? 0)) >= 0.005).map(([code, label, value]) => (
                <div
                  key={String(code)}
                  className="flex flex-wrap justify-between gap-x-3 border-t border-gray-100 px-4 py-2.5 text-sm italic font-bold text-gray-600"
                >
                  <span><strong className="text-gray-800">{code}</strong> {label}</span>
                  <span className="whitespace-nowrap">{fmt(Number(value ?? 0))}</span>
                </div>
              ))}

              <div className="flex flex-wrap justify-between gap-x-3 border-t-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-black uppercase italic text-gray-500">
                <span>Summa eget kapital & skulder</span>
                <span className="whitespace-nowrap">{fmt(kapitalOchSkulder)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAllNERows(v => !v)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {showAllNERows ? '− Dölj tomma deklarationsrutor' : '+ Visa alla deklarationsrutor'}
            </button>

            <div className={`rounded-2xl border px-4 py-3 text-[10px] font-black uppercase italic tracking-wider ${
              Math.abs(balansDiff) <= 1
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {Math.abs(balansDiff) <= 1
                ? '✓ Balansräkningen balanserar'
                : `⚠ Balansdifferens ${fmt(balansDiff)}`}
            </div>
          </div>
        </div>

        {/* Låsningsknapp */}
        <div className="mt-8 pt-6 border-t border-dashed border-gray-200 flex justify-end">
          {isYearLocked ? (
            <div className="w-full sm:w-auto flex items-center justify-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3">
              <span>🔒</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-center">
                Räkenskapsår {selectedYear} är låst
              </span>
            </div>
          ) : (
            <button
              onClick={onLockYear}
              className="w-full sm:w-auto group flex items-center justify-center gap-2 bg-gray-800 hover:bg-red-700 text-white rounded-2xl px-6 py-3 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <span className="text-base">🔒</span>
              <span className="text-[10px] font-black uppercase tracking-widest">
                Lås räkenskapsår {selectedYear}
              </span>
            </button>
          )}
        </div>

      </div>
    </div>
  )
}