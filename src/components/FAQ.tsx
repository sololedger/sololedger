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
                  Varje nytt year måste balansräkningen föras vidare från föregående year.
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
                  Resultaträkningen (R-rader) nollställs automatiskt varje year.
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
                  Vinsten i firman (<Tag>R14</Tag>) är din personliga inkomst. Det finns ingen separat "företagsskatt", utan allt deklareras på din privata inkomstdeklaration (via NE-bilagan).
                </p>

                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Beskattning:</b> Vinsten beskattas med ca 40–45% totalt. Detta inkluderar både din kommunala inkomstskatt och dina egenavgifter (sociala avgifter).</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Hur betalas skatten?</b> Du betalar oftast ett schablonbelopp varje månad (preliminärskatt) till ditt skattekonto, eller så betalar du allt i efterhand vid deklarationen.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Bokföring:</b> Eftersom skatten är personlig är det <u>inte</u> en kostnad i firman. Varje gång du tar pengar från företagskontot för att betala din skatt bokför du det som ett vanligt <Tag>Privat uttag (2013)</Tag>.</span>
                  </li>
                </ul>

                <CodeBox>
                  <p className="font-bold text-gray-700 mb-1">Exempel — Du för över 5 000 kr till ditt skattekonto:</p>
                  <p>• <b>Kategori:</b> Välj kontot för Privata uttag (Konto 2013 mot 1930)</p>
                  <p>• <b>Belopp:</b> 5000 kr</p>
                  <p>• <b>Moms %:</b> 0%</p>
                  <p className="mt-2 text-gray-400 italic">Resultatet i firman ändras inte, men ditt banksaldo minskar och ditt privata uttag registreras korrekt.</p>
                </CodeBox>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* MOMS */}
          <Section
            icon="💸"
            iconColor="text-emerald-500"
            title="Hur fungerar momsen?"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Momsen tillhör inte företaget — du är bara en mellanhand som redovisar den till Skatteverket. 
                  Dina momskonton sammanställs löpande under fliken <span className="font-bold text-gray-800">Momsrapport</span>.
                </p>

                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Momsöversikten:</b> Det vita momskortet på förstasidan visar alltid hela årets ackumulerade moms. Det stora gröna kortet <Tag>Säkert uttag</Tag> drar automatiskt av dina obetalda momsskulder så att du aldrig råkar ta ut skattepengar privat.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Löpande momsredovisning:</b> Oavsett om du redovisar moms per månad, kvartal eller helt år, så bokför du betalningen eller återbäringen direkt när pengarna flyttas mellan ditt bankkonto och Skatteverket.</span>
                  </li>
                </ul>

                <CodeBox>
  <p className="font-bold text-gray-700 mb-1">Bokföring av momsregleringen via kategorin "Skattekonto (2012)":</p>
  <p className="mb-2">
    <b>1. Om du ska BETALA moms (Skuld):</b><br />
    När du för över pengar från din bank till Skatteverket för att reglera din moms, bokför du summan som ett <b>positivt</b> belopp (t.ex. <Tag>2434.14</Tag>). Systemet drar pengarna från banken (1930) och registrerar överföringen till ditt skattekonto (2012). Skulden raderas ur ditt säkra uttag.
  </p>
  <p>
    <b>2. Om du får TILLBAKA moms (Återbäring):</b><br />
    När Skatteverket sätter in momspengar på ditt konto, bokför du summan med ett <b>minusbelopp</b> (t.ex. <Tag>-1500.00</Tag>). Systemet ökar pengarna på banken (1930) och balanserar upp ditt skattekonto (2012) helt automatiskt.
  </p>
</CodeBox>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* PRIVATA UTLÄGG */}
          <Section
            icon="💳"
            iconColor="text-emerald-500"
            title="Inköp med privata pengar"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Om du köper något till firman med ditt privata bankkort eller swish, räknas det som ett privat utlägg. 
                </p>
                <CodeBox>
                  <p className="font-bold text-gray-700 mb-1">Hur det bokförs:</p>
                  <p>Utgiften ska fortfarande dras som en vanlig kostnad i företaget. Skillnaden är att motkontot blir en <Tag>Egen insättning (2018)</Tag> istället för företagets bankkonto (<Tag>1930</Tag>).</p>
                  <p className="mt-2 text-gray-500"><i>Tips: Lägg till ett konto i din Kontoplan (t.ex. "Privat utlägg") inställt på ditt önskade kostnadskonto som Debet, och konto 2018 som Kredit.</i></p>
                </CodeBox>
              </div>
            }
          />

<hr className="border-gray-100" />

          {/* PERIODISERING */}
          <Section
            icon="⏳"
            iconColor="text-blue-500"
            title="Periodisering — Kostnader över nyår"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Om du köper något i slutet av året (t.ex. en årslicens för ett program i december) som ska gälla för nästa år, ska kostnaden höra till det år den faktiskt används. Detta kallas för periodisering.
                </p>
                
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-blue-500 mt-0.5">▸</span>
                    <span><b>Hur gör jag?</b> När du bokför utgiften aktiverar du bara knappen <span className="font-bold">"Periodisera till nästa räkenskapsår"</span> i formuläret och väljer vilket år/månad kostnaden avser.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-500 mt-0.5">▸</span>
                    <span><b>Vad händer under huven?</b> Appen drar pengarna från banken och bokar momsen direkt på det nuvarande året. Nettoeffekten (kostnaden) parkeras på <Tag>Konto 1790 (Förutbetalda kostnader)</Tag> över nyår, och flyttas automatiskt till ditt kostnadskonto när det nya året startar.</span>
                  </li>
                </ul>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* KORRIGERING */}
          <Section
            icon="↩️"
            iconColor="text-emerald-500"
            title="Hur rättar jag en felaktig bokföring?"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Bokförda verifikat är låsta och ska inte raderas eller ändras direkt i efterhand enligt god redovisningssed.
                </p>
                <CodeBox>
                  <p>1. Leta upp den felaktiga raden i din transaktionslista.</p>
                  <p>2. Klicka på krysset (<Tag>✕</Tag>) längst till höger där det står <i>"Skapa korrigeringsverifikation"</i> när du för musen över.</p>
                  <p>3. Systemet skapar nu automatiskt en exakt spegelvänd transaktion som helt nollar ut det gamla felet och stryker texten.</p>
                  <p>4. Lägg därefter in transaktionen på nytt via formuläret med helt korrekta uppgifter.</p>
                </CodeBox>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* BILAGOR & KAVITTOKRAV */}
          <Section
            icon="📑"
            iconColor="text-emerald-500"
            title="Bilagor och Kvittokrav"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Alla transaktioner i bokföringen måste ha ett tillhörande underlag (kvitto eller faktura).
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Digitala kvitton räcker:</b> Tack vare moderniseringen av Bokföringslagen behöver du inte längre spara fysiska papperskvitton.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Gör så här:</b> Fota papperskvittot eller spara digitala PDF-fakturor. Ladda upp filen som bilaga direkt i ditt bokföringsformulär. När filen är sparad i systemet kan du kasta papperslappen!</span>
                  </li>
                </ul>
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
                  <li className="flex gap-2">❌ Glömmer IB (Ingående Balans) vid nytt year</li>
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
            iconColor="text-orange-500"
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