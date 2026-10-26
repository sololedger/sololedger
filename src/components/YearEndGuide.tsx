'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { CHECK_KEYS, needsReview } from '@/lib/yearEndChecklist'
import { useYearEndChecklist, ChecklistNotice, ChecklistConfirmation, ChecklistStatus } from './YearEndChecklistControls'

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

const original: Control[] = [
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
    title: 'Granska årets momsunderlag',
    why: 'Momsrapporten behöver stämma med bokföringen och underlagen för de perioder företaget ska redovisa.',
    actions: year => [
      'Kontrollera företagets sparade momsuppgifter och avdragsrätt i Profil. Jämför försäljning, inköp och bokförd moms med fakturor och kvitton. Bokför inte samma underlag igen.',
      `Öppna Moms och välj de perioder som hör till ${year}. Momsperioden följer inte automatiskt guidens årsväljare. Kontrollera att alla perioder som ska redovisas finns.`,
      'Beräkna rapporten för varje period och jämför med bokföringen och underlagen. Utred avvikelser och osäker momsbehandling innan du går vidare, även vid utlandshandel.',
      'När perioden är slut och underlaget stämmer: läs konsekvenserna innan du väljer Stäng momsperiod. Stängningen kan skapa en momsverifikation och låser perioden för vanlig momsrelaterad bokföring.',
    ],
    system: 'SoloLedger beräknar rapporten från bokförda momsfakta och kontrollerar periodens spärrar. Moms visar befintliga perioder. Skapa saknade momsperioder är en separat åtgärd. Guiden skickar ingen deklaration.',
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
      'Öppna NE-Bilaga och guiden Från NE-underlag till deklaration · fem steg. Där får du hjälp att hitta skatteunderlag, komplettera hos Skatteverket och spara kvittensen.',
    ],
    system: 'SoloLedger kan visa registrerade deklarations- och betalningsuppgifter. Programmet skickar inte inkomstdeklarationen och kan inte kontrollera myndighetens inlämningskvitto åt dig.',
    problem: 'Om beslut, bank och skattekonto inte stämmer: utred skillnaden innan du registrerar en händelse. Markera inte något som deklarerat eller betalt för att få en klarstatus.',
    reviewed: 'Varje extern åtgärd är utförd först när du har rätt kvitto eller har stämt av betalningen. En inskickad deklaration är inte bevis för betalning eller för att bokföringsåret är låst.',
    links: [['ne', 'NE-Bilaga'], ['moms', 'Moms'], ['dashboard', 'Bokföring']],
  },
]


