'use client'
import { useState } from 'react'

interface NEData {
  R1: number;
  R2: number;
  R5: number;
  R6: number;
  R7: number;
  R8: number;
  R11: number;
  R12: number;
  R14: number;
  IB_kapital: number;
  insattningar: number;
  uttag: number;
  bank: number;
  B10_total: number;
  B16: number;
}

interface NEBilagaProps {
  neData: NEData | null;
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

export default function NEBilaga({ neData }: NEBilagaProps) {
  if (!neData) return <div className="p-12 text-gray-400 italic">Hämtar data från huvudboken...</div>

  const R14 = neData.R14 ?? 0
  const r14Color = R14 > 0 ? 'text-green-600' : R14 < 0 ? 'text-red-500' : 'text-gray-400'
  const r14Bg   = R14 > 0 ? 'bg-green-50 border-green-200' : R14 < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'

  const tillgangar = Math.abs(neData.bank ?? 0)
  const egetKapitalOchSkulder = (neData.B10_total ?? 0) + (neData.B16 ?? 0)
  const balansDiff = Math.round((tillgangar - egetKapitalOchSkulder) * 100) / 100

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="bg-white p-12 rounded-[3rem] border shadow-sm">
        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-emerald-600 mb-8 border-b pb-4">
          NE-Bilaga Specifikation
        </h2>

        {Math.abs(balansDiff) > 1 && (
          <div className="mb-8 bg-red-50 border-2 border-red-200 p-6 rounded-2xl text-red-600 font-black text-xs uppercase text-center italic tracking-widest animate-pulse">
            ⚠️ Systemvarning: Obalans upptäckt ({balansDiff.toLocaleString('sv-SE')} kr). Banken matchar inte kapitalet.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* VÄNSTER KOLUMN: RESULTAT (R) */}
          <div className="space-y-0">
            <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4 italic underline">
              Resultat (R)
            </h3>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span>R1 Nettoomsättning</span>
              <span>{fmt(neData.R1)}</span>
            </div>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span>R2 Övriga intäkter</span>
              <span>{fmt(neData.R2)}</span>
            </div>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span>R5 Varukostnader</span>
              <span>{fmt(-Math.abs(neData.R5 ?? 0))}</span>
            </div>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span>R6 Övriga externa kostnader</span>
              <span>{fmt(-Math.abs(neData.R6 ?? 0))}</span>
            </div>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span>R7 Personalkostnader</span>
              <span>{fmt(-Math.abs(neData.R7 ?? 0))}</span>
            </div>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span>R8 Avskrivningar</span>
              <span>{fmt(-Math.abs(neData.R8 ?? 0))}</span>
            </div>

            <div className="my-3 border-t-2 border-dashed border-gray-300" />

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-700">
              <span>R11 Bokfört resultat</span>
              <span className={neData.R11 < 0 ? 'text-red-500' : ''}>{fmt(neData.R11)}</span>
            </div>

            <div className="flex justify-between border-b pb-2 pt-2 text-sm italic font-bold text-gray-600">
              <span className="flex items-center">
                R12 Ej avdragsgilla kostnader
                <Tooltip text="Detta är kostnader som inte är skattemässigt avdragsgilla, t.ex. konto 6992." />
              </span>
              <span>{fmt(neData.R12)}</span>
            </div>

            <div className={`mt-4 p-6 rounded-2xl border flex justify-between items-center font-black italic ${r14Bg}`}>
              <span className={`text-xs uppercase flex items-center ${r14Color}`}>
                R14 Skattemässigt resultat
                <Tooltip text="Detta är ditt skattemässiga resultat (R14 i NE-bilagan)." />
              </span>
              <span className={`text-2xl tracking-tighter ${r14Color}`}>{fmt(R14)}</span>
            </div>
          </div>

          {/* HÖGER KOLUMN: BALANS (B) */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4 italic underline">
              Balans & Kapital (B)
            </h3>

            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 shadow-sm">
              <div className="flex justify-between border-b border-gray-200 pb-3 mb-3 text-sm font-black uppercase tracking-tighter italic">
                <span className="flex items-center">
                  B10 Eget Kapital
                  <Tooltip text="Eget kapital = IB + årets resultat + insättningar - uttag." />
                </span>
                <span className="text-emerald-600">{fmt(neData.B10_total)}</span>
              </div>
              <div className="space-y-2 opacity-70 text-[9px] font-black uppercase tracking-tighter">
                <div className="flex justify-between italic">
                  <span>IB Kapital (2010):</span>
                  <span>{fmt(neData.IB_kapital)}</span>
                </div>
                <div className="flex justify-between italic">
                  <span>Årets bokförda resultat:</span>
                  <span className={neData.R11 < 0 ? 'text-red-500' : ''}>{fmt(neData.R11)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 italic">
                  <span>Privata insättningar (2018):</span>
                  <span>+{fmt(neData.insattningar)}</span>
                </div>
                <div className="flex justify-between text-orange-600 italic">
                  <span>Privata uttag (2013):</span>
                  <span>{fmt(-Math.abs(neData.uttag ?? 0))}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between border-b pb-2 text-sm italic tracking-tight uppercase text-gray-400 font-black">
              <span>B13 Kassa och bank</span>
              <span className="text-gray-500">{fmt(neData.bank)}</span>
            </div>

            <div className="flex justify-between border-b pb-2 text-sm italic tracking-tight uppercase text-gray-400 font-black">
              <span>B16 Skulder (Moms m.m.)</span>
              <span className="text-gray-700">{fmt(neData.B16)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}