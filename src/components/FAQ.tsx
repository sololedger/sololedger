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
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="bg-white p-12 rounded-[3rem] border shadow-sm">
        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-emerald-600 mb-2">
          Hjälp & FAQ
        </h2>
        <p className="text-sm text-gray-400 font-medium mb-10 border-b border-gray-100 pb-6">
          SoloLedger — för dig som driver enskild firma utan anställda
        </p>

        <div className="space-y-10">

          {/* NYTT ÅR / BALANSER */}
          <Section
            icon="🚀"
            iconColor="text-emerald-500"
            title="Nytt räkenskapsår & ingående balanser"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  När du går vidare till ett nytt räkenskapsår behöver du <span className="font-bold text-gray-800">inte skapa någon manuell IB-bokning</span> i SoloLedger.
                  Balanskonton (1xxx–2xxx), till exempel bank, eget kapital och skulder, förs vidare automatiskt från tidigare år.
                </p>

                <CodeBox>
                  <p className="font-bold text-gray-700 mb-1">Så fungerar årsskiftet:</p>
                  <p>• <Tag>Balanskonton 1xxx–2xxx</Tag> fortsätter med sina ackumulerade saldon.</p>
                  <p>• <Tag>Resultatkonton 3xxx–8xxx</Tag> räknas per räkenskapsår.</p>
                  <p>• Du ska alltså inte boka <Tag>1930 mot 2010</Tag> bara för att ett nytt år börjar.</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  Om du börjar använda SoloLedger med en redan pågående verksamhet kan ingående balanser i stället följa med via en korrekt SIE-import.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* SKATT */}
          <Section
            icon="📊"
            iconColor="text-emerald-500"
            title="Skatt i enskild firma"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Vinsten i firman (<Tag>R14</Tag>) är din personliga inkomst. Det finns ingen separat "företagsskatt", utan allt deklareras på din privata inkomstdeklaration (via NE-bilagan).
                </p>

                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Beskattning:</b> Det är verksamhetens skattemässiga överskott som beskattas — inte hur mycket pengar du tar ut. Den faktiska skatten varierar bland annat med din övriga inkomst, kommunalskatt och egenavgifter.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Preliminärskatt:</b> Debiterad F-skatt är privat och är inte en kostnad i firman.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>SoloLedger:</b> Betalningar från företagskontot till ditt skattekonto kan bokföras via <Tag>2012 Avräkning för skatter och avgifter</Tag>. Kontot ingår i eget kapital och påverkar inte företagets resultat.</span>
                  </li>
                </ul>

                <CodeBox>
                  <p className="font-bold text-gray-700 mb-1">Exempel — 5 000 kr förs från företagsbanken till skattekontot:</p>
                  <p>• <b>Bank 1930:</b> minskar med 5 000 kr</p>
                  <p>• <b>2012:</b> registrerar skatteavräkningen/eget uttag</p>
                  <p>• <b>Resultat:</b> påverkas inte</p>
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
                    <span><b>Momsöversikten:</b> Det vita momskortet på förstasidan visar alltid hela årets ackumulerade moms. Det stora gröna kortet <Tag>Säkert uttag</Tag> tar hänsyn till beräknad skatt och moms för att ge en försiktig uppskattning av hur mycket som kan tas ut.</span>
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
                    När du för över pengar från din bank till Skatteverket för att reglera din moms, bokför du summan som ett <b>positivt</b> belopp (t.ex. <Tag>2500.00</Tag>). Systemet drar pengarna från banken (1930) och registrerar överföringen till ditt skattekonto (2012). Betalningen tas då med i SoloLedgers saldo- och momsberäkningar.
                  </p>
                  <p>
                    <b>2. Om du får TILLBAKA moms (Återbäring):</b><br />
                    När Skatteverket sätter in momspengar på ditt konto, bokför du summan med ett <b>minusbelopp</b> (t.ex. <Tag>-1500.00</Tag>). Systemet ökar pengarna på banken (1930) och registrerar återbetalningen i SoloLedgers saldo- och momsberäkningar.
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

          {/* SIE IMPORT */}
          <Section
            icon="📥"
            iconColor="text-sky-500"
            title="SIE-import, importhistorik & ångra import"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Har du bokföring från ett annat system kan du importera en <Tag>SIE-fil</Tag>. SoloLedger läser in verifikationerna och kopplar dem till den importerade batchen så att importen går att följa i efterhand.
                </p>

                <CodeBox>
                  <p><b>Importhistorik:</b> Under <Tag>Profil</Tag> ser du vilka SIE-filer som importerats, räkenskapsår, antal verifikationer, importtid och status.</p>
                  <p><b>Ångra import:</b> Om en import blev fel kan du välja <Tag>Ångra import</Tag>. SoloLedger skapar då automatiska rättelseverifikationer i stället för att radera bokföringshistoriken.</p>
                  <p><b>Spårbarhet:</b> I transaktionslistan grupperas en ångrad SIE-import kompakt. Du kan välja <Tag>Visa detaljer</Tag> för att se samtliga skapade KORRVER.</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  Automatisk ångring kan stoppas om räkenskapsåret är låst eller om någon av de importerade verifikationerna redan har korrigerats. Då behöver bokföringen hanteras med vanliga rättelser i stället.
                </p>
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
                  Bokförda verifikat är låsta och ska inte raderas eller ändras direkt i efterhand enligt god redovisningssed. Om datum, beskrivning, belopp, kategori eller moms är fel använder du en korrigeringsverifikation (KORRVER).
                </p>
                <CodeBox>
                  <p>1. Leta upp den felaktiga raden i din transaktionslista.</p>
                  <p>2. Klicka på krysset (<Tag>✕</Tag>) längst till höger där det står <i>"Korrigera"</i> när du för musen över.</p>
                  <p>3. Systemet skapar automatiskt en spegelvänd KORRVER som neutraliserar den felaktiga verifikationen. Originalet ligger kvar, men markeras som rättat.</p>
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
            title="Bilagor, kvitton & arkivering"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Affärshändelser ska kunna styrkas med verifikationer, till exempel kvitto, faktura eller annat underlag. På en bokförd verifikation kan du använda <Tag>Hantera bilaga</Tag> för att komplettera eller byta bilagan utan att ändra själva bokföringen.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Papperskvitton kan digitaliseras:</b> Ett mottaget papperskvitto får kastas efter fotografering eller skanning om överföringen görs på ett sådant sätt att räkenskapsinformationen inte riskerar att förändras eller försvinna.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Spara underlagen:</b> Räkenskapsinformation ska normalt bevaras i sju år efter utgången av det kalenderår då räkenskapsåret avslutades. Se därför till att dina digitala underlag är läsbara och bevaras under hela arkiveringstiden.</span>
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
                  <p>Bank (<Tag>B9</Tag>) = bokfört saldo på kassa och bank</p>
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
                  <li className="flex gap-2">❌ Skapar en extra manuell IB-bokning vid varje nytt år trots att balanskontona redan förs vidare</li>
                  <li className="flex gap-2">❌ Bokför privata köp som kostnader i firman</li>
                  <li className="flex gap-2">❌ Tror att den personliga skatten är en företagskostnad</li>
                  <li className="flex gap-2">❌ Blandar ihop intäkt, egen insättning och eget uttag</li>
                  <li className="flex gap-2">❌ Raderar eller försöker skriva över en bokförd verifikation i stället för att skapa en KORRVER</li>
                  <li className="flex gap-2">❌ Importerar samma SIE-underlag flera gånger utan att kontrollera importhistoriken</li>
                </ul>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* DEKLARATION */}
          <Section
            icon="📝"
            iconColor="text-orange-500"
            title="Inför deklarationen"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  NE-bilagan i SoloLedger sammanställer bokföringen till relevanta R- och B-rutor och hjälper dig att stämma av balans- och resultaträkningen inför deklarationen.
                </p>

                <CodeBox>
                  <p>• Kontrollera att årets bokföring, moms och eventuella rättelser är klara.</p>
                  <p>• Kontrollera att balansräkningen balanserar.</p>
                  <p>• Använd SoloLedgers R- och B-rutor som underlag när du fyller i NE-bilagan.</p>
                  <p>• Tänk på att vissa skattemässiga justeringar kan bero på din egen situation och behöver kontrolleras separat.</p>
                </CodeBox>

                <p className="text-xs italic text-gray-400">
                  SoloLedger är ett bokföringshjälpmedel och ersätter inte individuell skatte- eller redovisningsrådgivning.
                </p>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* MÅLGRUPP & KONTAKT */}
          <Section
            icon="💚"
            iconColor="text-emerald-600"
            title="Vem är SoloLedger till för?"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  SoloLedger är byggt för <span className="font-bold text-gray-800">enskild firma utan anställda</span> och fokuserar på enkel löpande bokföring, moms, eget kapital, NE-underlag och SIE.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Har verksamheten anställda, mer avancerad lönehantering eller andra redovisningsbehov som ligger utanför appens funktioner bör du använda ett system som stödjer det eller ta hjälp av en redovisningskonsult.
                </p>

                <CodeBox>
                  <p><b>Frågor, problem eller feedback?</b></p>
                  <p>Kontakta oss på <Tag>sololedger2026@gmail.com</Tag></p>
                </CodeBox>
              </div>
            }
          />

          <hr className="border-gray-100" />

          {/* SÄKERHET OCH DATASKYDD */}
          <Section
            icon="🛡️"
            iconColor="text-emerald-600"
            title="Säkerhet, integritet & dataskydd"
            content={
              <div className="space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  SoloLedger använder flera lager av åtkomstkontroll för att skydda bokföringsdata och begränsa åtkomsten till den inloggade användarens uppgifter.
                </p>

                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Row-Level Security:</b> Databasregler begränsar åtkomsten så att en vanlig användare bara kan läsa sin egen bokföringsdata.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Skyddad anslutning:</b> Trafiken mellan webbläsaren och tjänsten skickas över HTTPS/TLS.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Autentisering:</b> Inloggade sessioner verifieras innan skyddade bokföringsfunktioner får användas.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span><b>Serverstyrda bokföringsflöden:</b> Centrala bokföringsåtgärder, rättelser, periodiseringar och SIE-importer hanteras genom kontrollerade serverfunktioner. Låsta räkenskapsår skyddas mot nya bokföringsändringar.</span>
                  </li>
                </ul>
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