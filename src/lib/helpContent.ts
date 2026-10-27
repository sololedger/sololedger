// Public, versioned guidance only. Never put customer examples or credentials here.
export const helpTopics = [
  { id: 'start', label: 'Kom igång & profil' },
  { id: 'book', label: 'Bokföring & underlag' },
  { id: 'invoice', label: 'Fakturor & inventarier' },
  { id: 'vat', label: 'Moms & skattekonto' },
  { id: 'year', label: 'Årsavslut & deklaration' },
  { id: 'withdrawal', label: 'Säkert uttag' },
] as const

export type HelpTopic = typeof helpTopics[number]['id']
export const helpDestinations = {
  dashboard: 'Bokföring', profil: 'Profil', kontoplan: 'Kontoplan',
  fakturor: 'Fakturor', leverantorsskulder: 'Bokslutsskulder',
  inventarier: 'Inventarier', moms: 'Moms', arsavslut: 'Årsavslut', ne: 'NE-Bilaga',
} as const
export type HelpDestination = keyof typeof helpDestinations
export type HelpMedia =
  | { kind: 'image'; src: string; alt: string; caption: string; width: number; height: number }
  | { kind: 'video'; src: string; caption: string; captions: string; transcript: string }
export type HelpArticle = {
  id: string; aliases?: string[]; topic: HelpTopic; title: string; answer: string
  applies?: string; paragraphs?: string[]; steps?: string[]; warning?: string
  keywords: string[]; destinations?: HelpDestination[]
  sources?: { label: string; href: string }[]; reviewed: string; media?: HelpMedia
}
const sources = {
  ne: { label: 'Skatteverket: skattemässiga justeringar', href: 'https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet/fyllainebilagan/skattemassigajusteringar.4.361dc8c15312eff6fd2c7d1.html' },
  declaration: { label: 'Skatteverket: deklarera enskild näringsverksamhet', href: 'https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet' },
  eu: { label: 'Skatteverket: köpa tjänster från andra EU-länder', href: 'https://www.skatteverket.se/foretag/moms/kopavarorochtjanster/inkopfranandraeulander/kopatjansterfranandraeulander' },
  exempt: { label: 'Skatteverket: undantag från momsplikt', href: 'https://www.skatteverket.se/momsbefrielse' },
  k1: { label: 'Bokföringsnämnden: förenklat årsbokslut (PDF)', href: 'https://www.bfn.se/wp-content/uploads/vl06-1-k1enskilda-kons2025.pdf' },
  archive: { label: 'Bokföringsnämnden: arkivering', href: 'https://www.bfn.se/fragor-och-svar/arkivering/' },
}
const reviewed = '2026-10-27'