const controls: Control[] = [
 { ...original[0], title:'Underlag och företagsuppgifter', why:'Rätt företag, år och fullständiga underlag behövs innan du kan stämma av.', system:'SoloLedger visar registrerade uppgifter. Programmet kan inte veta om ett externt underlag saknas.', problem:'Hämta saknade underlag och utred felaktiga företagsuppgifter innan du använder dem.', actions:()=>['Samla årets kontoutdrag, kvitton och fakturor. Kontrollera rätt företag och momsuppgifter i Profil.', 'Har du importerat bokföring? Behåll rapporterna och bokslutsunderlagen från det tidigare systemet.'],reviewed:'Jag har samlat årets underlag och kontrollerat företagsuppgifterna.'},
 { ...original[0], title:'Bank och bokföring', reviewed:'Jag har jämfört kontoutdragen med bokföringen och rett ut skillnaderna.'},
 { ...original[1], reviewed:'Jag har granskat kundfakturorna och nödvändiga bokslutsbokningar, eller konstaterat att inga finns.'},
 { ...original[2], reviewed:'Jag har granskat leverantörsfakturorna och nödvändiga bokslutsskulder, eller konstaterat att inga finns.'},
 { ...original[3], title:'Inventarier och övriga årsskiftesfrågor', actions:year=>[...original[3].actions(year),'Finns lager, periodiseringar eller andra tillgångar och skulder? Ta fram underlagen. Använd bara funktioner som stöder situationen; utred övriga frågor med redovisningshjälp.'],reviewed:'Jag har granskat inventarier, avskrivningar och övriga årsskiftesfrågor som berör verksamheten.'},
 { ...original[4], title:'Granska årets momsunderlag', reviewed:'Jag har granskat momsunderlaget och årets perioder utifrån företagets situation.'},
 { ...original[5], reviewed:'Jag har granskat resultat och balans, rett ut varningarna samt färdigställt, skrivit under och sparat bokslutet.'},
 { ...original[5],title:'Kompletterande skatteuppgifter',actions:()=>['Öppna NE-Bilaga och Från NE-underlag till deklaration · fem steg. Följ frågorna om tidigare underskott, egenavgifter och övriga justeringar.', 'Jämför med tidigare deklaration, beslut och beräkningsunderlag. R17 är inte automatiskt det slutliga deklarationsresultatet.'],reviewed:'Jag har granskat vilka kompletterande skatteuppgifter som behövs och tagit fram underlagen.'},
 { ...original[7],title:'Lämna deklarationen och spara kvittensen',actions:()=>['Spara deklarationsunderlag i NE-Bilaga när året är låst och sparfunktionens kontroller är uppfyllda. Egna och faktiskt deklarerade uppgifter kan dokumenteras även utan låst år.', 'Följ NE-guiden och lämna inkomstdeklarationen med NE hos Skatteverket. Kontrollera mottagandet, spara kvittensen och dokumentera uppgifterna i Deklarationshistorik.'],reviewed:'Jag har lämnat inkomstdeklarationen med NE och sparat kvittensen.'},
 { ...original[7],title:'Betalningar och skattekonto',actions:()=>['Jämför bankens verkliga överföringar och skattekontots avräkningar var för sig. Registrera endast styrkta momsrelaterade händelser i Moms.', 'Följ aktuella betalningsdatum. Kontrollera övrig skatt mot Skatteverkets beslut. En insättning på skattekontot bevisar inte att en viss moms är avräknad.'],reviewed:'Jag har stämt av aktuella betalningar och skattekontohändelser mot underlagen.'},
 { ...original[1],title:'Fortsätt nästa år',why:'Samma kostnad, intäkt eller ingående balans ska inte bokföras två gånger.',system:'SoloLedger använder befintliga bokförda saldon. Du behöver kontrollera övergången mot underlagen.',problem:'Utred avvikande saldon och importerade bokslut innan du fortsätter. SoloLedger återskapar inte nollade resultat automatiskt.',actions:()=>['Välj nästa år och kontrollera kvarvarande kundfordringar och bokslutsskulder. Registrera senare betalningar på samma faktura eller skuld med verkligt datum.', 'Befintliga balanssaldon används vidare. Skapa inte en extra ingående balans eller resultatbokning bara för att året byts.'],reviewed:'Jag har kontrollerat övergången till nästa år och hur kvarvarande fordringar och skulder ska följas upp.',links:[['fakturor','Fakturor'],['leverantorsskulder','Bokslutsskulder'],['ne','NE-Bilaga']]},
]
const groups = [
 {title:'1. Kontrollera bokföringen',indexes:[0,1,2,3,4]},
 {title:'2. Färdigställ bokslutet',indexes:[5,6]},
 {title:'3. Deklarera',indexes:[7,8]},
 {title:'4. Följ upp och fortsätt',indexes:[9,10]},
]
const subscribeCalendar=()=>()=>{}
const stockholmYear=()=>Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric'}).format(new Date()))
const button='min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2'

