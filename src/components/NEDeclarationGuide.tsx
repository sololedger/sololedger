'use client'

import { useCallback, useRef, type ReactNode } from 'react'

const sources = {
  ne: 'https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet/fyllainebilagan/skattemassigajusteringar.4.361dc8c15312eff6fd2c7d1.html',
  service: 'https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet/lamnainnebilaganietjansten.4.361dc8c15312eff6fd10b4b.html',
  fees: 'https://www.skatteverket.se/egenavgifter',
  loss: 'https://www.skatteverket.se/foretag/drivaforetag/foretagsformer/enskildnaringsverksamhet/underskott.4.361dc8c15312eff6fd32a54.html',
}

function Source({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block py-2 text-emerald-800 underline underline-offset-2">{children} (Skatteverket, ny flik)</a>
}

function Step({ title, why, children }: { title: string; why: string; children: ReactNode }) {
  return <details className="rounded-xl border border-gray-200 bg-white">
    <summary className="min-h-11 cursor-pointer p-4 font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">{title}</summary>
    <div className="space-y-3 border-t border-gray-100 p-4 leading-relaxed"><p><strong>Varför?</strong> {why}</p>{children}</div>
  </details>
}

export default function NEDeclarationGuide({ year, companyName, onOpenYearEnd, initialOpenDetails }: {
  year: number
  companyName?: string | null
  onOpenYearEnd?: (openDetails: number[]) => void
  initialOpenDetails?: readonly number[]
}) {
  const guide = useRef<HTMLDetailsElement | null>(null)
  const restoreGuide = useCallback((node: HTMLDetailsElement | null) => {
    guide.current = node
    if (!node || !initialOpenDetails) return
    // Restore native disclosures only on this visit's mount, with no saved answers.
    const details = [node, ...node.querySelectorAll<HTMLDetailsElement>('details')]
    details.forEach((detail, index) => { detail.open = initialOpenDetails.includes(index) })
    node.querySelector<HTMLElement>(':scope > summary')?.focus()
  }, [initialOpenDetails])
  function openYearEnd() {
    if (!guide.current || !onOpenYearEnd) return
    const openDetails = [guide.current, ...guide.current.querySelectorAll<HTMLDetailsElement>('details')]
      .flatMap((detail, index) => detail.open ? [index] : [])
    onOpenYearEnd(openDetails)
  }
  return <details ref={restoreGuide} className="mb-6 rounded-2xl border border-gray-200 text-sm text-gray-700 break-words">
    <summary className="min-h-11 cursor-pointer p-4 text-base font-bold text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Från NE-underlag till deklaration · fem steg</summary>
    <section aria-label={`Deklarationsvägledning för ${year}`} className="space-y-3 border-t border-gray-100 p-3 sm:p-4">
      <p className="font-semibold">{companyName?.trim() || 'Företagsnamn saknas – kontrollera Profil'} · Inkomstår {year}</p>
      <p>Läs ett steg i taget. Deklarationen för {year} lämnas normalt {year + 1}. Kontrollera årets blankett och datum hos Skatteverket.</p>
      <p className="rounded-xl bg-gray-50 p-3">SoloLedger visar bokföringsunderlag. Du bedömer kompletteringarna. Skatteverket hanterar deklarationen och skatteuträkningen. Här sparas inga svar eller klarmarkeringar och inget skickas in.</p>
      <Step title="1. Gör bokslutsunderlaget klart" why="Saknade eller dubbla poster ger fel underlag även om balansräkningen balanserar.">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Ta fram kontoutdrag, kvitton och fakturor för hela {year}, samt ditt bokslut om du redan har gjort ett.</li>
          <li>Följ Årsavsluts instruktioner för bank, obetalda fakturor, inventarier och moms. Där ser du vilka vyer du ska öppna och vad du ska jämföra.</li>
          <li>Saknas en faktura eller ett kvitto? Hämta en kopia från leverantören. Hämta kontoutdrag i banken. Jämför sedan datum och belopp med Bokföring.</li>
        </ol>
        <p><strong>Om något inte stämmer:</strong> utred posten mot underlaget innan du använder befintlig bokning eller rättelse i Bokföring. Kringgå inte ett låst år eller en spärr.</p>
        {onOpenYearEnd && <button type="button" onClick={openYearEnd} className="min-h-11 rounded-lg border px-3 py-2 font-semibold text-emerald-800">Öppna Årsavslut</button>}
      </Step>
      <Step title="2. Hitta beloppen och kontrollera dem" why="Bokförda belopp är inte automatiskt bedömda skatteuppgifter.">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Stäng guiden för att se rapporten nedanför. B-rutorna visar tillgångar, eget kapital och skulder. R1–R11 visar årets bokförda resultat. Jämför med ditt bokslut.</li>
          <li>Öppna Kontrollera NE-underlaget, välj en ruta och Visa detaljer vid ett konto. Journalen visar datum, verifikationsnummer och bokförda belopp. Visa beräkningsförklaring berättar hur underlaget används.</li>
          <li>R12 har samma resultat som R11. R13/R14 innehåller vissa befintliga anpassningar till skattereglerna. Kontrollera vad som redan ingår innan du kompletterar, så att samma belopp inte räknas två gånger.</li>
        </ol>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3"><strong>Har du importerat ett färdigt bokslut via SIE?</strong> Jämför alltid R11 med det externa bokslutets resultat, även om ingen varning visas. Följ sedan hur R17 påverkas av anpassningarna till skattereglerna. Importerade resultatkonton kan vara nollade och då kan SoloLedger visa 0 trots att verksamheten haft ett resultat. En balanserad balansräkning löser inte detta.</p>
        <p><strong>Vid skillnad:</strong> använd inte beloppen i deklarationen förrän skillnaden är utredd. Ta fram extern resultatrapport och bokslutsverifikationer. Skapa inte en extra resultatbokning för att få siffrorna att stämma. Be om hjälp med just skillnaden mellan dessa underlag om den kvarstår.</p>
      </Step>
      <Step title="3. Ta fram uppgifter som bokföringen inte räcker till för" why="Skatteregler kan kräva andra uppgifter än bokföringen. En sådan ändring i deklarationen kallas skattemässig justering.">
        <p>Öppna de frågor som berör dig. Om du inte vet, ta fram dokumentet som anges i stället för att anta 0.</p>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Behöver du komplettera R15 eller R16?</summary>
          <p className="mt-2">R15 gäller skattepliktiga inkomster utanför bokförda intäkter. R16 gäller avdragsgilla utgifter utanför bokförda kostnader, även vissa utgifter bokförda mot eget kapital. Nollorna i SoloLedger är inte bedömda nollor.</p>
          <p className="mt-2">Ta fram underlaget och jämför med journalen. Saknas en vanlig affärshändelse, utred bokföringen först. För en deklarationsjustering: följ rutguiden, fyll i hos Skatteverket och behåll underlaget. Egna pensionspremier har en annan ruta, R38.</p>
          <Source href={sources.ne}>Läs om R15 och R16</Source>
        </details>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Har du en förlust kvar från tidigare deklaration?</summary>
          <p className="mt-2">Ett outnyttjat underskott är en skattemässig förlust som inte redan använts som avdrag. Det är inte automatiskt samma belopp som förra årets bokföringsförlust, R11/R17 eller eget kapital.</p>
          <p className="mt-2">Leta i specifikationen till årets inkomstdeklaration eller på Mina sidor → Beslutade skatteuppgifter. Jämför med föregående NE, R48, och eventuella omprövningsbeslut. Granska R24 i årets NE hos Skatteverket.</p>
          <p className="mt-2">Saknas uppgiften eller har förlusten redan använts på annat sätt? Ta fram senaste beslutet och utred vilket belopp som finns kvar innan du fyller i R24.</p>
          <Source href={sources.loss}>Läs om tidigare underskott</Source>
        </details>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Jämför förra årets uppskattade och slutliga egenavgifter</summary>
          <p className="mt-2">Egenavgifter är avgifter för dig som driver firman. Förra årets avdrag var en uppskattning. Nu jämför du det med avgifterna som blev beslutade. Det kallas egenavgiftsavstämning.</p>
          <p className="mt-2">Ta fram förra årets NE, R43, årets deklarationsspecifikation och slutskattebeskedet. De finns normalt i dina sparade deklarationshandlingar och hos Skatteverket. Kontrollera det tidigare avdrag du fick göra i R40 och avgifterna som Skatteverket beslutat i R41.</p>
          <p className="mt-2">F-skatteinbetalningar är inte egenavgiftsavstämning. Använd inte banköverföringar eller SoloLedgers skatteuppskattning. Saknas beskedet, hämta beslutet. Vid omprövning: kontrollera vilka år och belopp beslutet ändrar innan du fyller i rutorna.</p>
          <Source href={sources.fees}>Hitta hjälp för egenavgiftsavstämningen</Source>
        </details>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Gör årets avdrag för dina egenavgifter</summary>
          <p className="mt-2">Årets avdrag i R43 görs i deklarationen, inte som en bokföringskostnad. Öppna hjälpen för egenavgiftsavdrag i Skatteverkets NE-tjänst. Använd rätt inkomstår och uppgifter om bland annat din ålder och om verksamheten är aktiv eller passiv. Aktiv eller passiv är en skattebedömning, inte företagets momsstatus.</p>
          <p className="mt-2">SoloLedger väljer ingen procentsats. Om du inte vet vilken situation som gäller, läs årets villkor och ta fram berörda pensions- eller ersättningsbeslut innan du räknar.</p>
          <Source href={sources.fees}>Kontrollera årets egenavgiftsregler</Source>
        </details>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Andra avdrag, ersättningar eller sparade fonder?</summary>
          <p className="mt-2">Har du resor eller lokalkostnader utanför bokföringen, sjukpenning för näringsverksamheten, eget pensionssparande eller tidigare avsättningar? Samla kvitton, beräkningar, ersättningsbesked och föregående NE/specifikation. Läs rätt ruta i rutguiden innan du kompletterar.</p>
          <p className="mt-2">En fond betyder här ett tidigare uppskjutet beskattningsbelopp. Tidigare fonder och fördelning av inkomst mellan näringsverksamhet och kapital (räntefördelning) kan kräva åtgärd. Ta fram tidigare fond- och kapitalunderlag; lämna inte automatiskt 0. Be vid osäkerhet om hjälp med just din fond eller ditt kapitalunderlag. SoloLedger gör inte dessa beräkningar.</p>
          <Source href={sources.ne}>Hitta rätt ruta för övriga justeringar</Source>
        </details>
      </Step>
      <Step title="4. Fyll i NE hos Skatteverket" why="Du kompletterar och granskar uppgifterna i Skatteverkets tjänst. SoloLedger skickar inget.">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Logga själv in i Inkomstdeklaration 1 för rätt år. Välj Bilagor → Enskild näringsverksamhet (NE).</li>
          <li>Kontrollera Allmänna uppgifter. Fyll i Balans- och resultaträkning från ditt granskade bokslut. I Beräkning av skattemässigt resultat kompletterar du från steg 3. Läs årets hjälp för rutor och avrundning; SoloLedger ändrar inga belopp här.</li>
          <li>Spara avsnitten. Kontrollera sedan Dina deklarationsuppgifter → Näringsverksamhet och jämför med NE.</li>
        </ol>
        <p><strong>R17 är inte automatiskt ditt slutliga deklarationsresultat.</strong> Slutligt överskott eller underskott framgår efter återstående justeringar i Skatteverkets NE. Använd inte R17 som ett färdigt R47/R48-belopp.</p>
        <p><strong>Om ett fält eller en meny ser annorlunda ut:</strong> följ den aktuella instruktionen för ditt inkomstår. Kan du inte styrka en uppgift, återgå till dokumenten i steg 3 före inlämning.</p>
        <Source href={sources.service}>Öppna Skatteverkets stegvisa instruktion</Source>
      </Step>
      <Step title="5. Granska, skriv under och behåll underlagen" why="Läst guide, låst bokföringsår, inskickad deklaration och betald skatt är olika saker.">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Granska hela inkomstdeklarationen, även uppgifter utanför firman. Kontrollera att NE avser rätt inkomstår och att dina kompletteringar finns med.</li>
          <li>När allt stämmer: följ Skatteverkets Skicka in och signera där. Spara kvittensen som PDF på din dator eller mobil.</li>
          <li>Behåll även inlämnad NE, ditt underskrivna bokslut, skattebeslut och beräkningsunderlag i en mapp för {year}. Spara hjälputräkningarna separat enligt tjänstens instruktion.</li>
        </ol>
        <p><strong>Saknar du kvittensen?</strong> Kontrollera hos Skatteverket om deklarationen tagits emot och hämta kvittensen där. Ett sparat utkast bevisar inte inlämning. Betalning kontrolleras separat mot beslut och skattekonto.</p>
        <p>I NE-Bilaga kan du spara versioner i deklarationshistoriken. Ett bokföringsunderlag kräver låst år och godkända kontroller. Egna och faktiskt deklarerade uppgifter kan dokumenteras även utan låst år. En sparad version är inte ett inlämningskvitto och årslåset ersätter inte dina deklarationshandlingar.</p>
        <Source href={sources.service}>Läs om granskning och kvittens</Source>
      </Step>
      <p className="text-xs text-gray-600">Källor kontrollerade 23 oktober 2026. Årsblankett, e-tjänst, datum och personliga förutsättningar måste kontrolleras för det år du deklarerar.</p>
    </section>
  </details>
}