// IDs are public permalinks: retain the ID or add an alias when renaming.
export const helpArticles: HelpArticle[] = [
  {
    id: 'kom-igang', topic: 'start', title: 'Var börjar jag i SoloLedger?',
    answer: 'Börja i Profil med företagets uppgifter, moms och betalningskonton. Kontrollera sedan underlaget innan du bokför.',
    steps: ['Jämför momsregistrering och momsbehandling med företagets aktuella uppgifter hos Skatteverket.', 'Konfigurera de betalningskonton du använder. Ett konto behöver vara sparat före bokning.', 'Bokför från kvitton och fakturor. Kommer du från ett annat system, granska SIE-underlaget och importhistoriken först.'],
    keywords: ['starta', 'inställningar', 'ny användare', 'bankkonto'], destinations: ['profil', 'kontoplan', 'dashboard'], reviewed,
  },
  {
    id: 'momsprofil-eu', topic: 'start', title: 'Kan jag vara momsregistrerad och ändå sälja utan moms?',
    answer: 'Ja, registrering kan behövas för vissa EU-inköp samtidigt som svensk försäljning är momsbefriad och normal avdragsrätt saknas.',
    applies: 'Detta är en möjlig kombination, inte en regel för alla företag eller utländska inköp.',
    steps: ['Kontrollera företagets registrering och hur det aktuella inköpet ska redovisas.', 'Ange momsregistrering, svensk försäljningsbehandling, utländska inköp och normal avdragsrätt separat i Profil.', 'Spara uppgifterna. Granska sedan det enskilda inköpet och dess avdragsrätt i det stödda bokföringsflödet.'],
    warning: 'Registrering innebär inte automatiskt full avdragsrätt. Saknade eller osäkra profiluppgifter kan stoppa berörda flöden; SoloLedger gissar inte.',
    keywords: ['eu', 'momsbefriad', 'momsfri', 'omvänd beskattning', 'avdrag', 'registrering'], destinations: ['profil'], sources: [sources.eu, sources.exempt], reviewed,
  },
  {
    id: 'malgrupp', topic: 'start', title: 'Vem är SoloLedger till för?',
    answer: 'SoloLedger är byggt för enskild firma utan anställda, med stöd för löpande bokföring, moms, eget kapital, NE-underlag och SIE.',
    warning: 'Löner, arbetsgivaravgifter, personalförmåner och personaladministration ingår inte. Personalposter i importerad bokföring behöver granskas; utgå inte från att deras skattebehandling är klar.',
    keywords: ['anställda', 'personal', 'lön', 'support', 'kontakt'], reviewed,
  },
  {
    id: 'sakerhet', topic: 'start', title: 'Hur skyddas min bokföring?',
    answer: 'Åtkomstregler begränsar tillgången till dina uppgifter. Centrala bokföringsåtgärder kontrolleras på servern, och bokförda rättelser ska vara spårbara.',
    paragraphs: ['Använd ett eget lösenord och logga ut på delade enheter. Dela aldrig lösenord eller återställningslänkar med supporten. Spara också de boksluts- och deklarationshandlingar som du behöver behålla.'],
    keywords: ['integritet', 'dataskydd', 'inloggning', 'lösenord'], destinations: ['profil'], reviewed,
  },
  {
    id: 'ingaende-balans', topic: 'book', title: 'Behöver jag boka en ny ingående balans varje år?',
    answer: 'Nej. Befintliga balanssaldon används vidare. Skapa inte en extra ingående balans bara för att året byts.',
    paragraphs: ['Balanskonton, som bank, eget kapital och skulder, har ackumulerade saldon. Resultatet räknas för valt räkenskapsår.', 'Vid byte från ett annat system kan ingående balanser följa med en korrekt SIE-import. Behåll det tidigare systemets rapporter och bokslut och kontrollera att samma underlag inte tas med två gånger.'],
    keywords: ['ib', 'nytt år', 'årsskifte', '1930', '2010'], destinations: ['profil', 'ne'], reviewed,
  },
  {
    id: 'privat-betalning', topic: 'book', title: 'Hur bokför jag ett inköp som jag betalat privat?',
    answer: 'Välj Betalningskälla → Privat betalning i inköpsflöden som stöder det. Hur inköpet betalats är en annan fråga än om det är en kostnad eller en tillgång.',
    steps: ['Kontrollera att inköpet hör till verksamheten och att underlag finns.', 'Välj rätt inköpsflöde och granska kostnad eller tillgång samt eventuell avdragsrätt för moms.', 'Välj Privat betalning och kontrollera betalningskontot före bokning. Företagsbanken ska inte minska för ett privat betalt inköp.'],
    warning: 'Ett privat köp blir inte avdragsgillt bara för att det betalats med ett visst kort. Skapa inte en egen kategori för att kringgå flödets kontroller.',
    keywords: ['utlägg', 'swish', 'privata pengar', '2018', 'egen insättning'], destinations: ['dashboard', 'inventarier', 'profil'], reviewed,
  },
  {
    id: 'periodisering', topic: 'book', title: 'När och hur använder jag periodisering?',
    answer: 'Periodisering kan fördela en kostnad till den period den hör till. För förenklat årsbokslut enligt K1 finns förenklingar och undantag som behöver kontrolleras först.',
    steps: ['Bedöm från underlaget och K1-reglerna om kostnaden ska periodiseras.', 'I det stödda bokföringsformuläret väljer du periodisering och den framtida månad kostnaden avser.', 'Granska båda bokningarna. Funktionen omfattar betalningsbokningen och kostnadsbokningen i den valda månaden.'],
    warning: 'Kostnaden flyttas till vald månad, inte generellt när nyåret börjar. Momsbehandlingen beror på inköpet och avdragsrätten. Kringgå inte låsta år eller stängda momsperioder.',
    keywords: ['förutbetald', 'licens', '1790', 'nästa år'], destinations: ['dashboard'], sources: [sources.k1], reviewed,
  },
  {
    id: 'sie-import', topic: 'book', title: 'Hur importerar jag SIE och ångrar en felaktig import?',
    answer: 'SIE-import kopplar verifikationerna till en importbatch. Under Profil kan du granska importhistoriken och tillgängliga åtgärder.',
    steps: ['Granska fil, räkenskapsår och tidigare importer före en ny import.', 'Kontrollera bokföring och rapporter efter importen och behåll originalfilen.', 'Om importen blev fel, granska Ångra import i importhistoriken. Ångring skapar rättelseverifikationer och bevarar historiken.'],
    warning: 'Ångring kan vara spärrad, exempelvis av ett låst år eller tidigare rättelser. Utred orsaken. Vanliga rättelser kan också vara spärrade och är ingen väg runt skyddet.',
    keywords: ['sie4', 'importhistorik', 'korrver', 'återställ', 'ångring'], destinations: ['profil', 'dashboard'], reviewed,
  },
  {
    id: 'ratta-bokning', topic: 'book', title: 'Hur rättar jag en felaktig bokning?',
    answer: 'Använd Korrigera i historiken för vanliga bokningar där den åtgärden är tillgänglig. Originalet bevaras tillsammans med rättelsen.',
    steps: ['Hitta originalet och kontrollera verifikationen och underlaget.', 'Granska rättelseåtgärden och dess bekräftelse innan du genomför den.', 'När rättelsen är bekräftad, registrera rätt uppgifter i det avsedda flödet om en ny bokning behövs.'],
    warning: 'Fakturor, inventarier, moms och andra särskilda flöden kan ha egna rättelsevägar. Kringgå aldrig ett låst år eller en stängd momsperiod.',
    keywords: ['korrigera', 'korrver', 'fel', 'ta bort', 'radera', 'ändra'], destinations: ['dashboard'], reviewed,
  },
  {
    id: 'bilagor-arkivering', topic: 'book', title: 'Hur hanterar och sparar jag kvitton och bilagor?',
    answer: 'Affärshändelser ska styrkas med underlag. Använd Hantera bilaga på en bokförd verifikation för att komplettera bilagan utan att ändra bokföringen.',
    paragraphs: ['Digitalisering får inte innebära risk för att uppgifter förändras eller försvinner. Kontrollera att hela kvittot är läsbart innan pappersoriginalet kastas.', 'Räkenskapsinformation ska normalt bevaras i sju år efter utgången av det kalenderår då räkenskapsåret avslutades. Se till att underlagen förblir läsbara under hela tiden.'],
    keywords: ['foto', 'skanna', 'arkiv', 'papperskvitto', 'underlag'], destinations: ['dashboard'], sources: [sources.archive], reviewed,
  },
  {
    id: 'intakt-insattning', topic: 'book', title: 'Vad skiljer intäkt, egen insättning och eget uttag?',
    answer: 'En intäkt hör till verksamhetens resultat. Egna insättningar och uttag ändrar eget kapital och är inte försäljning eller kostnad.',
    paragraphs: ['Intäkt är inte samma sak som bankinbetalning. En kundbetalning kan reglera en tidigare fordran. Intäkter kan också höra till olika NE-rutor; allt hör inte till R1.', 'Privata köp ska inte tas upp som verksamhetskostnader. Egna uttag och insättningar hanteras separat från företagets inköp och försäljning.'],
    keywords: ['2013', '2018', 'privat', 'bank', 'pengar in'], destinations: ['dashboard', 'ne'], sources: [sources.declaration], reviewed,
  },
  {
    id: 'vanliga-misstag', topic: 'book', title: 'Vilka vanliga misstag ska jag undvika?',
    answer: 'Utgå från underlaget och kontrollera befintliga poster innan du bokför igen.',
    steps: ['Skapa ingen extra ingående balans bara för att året byts.', 'Skilj privata köp, egna insättningar och uttag från intäkter och kostnader.', 'Räkna inte personlig skatt som företagskostnad och koppla inte en blandad skatteöverföring till moms utan stöd.', 'Kontrollera importhistorik och rättelsestatus för att undvika dubbel bokföring.'],
    keywords: ['dubbel', 'dubblett', 'nybörjare'], destinations: ['dashboard', 'profil'], reviewed,
  },
  {
    id: 'kundfakturor', topic: 'invoice', title: 'Var hanterar jag kundfakturor och betalningar?',
    answer: 'Öppna Fakturor för att granska kundfakturans underlag, status och tillgängliga betalningsåtgärder.',
    steps: ['Kontrollera fakturan och dess status innan du registrerar något.', 'Jämför faktisk betalning med faktura och bankunderlag i det avsedda flödet.', 'Vid årsskifte, följ även Årsavsluts kontroll av kundfordringar.'],
    warning: 'Bokför inte samma kundbetalning både i fakturaflödet och som en ny vanlig försäljning. Rättelser ska följa fakturans egna åtgärder.',
    keywords: ['kundfordran', 'betalning', 'fordringar', 'obetald'], destinations: ['fakturor', 'arsavslut'], reviewed,
  },
  {
    id: 'bokslutsskulder', topic: 'invoice', title: 'Vad gör jag med obetalda leverantörsfakturor vid årsskiftet?',
    answer: 'Bokslutsskulder ger stöd för svenska vanliga kostnader i SEK som är helt obetalda vid årsskiftet. Läs begränsningarna där innan du bokför.',
    steps: ['Samla de obetalda fakturorna och kontrollera vad de avser.', 'Öppna Bokslutsskulder för rätt år och granska vilka fakturor flödet stöder.', 'Följ flödets betalnings- och rättelseväg när fakturan senare betalas eller behöver rättas.'],
    warning: 'Utgå inte från att alla typer av inköp eller delbetalningar stöds. Bokför inte samma skuld eller betalning igen som en vanlig utgift.',
    keywords: ['leverantörsfaktura', 'leverantörsskuld', 'årsskifte'], destinations: ['leverantorsskulder', 'arsavslut'], reviewed,
  },
  {
    id: 'inventarier', topic: 'invoice', title: 'När använder jag Inventarier?',
    answer: 'Öppna Inventarier när ett inköp ska hanteras som en tillgång i det stödda inventarieflödet. Betalning och avskrivning är olika händelser.',
    paragraphs: ['Granska inköpets underlag, moms och betalningskälla före bokning. Följ sedan flödets tillgängliga åtgärder och kontrollera inventarierna i Årsavslut.', 'Läs K1-reglerna för att avgöra om utgiften ska vara en tillgång eller får dras av direkt. SoloLedger ska inte gissa när behandlingen är osäker.'],
    keywords: ['anläggningstillgång', 'avskrivning', 'dator', 'utrustning'], destinations: ['inventarier', 'arsavslut'], sources: [sources.k1], reviewed,
  },
  {
    id: 'moms-redovisa-betala', topic: 'vat', title: 'Hur redovisar och betalar jag momsen?',
    answer: 'Rapport, deklaration och betalning är olika saker. Börja med rätt år och period i Moms.',
    steps: ['Granska perioderna. Om täckning saknas, granska förslaget till saknade perioder och bekräfta separat när underlaget är rätt.', 'Beräkna rapporten och jämför med bokföringen. Utred varningar innan du går vidare.', 'Stäng perioden när underlaget är klart. Läs bekräftelsen: stängningen kan skapa en momsverifikation och spärrar vanlig momsrelaterad bokföring.', 'Lämna deklarationen hos Skatteverket, spara kvittot och dokumentera inlämningen i SoloLedger.', 'Stäm av betalningen separat mot bank och skattekonto. Använd styrkta belopp och datum.'],
    warning: 'Att öppna Moms eller en hjälpknapp skapar, stänger eller deklarerar ingenting automatiskt. Kontrollera tidsfristen för din registrering och period hos Skatteverket.',
    keywords: ['momsrapport', 'momsdeklaration', 'period', 'kvartal', 'månad', 'årsmoms'], destinations: ['moms'], reviewed,
  },
  {
    id: 'skattekonto', topic: 'vat', title: 'Vad skiljer överföring och avräkning på skattekontot?',
    answer: 'Pengar till/från skattekontot och Avräkning på skattekontot registrerar två olika händelser. En banköverföring bevisar inte att momsen har dragits eller krediterats.',
    steps: ['Jämför bankens överföring eller återbetalning med underlaget. Använd Pengar till/från skattekontot i Moms för den stödda händelsen.', 'Kontrollera själva momshändelsen hos Skatteverket. Använd Avräkning på skattekontot med den händelsens datum och belopp.', 'Granska vad som redan är registrerat så att samma händelse inte bokförs två gånger.'],
    warning: 'En överföring som även avser annan skatt får inte generellt räknas som momsbetalning. Använd inte en vanlig kategori med plus- eller minusbelopp som genväg runt momsflödet.',
    keywords: ['betala', 'återbetalning', 'återbäring', '2012', 'skatteverket', 'skuld'], destinations: ['moms'], reviewed,
  },
  {
    id: 'momskortet', topic: 'vat', title: 'Vad visar momskortet på översikten?',
    answer: 'Kortet sammanfattar moms för valt år utifrån tillgängligt underlag. Sammanställningen kan kräva granskning.',
    paragraphs: ['Öppna Moms för periodernas rapport, status, deklaration och betalningshändelser. Ett sammanfattat belopp visar inte ensamt om en period är deklarerad eller betald.'],
    keywords: ['dashboard', 'ackumulerad', 'momsöversikt'], destinations: ['moms', 'dashboard'], reviewed,
  },
  {
    id: 'ne-r14', aliases: ['r14'], topic: 'year', title: 'Är R14 företagets vinst?',
    answer: 'Nej. R11 visar årets bokförda resultat. R14 gäller bokförda intäkter som inte ska tas upp till beskattning.',
    paragraphs: ['R17 är inte automatiskt ditt slutliga deklarationsresultat. Följ NE-guiden för återstående justeringar innan du fastställer R47 eller R48.'],
    keywords: ['vinst', 'resultat', 'r11', 'r17', 'r47', 'r48', 'nebilaga'], destinations: ['ne'], sources: [sources.ne], reviewed,
  },
  {
    id: 'arsavslut', topic: 'year', title: 'Hur gör jag klart året?',
    answer: 'Följ Årsavslut för att granska underlag, bank, fakturor, inventarier, moms och rapporter. Klarmarkeringarna är dina egna bekräftelser.',
    steps: ['Välj rätt räkenskapsår och följ kontrollerna i Årsavslut.', 'Utred saknade underlag, differenser och stopp i respektive funktion.', 'Granska bokslut och NE-underlag. Lås året separat när kontrollerna är klara och villkoren är uppfyllda.', 'Följ NE-guiden och dokumentera deklarationen. Kontrollera momsens egna perioder och tidsfrister separat.'],
    warning: 'Årslås, inlämnad deklaration och betalning är olika saker. En läst guide innebär inte att någon av dem är genomförd.',
    keywords: ['bokslut', 'låsa', 'årslås', 'checklista', 'nästa år'], destinations: ['arsavslut', 'ne'], reviewed,
  },
  {
    id: 'deklaration', topic: 'year', title: 'Hur går jag från bokföring till inlämnad NE-bilaga?',
    answer: 'NE-Bilaga sammanställer bokföringen som underlag. Följ femstegsguiden där för personliga justeringar, granskning och inlämning hos Skatteverket.',
    paragraphs: ['SoloLedger lämnar inte in deklarationen. Kontrollera rätt inkomstår, komplettera uppgifter som beror på din situation och spara Skatteverkets inlämningskvitto.', 'Bokfört resultat och bankpengar är olika saker. Moms, fordringar, skulder, avskrivningar och egna uttag eller insättningar kan förklara skillnaden.'],
    keywords: ['inkomstdeklaration', 'skatt', 'rutor', 'resultat', 'bank', 'b9'], destinations: ['ne', 'arsavslut'], sources: [sources.declaration], reviewed,
  },
  {
    id: 'deklarationshistorik', topic: 'year', title: 'Kan jag spara NE-underlag och deklarationshistorik?',
    answer: 'Ja. I NE-Bilaga finns deklarationshistorik med sparade versioner. Bokföringsunderlag kräver låst år och godkända kontroller.',
    paragraphs: ['Du kan dokumentera egna och faktiskt deklarerade uppgifter även utan låst år. Granska vilken version och vilket underlag uppgifterna hör till.', 'En sparad version i SoloLedger är inte ett inlämningskvitto. Behåll Skatteverkets kvittens och dina deklarationshandlingar separat.'],
    keywords: ['fryst', 'ne-version', 'arkiv', 'kvittens', 'inlämnad'], destinations: ['ne'], reviewed,
  },
  {
    id: 'skatt-enskild-firma', topic: 'withdrawal', title: 'Beskattas jag för resultatet eller för mina uttag?',
    answer: 'Det är verksamhetens skattemässiga överskott som beskattas, inte hur mycket pengar du tar ut. Personlig skatt och debiterad F-skatt är inte företagskostnader.',
    paragraphs: ['Den faktiska skatten beror på din situation och deklarationens justeringar. Skilj bokfört resultat i R11 från det slutliga skattemässiga resultatet.', 'En överföring från företagsbanken till skattekontot ändrar inte i sig resultatet. Granska händelsen och använd avsett flöde; en blandad skatteöverföring är inte automatiskt momsbetalning.'],
    keywords: ['f-skatt', 'preliminärskatt', 'egenavgifter', 'personlig skatt', 'eget uttag'], destinations: ['ne', 'moms'], sources: [sources.ne], reviewed,
  },
  {
    id: 'sakert-uttag', topic: 'withdrawal', title: 'Vad betyder beloppet i Säkert uttag?',
    answer: 'Beloppet bygger på tillgängligt underlag och kan vara uppskattat. Läs statusen och kvarstående kontroller i kortet.',
    paragraphs: ['Granska bank, kvarstående moms och årsvisa skatteuppskattningar samt de sparade kontroller som kortet visar. Ett banksaldo är inte samma sak som pengar som kan tas ut.', 'Beloppet är ingen garanti för faktisk skatt eller framtida utgifter. Utred saknade uppgifter före ett uttag.'],
    keywords: ['uttagsutrymme', 'ta ut', 'pengar', 'reserv', 'skatteuppskattning'], destinations: ['dashboard'], reviewed,
  },
]

