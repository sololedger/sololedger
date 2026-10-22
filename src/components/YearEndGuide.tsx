'use client'

import { useSyncExternalStore } from 'react'

export type YearEndDestination = 'dashboard' | 'profil' | 'fakturor' | 'leverantorsskulder' | 'inventarier' | 'moms' | 'ne'

type Control = {
  title: string
  why: string
  actions: (year: number) => string[]
  system: string
  problem: string
  reviewed: string
  links: [YearEndDestination, string][]
}

const controls: Control[] = [
  {
    title: 'Bank och underlag',
    why: 'Banken och bokföringen behöver stämma, så att inga betalningar saknas eller räknas två gånger.',
    actions: year => [
      'Öppna Profil. Jämför sparade momsuppgifter och avdragsrätt med företagets registrering innan du bedömer momsen.',
      `Ta fram kontoutdrag och kvitton för ${year}. När året är slut behöver utdraget omfatta hela året till 31 december.`,
      'Öppna Bokföring. Jämför varje bankhändelses datum och belopp med historiken och dess verifikation. Skilj egen insättning och eget uttag från intäkt och kostnad.',
      'Jämför bankens slutsaldo med bokfört saldo. Bankkortet visar konto 1930. Om du använder andra konton, granska deras kontounderlag i NE-Bilaga. Om saldot skiljer redan vid årets början, utred den ingående balansen först.',
    ],
    system: 'SoloLedger visar registrerade poster och bokfört banksaldo. Programmet jämför inte med din bank och kan inte hitta saknade kvitton.',
    problem: 'Sök efter saknad, dubbel eller feldaterad post i historiken. Använd befintlig bokning eller rättelse först när underlaget visar vad som är rätt. Gissa inte konto för att få saldot att stämma.',
    reviewed: 'Du har jämfört hela kontoutdraget, hittat underlagen och rett ut varje differens. Ett visat banksaldo är inte i sig en genomförd bankavstämning.',
    links: [['dashboard', 'Bokföring'], ['profil', 'Profil'], ['ne', 'NE-Bilaga']],
  },
  {
    title: 'Obetalda kundfakturor',
    why: 'Även med bokslutsmetoden ska pengar som kunder är skyldiga vid årsskiftet tas med i bokslutet.',
    actions: year => [
      `Öppna Fakturor och kontrollera ${year}. Jämför alla utfärdade fakturor med bankbetalningar till och med 31 december, även fakturor som finns utanför SoloLedger.`,
      'För en faktura som verkligen var obetald vid årsskiftet: använd fakturans befintliga bokslutsfunktion för kundfordran. Kontrollera verifikationen och fordran i NE-Bilaga.',
      `När kunden betalar ${year + 1}, registrera betalningen på samma faktura med det verkliga datumet. Bokför inte samma försäljning och moms en gång till.`,
    ],
    system: 'SoloLedger kontrollerar registrerade fakturor, deras momsfakta och bokning. Programmet vet inte om en extern faktura saknas.',
    problem: 'Om momsfakta är osäkra eller fakturan redan kan vara bokförd: stanna och utred i fakturavyn innan du bokför. Följ fakturans befintliga rättelseväg vid fel.',
    reviewed: 'Du har jämfört alla fakturor med betalningarna och kontrollerat att nödvändiga kundfordringar är bokförda. Inga registrerade fakturor betyder inte automatiskt att kontrollen är utförd.',
    links: [['fakturor', 'Fakturor'], ['ne', 'NE-Bilaga']],
  },
  {
    title: 'Obetalda leverantörsfakturor',
    why: 'Årets kostnad och skuld ska finnas med även när du betalar fakturan efter årsskiftet.',
    actions: year => [
      `Samla mottagna fakturor som hör till ${year}. Jämför med banken: vilka var helt obetalda den 31 december?`,
      `Öppna Bokslutsskulder för ${year}. Följ frågorna om leveransår, fakturabelopp, moms, avdragsrätt och bilaga. Stödet gäller svenska vanliga kostnader i SEK som är helt obetalda vid årsskiftet.`,
      'Följ Visa i Bokföring och kontrollera kostnad, eventuell avdragsgill moms och leverantörsskuld. Kontrollera också skulden i NE-Bilaga, B15.',
      `Betala via samma bokslutsskuld på verkligt betalningsdatum ${year + 1}. Registrera inte betalningen som en ny kostnad.`,
    ],
    system: 'SoloLedger validerar registrering, koppling och bokning av den kända skulden. Du måste själv kontrollera att alla fakturor finns med.',
    problem: 'Använd Rätta en felbokning på samma skuld när det behövs. Utlandsfaktura, delbetalning, kreditfaktura och inventarie stöds inte i denna guide. Stanna och utred; använd inte en vanlig svensk kostnad som ersättning.',
    reviewed: 'Du har gått igenom alla mottagna fakturor och kontrollerat de bokslutsskulder som stöds. En tom lista är inte bevis att alla externa skulder saknas.',
    links: [['leverantorsskulder', 'Bokslutsskulder'], ['dashboard', 'Bokföring'], ['ne', 'NE-Bilaga']],
  },
  {
    title: 'Inventarier och avskrivningar',
    why: 'Större inköp kan vara tillgångar som används flera år. Då behöver värdet och årets avskrivning kontrolleras.',
    actions: year => [
      'Öppna Inventarier. Jämför årets inköp och kvitton med registret, även om listan är tom.',
      `Läs granskningsorsakerna och det befintliga förslaget för ${year}. Genomför nödvändig årsavskrivning i inventarievyn först när underlaget är säkert.`,
      'Kontrollera avskrivningens verifikation i Bokföring och kvarvarande inventarievärde i NE-Bilaga.',
    ],
    system: 'SoloLedger granskar registrerade tillgångar enligt det stöd som finns. Programmet kan inte veta om ett inköp saknas i registret.',
    problem: 'Osäkert ingående värde, utlands- eller obetalt inköp, försäljning av tillgång eller saknat regelunderlag kräver utredning. Gissa inte en avskrivning och kringgå inte en spärr.',
    reviewed: 'Du har jämfört registret med inköpen, rett ut varningarna och kontrollerat att nödvändiga avskrivningar är bokförda eller inte behövs.',
    links: [['inventarier', 'Inventarier'], ['dashboard', 'Bokföring'], ['ne', 'NE-Bilaga']],
  },
  {
    title: 'Moms och inköp från EU',
    why: 'Momsfri försäljning innebär inte automatiskt att exempelvis tjänsteinköp från ett annat EU-land saknar svensk moms.',
    actions: year => [
      'Ta fram fakturorna, exempelvis Adobe. I Bokföring: jämför fakturans säljare, land, datum, valuta, belopp och fakturamoms med EU-tjänsteposten och dess verifikation. En redan bokförd faktura ska inte bokföras igen.',
      'Kontrollera företagets momsregistrering och avdragsrätt i Profil. Namnet Adobe avgör inte land eller momsbehandling. En obetald utlandsfaktura kan inte hanteras som svensk Bokslutsskuld.',
      `Öppna Moms och välj själv perioden som hör till ${year}; momsperioden följer inte automatiskt guidens årsväljare. Beräkna rapporten och jämför Inköp från andra EU-länder med journalen och fakturorna. Kontrollera att alla perioder som ska redovisas finns.`,
      'Exempel, bara om underlaget styrker EU-tjänst 228 SEK utan fakturamoms, 25 % omvänd moms och ingen avdragsrätt: ruta 21 är 228 kr, ruta 30 är 57 kr och ruta 48 är 0 kr för denna post.',
      'När perioden är slut och underlaget stämmer: läs konsekvenserna innan du väljer Stäng momsperiod. Stängningen kan skapa en momsverifikation och låser perioden för vanlig momsrelaterad bokföring.',
    ],
    system: 'SoloLedger beräknar rapporten från bokförda momsfakta och kontrollerar periodens spärrar. Öppnandet av Moms kan skapa perioder enligt vyernas befintliga funktion. Guiden skickar ingen deklaration.',
    problem: 'Vid differens eller osäkra momsfakta: följ verifikationen till posten och använd befintlig rättelse efter utredning. Stäng inte perioden och välj inte avdrag för att få ett önskat belopp.',
    reviewed: 'Du har jämfört fakturorna och rapporten, rett ut differenser och kontrollerat perioderna. Granskad rapport, stängd period, deklarerad moms och betald moms är skilda saker.',
    links: [['dashboard', 'Bokföring'], ['profil', 'Profil'], ['moms', 'Moms']],
  },
  {
    title: 'Resultat, balans och bokslutsunderlag',
    why: 'Bokföringen behöver granskas och dokumenteras innan året avslutas. En balanserad rapport är inte en färdig inkomstdeklaration.',
    actions: year => [
      `Öppna NE-Bilaga för ${year}. Läs underlagsgranskningen och följ varningarna till konton och journal. Jämför resultat, bank, kundfordringar, B15 leverantörsskulder och inventarievärden med dina tidigare kontroller.`,
      'Utred osäker fördelning av försäljning mellan R1 och R2 och eventuella skattejusteringar. Nollor i R15 och R16 bevisar inte att du saknar justeringar. R17 är inte hela NE-bilagan.',
      'Om företaget får använda förenklat årsbokslut: sammanställ de granskade uppgifterna i ett bokslutsunderlag, exempelvis med Skatteverkets stöd. Skriv under och spara bokslutet med underlagen. NE-vyn skapar inte ett komplett signerat bokslutsdokument.',
    ],
    system: 'SoloLedger visar journalbaserade värden och granskningsorsaker. Du ansvarar för underlagens fullständighet och de skatteuppgifter och bedömningar som programmet inte hanterar.',
    problem: 'Vid osäkra skattejusteringar eller oförklarade belopp: stanna och utred med underlagen, Skatteverket eller redovisningshjälp. Godkänn inte en nolla bara för att den visas.',
    reviewed: 'Du har granskat resultat och balans, rett ut varningarna, sparat och skrivit under bokslutsunderlaget och identifierat vad som återstår i deklarationen.',
    links: [['ne', 'NE-Bilaga'], ['dashboard', 'Bokföring']],
  },
  {
    title: 'Förstå och förbered årslåset',
    why: 'Årslåset skyddar färdig bokföring från senare ändringar. Det är ett viktigt beslut som inte betyder att deklarationerna är inskickade.',
    actions: year => [
      `Vänta tills ${year} är slut och kontrollera underlag, fakturor, inventarier, moms och bokslut enligt stegen ovan. Guiden avgör inte när allt är färdigt.`,
      `När du själv har kontrollerat underlaget: öppna NE-Bilaga och läs bekräftelsen vid Lås räkenskapsår ${year}. Låset är permanent enligt det befintliga flödet; fortsätt bara när du förstår konsekvensen.`,
      `Efter låsningen används den befintliga balansen vidare ${year + 1}. Skapa inte en extra ingående balans eller resultatbokning på 8999/2019 bara för att året byts.`,
    ],
    system: 'SoloLedger kontrollerar bland annat balans och kända moms-, faktura- och inventariehinder vid låsning. Det intygar inte alla externa underlag, bankavstämning, skatteval eller att kalenderåret har passerat.',
    problem: 'Om låsningen nekas: läs orsaken och rätta underlaget i berörd vy. Kringgå inte period- eller inventariespärrar. Guiden har ingen egen låsknapp.',
    reviewed: 'Förberedelsen är genomgången när du förstår beslutet och har rett ut hindren. Bokföringsåret är låst först när befintlig funktion bekräftat låsningen. Det säger inget om inlämnade deklarationer.',
    links: [['ne', 'NE-Bilaga']],
  },
  {
    title: 'Deklarationer och betalning hos Skatteverket',
    why: 'Bokföring, deklaration och betalning är olika händelser. Ingen av dem blir gjord bara genom att du läser guiden eller låser året.',
    actions: year => [
      'Lämna momsdeklarationen hos Skatteverket och spara kvittot. Öppna därefter rätt period i Moms och använd befintlig bekräftelse med det verkliga inlämningsdatumet. Bekräftelsen i SoloLedger skickar inte deklarationen.',
      'Jämför skattekontots faktiska avräkning med momsbeslutet och bankens överföring var för sig. Registrera endast styrkta händelser i de befintliga vyerna. En insättning på skattekontot bevisar inte att just denna moms är slutbetald.',
      `Lämna inkomstdeklarationen med NE för ${year} under ${year + 1} och spara inlämningskvittot. Kontrollera då aktuella blanketter och datum hos Skatteverket.`,
    ],
    system: 'SoloLedger kan visa registrerade deklarations- och betalningsuppgifter. Programmet skickar inte inkomstdeklarationen och kan inte kontrollera myndighetens inlämningskvitto åt dig.',
    problem: 'Om beslut, bank och skattekonto inte stämmer: utred skillnaden innan du registrerar en händelse. Markera inte något som deklarerat eller betalt för att få en klarstatus.',
    reviewed: 'Varje extern åtgärd är utförd först när du har rätt kvitto eller har stämt av betalningen. En inskickad deklaration är inte bevis för betalning eller för att bokföringsåret är låst.',
    links: [['moms', 'Moms'], ['dashboard', 'Bokföring']],
  },
]