export default function YearEndGuide({owner,companyName,year,ready,error,locked,contextKey,contextReady,initialOpenControls,initialControl,showNEGuideReturn,onNavigate}: {
 owner:string;companyName:string|null|undefined;year:number;ready:boolean;error:string|null;locked:boolean;contextKey:number;contextReady:boolean;initialOpenControls:readonly number[];initialControl:number|null;showNEGuideReturn?:boolean;onNavigate:(destination:YearEndDestination,openControls:number[],control:number|null)=>void
}) {
 const guide=useRef<HTMLElement>(null)
 const currentYear=useSyncExternalStore(subscribeCalendar,stockholmYear,()=>null)
 const checklist=useYearEndChecklist(owner,year,contextKey,contextReady),data=checklist.state.data
 const restored=useRef(false)
 useEffect(()=>{
  if(restored.current||initialControl===null||!data||checklist.state.busy)return
  const summary=guide.current?.querySelector<HTMLElement>(`details[data-control-index="${initialControl}"] > summary`)
  if(summary){summary.scrollIntoView({block:'start'});summary.focus({preventScroll:true});restored.current=true}
 },[initialControl,data,checklist.state.busy])
 const confirmed=data?.checks.filter(c=>c.confirmed).length??0
 const review=data?CHECK_KEYS.filter(k=>needsReview(data,k)).length:0
 function navigate(destination:YearEndDestination,control:number|null=null){
  const open=Array.from(guide.current?.querySelectorAll<HTMLDetailsElement>('details[data-control-index]')??[]).filter(d=>d.open).map(d=>Number(d.dataset.controlIndex))
  onNavigate(destination,open,control)
 }
 function instructions(control:Control,index:number){return <div className="space-y-4 text-sm leading-relaxed text-gray-700">
  <p><strong>Varför behövs kontrollen?</strong><br/>{control.why}</p>
  <div><h4 className="font-semibold">Så gör du och jämför</h4><ol className="mt-2 list-decimal space-y-2 pl-5">{control.actions(year).map(action=><li key={action}>{action}</li>)}</ol></div>
  <p><strong>Vad kan SoloLedger kontrollera?</strong><br/>{control.system}</p>
  <p className="rounded-lg bg-amber-50 p-3"><strong>Om något inte stämmer</strong><br/>{control.problem}</p>
  <div className="flex flex-wrap gap-2">{control.links.map(([destination,label])=><button key={destination} type="button" className={button} onClick={()=>navigate(destination,index)}>Öppna {label}</button>)}</div>
 </div>}
 return <section ref={guide} aria-label={'Årsavslut för '+year} className="mx-auto max-w-3xl space-y-5 px-4 pb-10 sm:px-6">
  <header className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
   {showNEGuideReturn&&<button type="button" className={button} onClick={()=>navigate('ne')}>Tillbaka till NE-guiden</button>}
   <p className="break-words text-sm">Företag: {companyName?.trim()||'Företagsnamn saknas – kontrollera Profil'}</p>
   <h2 className="text-xl font-bold">Årsavslut {year}</h2>
   <p className="text-sm">Arbeta i valfri ordning. Dina bekräftelser sparas automatiskt. De betyder inte att SoloLedger har godkänt bokslutet.</p>
   <p className="rounded-lg bg-amber-50 p-3 text-sm" role="status">{currentYear===null?'Kontrollerar kalenderåret…':year>=currentYear?'Förberedelser – '+(year===currentYear?year+' är inte slut':year+' har inte börjat')+'. Slutför kontrollerna först när hela årets underlag finns.':year+' har passerat. Det betyder inte att bokslutet är färdigt.'}</p>
   {data&&!checklist.state.busy&&<p className="font-semibold">Dina avstämningar: {confirmed} av 11 bekräftade av dig.{review>0&&' '+review+' behöver ses över efter ändrat underlag.'}</p>}
   <ChecklistNotice checklist={checklist}/>
   {data?.basis===null&&<p className="rounded-lg bg-amber-50 p-3 text-sm">Ändringskontrollen är inte tillgänglig för detta underlag. Dina svar finns kvar och kan ändras, men inga besked om oförändrat underlag visas.</p>}
   <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Om sparande och ändringskontroll</summary><p>Dina svar finns kvar nästa gång du loggar in. Ändringskontrollen jämför registrerade uppgifter i SoloLedger. Nya externa underlag och kvittenser behöver du själv uppmärksamma. Ändringar kan påverka flera närliggande kontroller.</p></details>
   <p className="rounded-lg border border-gray-200 p-3 text-sm"><strong>Moms har egna tidsfrister.</strong> Deklarera och betala i rätt tid. Vänta inte på årslåset. Kontrollera aktuella datum hos Skatteverket. <button className={button} type="button" onClick={()=>navigate('moms')}>Öppna Moms</button></p>
  </header>
  <details className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm" aria-label="Systemstatus">
   <summary className="min-h-11 cursor-pointer font-semibold">Status i SoloLedger – separata systembesked<span className="mt-1 block text-sm font-normal">{error?'Årslåsstatus kunde inte hämtas':!ready?'Årslåsstatus laddas':'Bokföringsår '+year+': '+(locked?'låst':'öppet')}{data&&!checklist.state.busy?' · '+data.system.periods.length+' momsperioder · '+data.system.declaration_versions+' sparade deklarationsversioner': ' · Moms- och deklarationsstatus inväntar checklistan'}</span></summary>
   {error?<p role="alert">Årslåsstatus kunde inte hämtas. Ingen tidigare status visas.</p>:<p>{!ready?'Årslåsstatus laddas. Inget besked visas ännu.':'Bokföringsår '+year+': '+(locked?'låst enligt SoloLedger':'öppet enligt SoloLedger')+'.'}</p>}
   {data&&!checklist.state.busy?<><p>Moms: {data.system.periods.length} registrerade perioder, {data.system.periods.filter(p=>p.status==='closed'||p.status==='declared').length} stängda eller deklarerade. Antalet bevisar inte fullständig periodtäckning.</p><ul className="space-y-1">{data.system.periods.map(p=><li key={p.start+':'+p.end}>{p.start}–{p.end}: {p.status==='open'?'öppen':p.status==='closed'?'stängd':p.status==='declared'?'inlämning registrerad av användaren – inte verifierad av Skatteverket':'status kunde inte tolkas'}</li>)}</ul><p>Sparade deklarationsversioner: {data.system.declaration_versions}. En sparad version är inte bevis för inlämning. Ingen kontroll av Skatteverkets mottagande.</p></>:<p>Moms- och deklarationsstatus visas när checklistan kan läsas.</p>}
   <p>Låst år, stängd momsperiod, inlämnad deklaration och betalning är olika saker.</p>
  </details>
  {groups.map((group,g)=><details key={group.title} data-control-index={100+g} open={initialOpenControls.includes(100+g)||(initialOpenControls.length===0&&g===0)} className="rounded-xl border border-gray-200 bg-white">
   <summary className="min-h-11 cursor-pointer p-4 font-bold focus-visible:outline-2">{group.title}<span className="mt-1 block text-sm font-normal">{data&&!checklist.state.busy?group.indexes.filter(i=>data.checks.some(c=>c.check_key===CHECK_KEYS[i]&&c.confirmed)).length+' av '+group.indexes.length+' bekräftade av dig':'Öppna instruktionerna'}</span></summary>
   <div className="space-y-3 border-t border-gray-100 p-3 sm:p-4">{group.indexes.map(index=>{
    const control=controls[index],key=CHECK_KEYS[index],row=data?.checks.find(c=>c.check_key===key)
    return <details key={key} data-check-key={key} data-control-index={index} open={initialOpenControls.includes(index)} className="rounded-lg border border-gray-200">
     <summary className="min-h-11 cursor-pointer scroll-mt-6 p-4 font-semibold focus-visible:outline-2">{control.title}<span className="mt-1 block text-sm font-normal">{!data?'Sparade svar är inte tillgängliga':<ChecklistStatus confirmed={row?.confirmed??false} review={needsReview(data,key)}/>}</span></summary>
     <div className="space-y-4 border-t border-gray-100 p-4">{instructions(control,index)}<ChecklistConfirmation checklist={checklist} checkKey={key} label={control.reviewed}/></div>
    </details>
   })}
   {g===1&&<details data-control-index={200} open={initialOpenControls.includes(200)} className="rounded-lg border border-gray-200"><summary className="min-h-11 cursor-pointer scroll-mt-6 p-4 font-semibold">Förbered årslåset – separat systemåtgärd</summary><div className="space-y-4 p-4">{instructions(original[6],200)}<p className="text-sm">Årslåset har ingen manuell kryssruta. Dina avbockningar påverkar inte möjligheten att låsa året.</p></div></details>}
   </div>
  </details>)}
 </section>
}
