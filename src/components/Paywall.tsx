'use client'

import SubscribeButton from './SubscribeButton'

interface PaywallProps {
  feature: string
  user?: any // ✅ Tillåter att komponenten tar emot user från page.tsx
}

const FEATURE_DESCRIPTIONS: Record<string, { icon: string; description: string; bullets: string[] }> = {
  'Momsrapport': {
    icon: '🧾',
    description: 'Generera din momsrapport automatiskt och exportera den för inlämning till Skatteverket.',
    bullets: ['Automatisk beräkning av ingående/utgående moms', 'Export till Skatteverket-format', 'Historik per period'],
  },
  'NE-Bilaga': {
    icon: '📋',
    description: 'Fyll i din NE-bilaga automatiskt baserat på årets bokföring.',
    bullets: ['Förberäknade fält från din bokföring', 'Export som PDF', 'Stöd för flera räkenskapsår'],
  },
  // ✅ Lägger till en snygg beskrivning för din nya transaktionsspärr också!
  'Obegränsat antal transaktioner': {
    icon: '📊',
    description: 'Du har nått gratisgränsen på 15 transaktioner. Uppgradera för att fortsätta bokföra obegränsat.',
    bullets: ['Lås upp obegränsad bokföring direkt', 'Spara alla dina verifikationer säkert', 'Inga dolda avgifter eller bindningstider'],
  },
}

export default function Paywall({ feature, user }: PaywallProps) {
  const info = FEATURE_DESCRIPTIONS[feature] ?? {
    icon: '🔒',
    description: 'Den här funktionen kräver SoloLedger Premium.',
    bullets: [],
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="bg-white rounded-[2.5rem] border-2 border-dashed border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
        
        {/* Ikon */}
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
          {info.icon}
        </div>

        {/* Rubrik */}
        <h2 className="text-xl font-black uppercase tracking-tight text-gray-900 mb-2">
          {feature}
        </h2>
        <p className="text-sm font-black text-emerald-600 uppercase tracking-wider mb-4">
          Premium-funktion
        </p>

        {/* Beskrivning */}
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          {info.description}
        </p>

        {/* Bullet points */}
        {info.bullets.length > 0 && (
          <ul className="text-left mb-6 space-y-2">
            {info.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-emerald-500 font-black mt-0.5">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 🔥 Urgency-text för högre konvertering */}
        <p className="text-xs text-amber-600 font-bold mb-3">
          ⚡️ Lås upp denna funktion och slipp det manuella arbetet direkt!
        </p>

        {/* ✅ Vi skickar med user-objektet ner till knappen så den kan skicka ID:t till Stripe */}
        <SubscribeButton user={user} />

        <p className="text-xs text-gray-400 mt-3">
          14 dagars gratis testperiod · Avbryt när som helst
        </p>
      </div>
    </div>
  )
}