const groups = [
  { title: '1. Börja med underlagen', indexes: [0] },
  { title: '2. Fakturor vid årsskiftet', indexes: [1, 2] },
  { title: '3. Inventarier och moms', indexes: [3, 4] },
  { title: '4. Bokslut och årslås', indexes: [5, 6] },
  { title: '5. Deklaration och betalning', indexes: [7] },
]

// No timer or data request: the calendar is only read after hydration, then on guide mount.
const subscribeCalendar = () => () => {}
const stockholmYear = () => Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric' }).format(new Date()))

export default function YearEndGuide({ companyName, year, ready, error, locked, onNavigate }: {
  companyName: string | null | undefined
  year: number
  ready: boolean
  error: string | null
  locked: boolean
  onNavigate: (destination: YearEndDestination) => void
}) {
  const currentYear = useSyncExternalStore(subscribeCalendar, stockholmYear, () => null)
  return (
    <section aria-label={`Årsavslut för ${year}`} className="mx-auto max-w-3xl space-y-6 px-4 pb-10 sm:px-6">
      <header className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <p className="text-sm text-gray-600 break-words">Företag: {companyName?.trim() || 'Företagsnamn saknas – kontrollera Profil'}</p>
        <h2 className="mt-2 text-xl font-bold text-gray-900">Förbered och avsluta {year}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">Följ en kontroll i taget. Här får du hjälp att jämföra dina underlag och hitta rätt vy. Guiden bedömer inte att bokslutet är komplett och sparar inga klarmarkeringar.</p>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950" role="status">
          {currentYear === null ? 'Kontrollerar kalenderåret…' : year >= currentYear
            ? `Förberedelser – ${year === currentYear ? `${year} är inte slut` : `${year} har inte börjat`}. Slutför kontrollerna först när hela årets underlag finns. Läs om årslåset innan du gör något.`
            : `${year} har passerat. Det betyder inte att underlagen är fullständiga eller att bokslutet är färdigt.`}
        </p>
        {error ? <p role="alert" className="mt-3 text-sm text-red-800">Årslåsstatus kunde inte hämtas för {year}. Ingen tidigare status visas. Du kan läsa instruktionerna, men kontrollera statusen i NE-Bilaga när uppgifterna kan laddas igen.</p>
          : <p className="mt-3 text-sm text-gray-600">{!ready ? `Årslåsstatus för ${year} laddas. Inget besked visas ännu.` : `Bokföringsår ${year}: ${locked ? 'låst enligt SoloLedger' : 'öppet enligt SoloLedger'}. Detta är bara bokföringens låsstatus, ingen kontroll av deklaration eller betalning.`}</p>}
      </header>
      {groups.map(group => <section key={group.title} aria-label={group.title}>
        <h3 className="mb-3 text-base font-bold text-gray-900">{group.title}</h3>
        <div className="space-y-3">{group.indexes.map(index => {
          const control = controls[index]
          return <details key={index} className="group rounded-xl border border-gray-200 bg-white">
            <summary className="cursor-pointer rounded-xl p-4 font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
              <span>{control.title}</span><span className="mt-1 block text-xs font-normal text-gray-500">Du behöver kontrollera · öppna instruktionen</span>
            </summary>
            <div className="space-y-4 border-t border-gray-100 p-4 text-sm leading-relaxed text-gray-700 sm:p-5">
              <p><strong>Varför behövs kontrollen?</strong><br />{control.why}</p>
              <div><h4 className="font-semibold text-gray-900">Så gör du och jämför</h4><ol className="mt-2 list-decimal space-y-2 pl-5">{control.actions(year).map(action => <li key={action}>{action}</li>)}</ol></div>
              <p><strong>Vad kan SoloLedger kontrollera?</strong><br />{control.system}</p>
              <p className="rounded-lg bg-amber-50 p-3"><strong>Om något inte stämmer</strong><br />{control.problem}</p>
              <p><strong>När har du utfört kontrollen?</strong><br />{control.reviewed}</p>
              <div className="flex flex-wrap gap-2" aria-label="Öppna befintlig vy">{control.links.map(([destination, label]) => <button key={destination} type="button" onClick={() => onNavigate(destination)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Öppna {label}</button>)}</div>
            </div>
          </details>
        })}</div>
      </section>)}
      <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700" aria-label="Skilda tillstånd">
        <h3 className="font-bold text-gray-900">Fem olika saker att hålla isär</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>Bokföringsår låst: SoloLedger har låst årets bokföring.</li>
          <li>Momsperiod stängd: ett internt momsavslut har gjorts.</li>
          <li>Moms deklarerad: du har lämnat deklarationen hos Skatteverket och därefter bekräftat det i SoloLedger.</li>
          <li>Moms avräknad eller betald: faktiska skattekonto- och betalningshändelser har kontrollerats var för sig.</li>
          <li>Inkomstdeklaration inskickad: du har lämnat deklarationen med NE och sparat myndighetens kvitto.</li>
        </ul>
        <p className="mt-3">Ingen av dessa innebär automatiskt någon av de andra. Dina underlag och kvitton avgör vad som faktiskt är gjort.</p>
      </aside>
    </section>
  )
}
