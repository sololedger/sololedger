'use client'

interface FAQSection {
  icon: string
  iconColor: string
  title: string
  content: React.ReactNode
}

function Section({ icon, iconColor, title, content }: FAQSection) {
  return (
    <section className="space-y-4">
      <h3 className={`text-base font-black tracking-tight text-gray-800 uppercase italic flex items-center gap-2 ${iconColor}`}>
        <span>{icon}</span>
        <span className="text-gray-800">{title}</span>
      </h3>
      {content}
    </section>
  )
}

function CodeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 text-xs space-y-2 font-mono text-gray-600 leading-relaxed">
      {children}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline font-black text-emerald-600">{children}</span>
  )
}

export default function FAQ() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="bg-white p-12 rounded-[3rem] border shadow-sm">
        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-emerald-600 mb-2">
          Hjälp & FAQ
        </h2>
        <p className="text-sm text-gray-400 font-medium mb-10 border-b border-gray-100 pb-6">
          SoloLedger — guiden för dig som driver enskild firma
        </p>

        <div className="space-y-10">

          {/* IB */}
          <Section
            icon="🚀"
            iconColor="text-emerald-500"
            title="Nytt räkenskapsår & Ingående Balans (IB)"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Varje nytt år måste balansräkningen föras vidare från föregående år.
                  Du gör detta genom <span className="font-bold text-gray-800">en enda manuell bokföringsrad</span>.
                </p>

                <CodeBox>
                  <p className="font-bold text-gray-700 mb-1">Gör så här den 1 januari:</p>
                  <p>1. Kontrollera vad <Tag>B10 (Eget kapital)</Tag> slutade på.</p>
                  <p>2. Byt till det nya året i appen.</p>
                  <p>3. Välj <Tag>"Ingående balans - Eget kapital"</Tag> och ange beloppet.</p>
                  <p>Systemet bokar automatiskt konto <Tag>2010</Tag> mot konto <Tag>1930</Tag>.</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  Detta är en teknisk startbokning för att få balans i systemet — den påverkar inte dina faktiska pengar.
                </p>

                <p className="text-xs italic text-gray-400">
                  Resultaträkningen (R-rader) nollställs automatiskt varje år.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* SKATT */}
          <Section
            icon="📊"
            iconColor="text-emerald-500"
            title="Skatt i Enskild Firma"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Vinsten i firman (<Tag>R14</Tag>) är din personliga inkomst.
                </p>

                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Beskattning:</b> Vinsten beskattas ofta med ca 40–45% (skatt + egenavgifter).</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Bokföring:</b> Skatt är inte en kostnad. Betalning bokförs som <Tag>2013 (uttag)</Tag>.</span>
                  </li>
                </ul>

                <p className="text-xs italic text-gray-400">
                  Exempel: 100 000 kr i vinst kan inneberar cirka 40 000–45 000 kr i skatt.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* MOMS */}
          <Section
            icon="💸"
            iconColor="text-orange-500"
            title="Hur fungerar momsen?"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Momsen tillhör inte företaget — du redovisar den till staten.
                </p>

                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-orange-500 mt-0.5">▸</span>
                    <span><b>Momsbefriad:</b> Under 80 000 kr → ingen moms.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-orange-500 mt-0.5">▸</span>
                    <span><b>Momsregistrerad:</b> Utgående moms − ingående moms = skuld/fordran.</span>
                  </li>
                </ul>

                <p className="text-xs italic text-gray-400">
                  I appen räknas detta automatiskt och visas på <Tag>B16</Tag>.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* INTÄKT VS INSÄTTNING */}
          <Section
            icon="🧾"
            iconColor="text-emerald-500"
            title="Intäkt vs Insättning"
            content={
              <div className="space-y-3">
                <CodeBox>
                  <p><Tag>Intäkt (R1):</Tag> Pengar du tjänar</p>
                  <p><Tag>Insättning (2018):</Tag> Pengar du själv sätter in</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  Insättningar påverkar inte resultatet — bara kapitalet.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* PRIVAT VS FÖRETAG */}
          <Section
            icon="👤"
            iconColor="text-emerald-500"
            title="Privat vs Företag"
            content={
              <div className="space-y-3">
                <CodeBox>
                  <p>Privat köp → inte kostnad</p>
                  <p>Uttag → <Tag>2013</Tag></p>
                  <p>Insättning → <Tag>2018</Tag></p>
                </CodeBox>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* RESULTAT VS PENGAR */}
          <Section
            icon="🧮"
            iconColor="text-emerald-500"
            title="Resultat vs pengar"
            content={
              <div className="space-y-3">
                <CodeBox>
                  <p>Resultat (<Tag>R14</Tag>) = vad du tjänat</p>
                  <p>Bank (<Tag>B13</Tag>) = faktiska pengar</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  Skillnaden beror på t.ex. moms, avskrivningar och uttag.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* VANLIGA MISSTAG */}
          <Section
            icon="⚠️"
            iconColor="text-red-500"
            title="Vanliga misstag"
            content={
              <div className="space-y-3">
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">❌ Glömmer IB (Ingående Balans) vid nytt år</li>
                  <li className="flex gap-2">❌ Bokför privata köp som kostnader i firman</li>
                  <li className="flex gap-2">❌ Tror att den personliga skatten är en företagskostnad</li>
                  <li className="flex gap-2">❌ Blandar ihop vad som är en ren intäkt och en egen insättning</li>
                </ul>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* DEKLARATION */}
          <Section
            icon="📝"
            iconColor="text-emerald-500"
            title="Inför Deklarationen"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Använd NE-bilagan i appen som facit.
                </p>

                <CodeBox>
                  <p>Kopiera: R1, R5, R6, R14, B10 osv</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  Du behöver inte räkna om något manuellt.
                </p>
              </div>
            }
          />

          </div>

        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-300 italic">
            SoloLedger — Smart. Enkelt. Kontroll i nuet.
          </p>
        </div>
      </div>
    </div>
  )
}