export function findHelpArticle(id: string | null) {
  return id ? helpArticles.find(article => article.id === id || article.aliases?.includes(id)) : undefined
}
export function normalizeHelpText(text: string): string {
  return text.toLocaleLowerCase('sv-SE').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
const synonymGroups = [
  ['momsfri', 'momsbefriad'], ['utlägg', 'privat betalning'],
  ['korrigera', 'rätta', 'rättelse'], ['årslås', 'låsa', 'låsning'],
  ['uttagsutrymme', 'säkert uttag'], ['nebilaga', 'ne-bilaga'],
].map(group => group.map(normalizeHelpText))

export function searchHelp(query: string, topic: HelpTopic | 'all' = 'all'): HelpArticle[] {
  const terms = normalizeHelpText(query.trim()).split(/\s+/).filter(Boolean)
  return helpArticles.filter(article => {
    if (topic !== 'all' && article.topic !== topic) return false
    const haystack = normalizeHelpText([article.title, article.answer, article.applies,
      ...(article.paragraphs ?? []), ...(article.steps ?? []), article.warning,
      ...article.keywords, ...(article.destinations?.map(d => helpDestinations[d]) ?? []),
    ].filter(Boolean).join(' '))
    return terms.every(term => {
      const alternatives = synonymGroups.find(group => group.includes(term)) ?? [term]
      return alternatives.some(alternative => haystack.includes(alternative))
    })
  })
}
