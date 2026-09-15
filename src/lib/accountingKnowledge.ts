export type AccountGuidanceStatus =
  | 'direct'
  | 'conditional'
  | 'technical'

export interface AccountGuidance {
  /**
   * direct      = SoloLedger kan normalt rekommendera kategorin direkt.
   * conditional = användaren behöver kontrollera en eller flera saker först.
   * technical   = kategorin används av SoloLedger/systemet och är normalt
   *               inget användaren själv ska välja.
   */
  status: AccountGuidanceStatus

  /**
   * Kort förklaring på vanlig svenska av vad kategorin används till.
   */
  summary: string

  /**
   * När kategorin normalt passar.
   */
  suitableWhen?: string

  /**
   * Viktig begränsning eller situation där användaren bör vara försiktig.
   */
  warning?: string
}

/**
 * Grundkontoplan v1
 *
 * Den nya kunskapsmodellen skiljer på:
 *
 * VAD  = vad som har hänt i verksamheten
 * HUR  = hur det betalades eller reglerades
 * MOMS = hur momsen ska hanteras
 *
 * BookingCategory beskriver användarens bokföringskategori.
 * SystemAccount beskriver tekniska BAS-konton som SoloLedger behöver känna till.
 *
 * Den befintliga AccountPreset-modellen finns kvar tills Kontoplan,
 * setupDefaultAccounts och bokföringsflödet har migrerats stegvis.
 */

export type AccountGroup =
  | 'income'
  | 'purchases'
  | 'premises'
  | 'equipment'
  | 'travel'
  | 'marketing'
  | 'administration'
  | 'education'
  | 'owner'
  | 'assets'
  | 'vat'
  | 'periodization'
  | 'system'

export type Availability =
  | 'default'
  | 'quick'
  | 'guided'
  | 'system'

export type UsageType =
  | 'direct'
  | 'special'
  | 'system'

export type GuidanceStatus =
  | 'direct'
  | 'conditional'
  | 'technical'

export type VatGuidanceStatus =
  | 'standard'
  | 'conditional'
  | 'none'
  | 'technical'

export interface CategoryGuidance {
  /**
   * direct
   * SoloLedger kan normalt rekommendera kategorin direkt.
   *
   * conditional
   * En eller flera omständigheter måste kontrolleras först.
   *
   * technical
   * Teknisk/systemnära hantering som användaren normalt inte väljer själv.
   */
  status: GuidanceStatus

  /**
   * Kort förklaring på vanlig svenska av vad kategorin används till.
   */
  summary: string

  /**
   * Situationer där kategorin normalt passar.
   */
  suitableWhen?: string

  /**
   * Viktig begränsning eller vanlig felanvändning.
   */
  warning?: string
}

export interface VatGuidance {
  /**
   * standard
   * Normal momsbehandling är tydlig för det stödda scenariot.
   *
   * conditional
   * Momsbehandlingen beror på omständigheterna.
   *
   * none
   * Kategorien har normalt ingen separat momsbehandling.
   *
   * technical
   * Momsen hanteras av SoloLedger/systemflödet.
   */
  status: VatGuidanceStatus

  /**
   * Kort förklaring av momsbehandlingen.
   */
  summary?: string

  /**
   * Situation där användaren behöver kontrollera momsen extra noggrant.
   */
  warning?: string
}

/**
 * Tillfällig kompatibilitetsbrygga till SoloLedgers nuvarande
 * AccountPreset-modell.
 *
 * Detta beskriver hur kategorin kan representeras i dagens förenklade
 * debit/kredit/moms-mall. Det är INTE kategorins framtida bokföringsregel.
 *
 * När bokföringsflödet fullt ut skiljer på VAD, HUR och MOMS kan denna
 * kompatibilitetsmodell tas bort.
 */
export interface LegacyPresetMapping {
  debitAccount: string
  creditAccount: string
  defaultVatRate: number
  comment: string
}

export interface BookingCategory {
  /**
   * Stabilt internt id för SoloLedger-kategorin.
   */
  id: string

  /**
   * Det huvudsakliga BAS-konto som kategorin normalt hör till.
   *
   * Detta är medvetet inte samma sak som ett komplett bokföringsförslag.
   * Motkonto och moms kan bero på hur transaktionen genomfördes.
   */
  primaryAccount: string

  /**
   * Användarvänligt namn. BAS-numret är sekundärt i UX.
   */
  name: string

  /**
   * Grupp som används för struktur och navigering i Kontoplan/guiden.
   */
  group: AccountGroup

  /**
   * default = ingår i SoloLedgers grundkontoplan
   * quick   = enkelt snabbval
   * guided  = bör normalt läggas till via guide
   * system  = teknisk kategori, normalt inte användarval
   */
  availability: Availability

  /**
   * direct  = vanlig bokföringskategori
   * special = kräver särskilt flöde eller särskild hantering
   * system  = teknisk/systemstyrd
   */
  usageType: UsageType

  /**
   * Guidning för valet av själva bokföringskategorin.
   */
  categoryGuidance: CategoryGuidance

  /**
   * Separat guidning för moms.
   *
   * En kategori kan alltså vara enkel att identifiera samtidigt som
   * momsbehandlingen kräver ytterligare frågor.
   */
  vatGuidance: VatGuidance

  /**
   * Ord som framtida "Vad ska jag bokföra detta som?"-guide
   * kan använda för att hitta relevanta kandidater.
   *
   * Dessa är sökhjälp – inte automatiska bokföringsregler.
   */
  keywords?: string[]

  /**
   * Konkreta exempel som hjälper både användaren och framtida guide.
   *
   * Exemplen innebär inte att kategorin alltid är rätt utan kontroll
   * av eventuell villkorad guidning.
   */
  examples?: string[]

  /**
   * Tillfällig representation för nuvarande AccountPreset-baserade flöde.
   *
   * Ska inte användas som generell bokföringsregel. Motkonto och moms
   * kan i verkligheten bero på transaktionens betalningssätt och scenario.
   */
  legacyPreset?: LegacyPresetMapping
}

export interface SystemAccount {
  /**
   * Faktiskt BAS-kontonummer.
   */
  accountNumber: string

  /**
   * Användarvänligt/tekniskt namn.
   */
  name: string

  /**
   * Grupp för struktur i kunskapsbasen.
   */
  group: AccountGroup

  /**
   * Systemkonton ingår i kunskapsbasen men är inte vanliga
   * bokföringskategorier.
   */
  availability: 'system'

  /**
   * Vissa systemkonton används i särskilda flöden, andra är helt tekniska.
   */
  usageType: 'system' | 'special'

  /**
   * Förklaring av vilken funktion kontot har i SoloLedger.
   */
  description: string

  /**
   * V1-systemkonton ska inte kunna väljas som vanlig kategori.
   */
  userSelectable: false
}

/**
 * Grundkontoplan v1 – användarens bokföringskategorier.
 *
 * Detta är kunskapslagret för VAD som har hänt.
 *
 * primaryAccount är kategorins huvudsakliga BAS-konto, men beskriver
 * inte ensam hela konteringen. Motkonto, betalningssätt och moms
 * hanteras separat.
 *
 * resultEngine.ts är fortsatt enda sanningen för resultat- och
 * NE-klassificering. Ingen sådan mappning dupliceras här.
 */
export const BOOKING_CATEGORIES: BookingCategory[] = [
  // ---------------------------------------------------------------------------
  // DEFAULT
  // ---------------------------------------------------------------------------

  {
    id: 'forsaljning',
    primaryAccount: '3010',
    name: 'Försäljning',
    group: 'income',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '1930',
      creditAccount: '3010',
      defaultVatRate: 25,
      comment:
        'Vanlig försäljning. Moms och kontering måste anpassas efter den aktuella försäljningen.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Intäkter från varor eller tjänster som du säljer i verksamheten.',
      suitableWhen:
        'När verksamheten har sålt en vara eller tjänst och försäljningen hör till den löpande verksamheten.',
      warning:
        'Rätt försäljningskonto kan bero på vad du säljer och var kunden finns. SoloLedger ska därför inte utgå från att all försäljning behandlas likadant.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsen på försäljning beror bland annat på vad som säljs och var kunden finns.',
      warning:
        'Använd inte automatiskt 25 % moms för all försäljning. Momssats och momsbehandling måste stämma med den aktuella försäljningen.',
    },
    keywords: [
      'försäljning',
      'intäkt',
      'kund',
      'sålt',
      'såld',
      'faktura',
      'kundbetalning',
    ],
    examples: [
      'Försäljning av tjänst',
      'Försäljning av vara',
      'Betalning från kund',
    ],
  },

  {
    id: 'forbrukningsinventarier',
    primaryAccount: '5410',
    name: 'Förbrukningsinventarier',
    group: 'equipment',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5410',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment:
        'Utrustning och inventarier som enligt reglerna får kostnadsföras direkt.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Utrustning och inventarier som kan kostnadsföras direkt i verksamheten.',
      suitableWhen:
        'När inköpet är en inventarie som enligt reglerna får dras av direkt i stället för att bokföras som en tillgång och skrivas av över flera år.',
      warning:
        'Valet mellan Förbrukningsinventarier och Inventarier beror inte bara på inköpspriset. Bland annat ekonomisk livslängd och naturligt sammanhängande inköp kan påverka bedömningen.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på inköpet, leverantören och verksamhetens rätt att dra av ingående moms.',
      warning:
        'Kontrollera underlaget och momsbehandlingen innan momsen dras av.',
    },
    keywords: [
      'utrustning',
      'inventarie',
      'inventarier',
      'kamera',
      'dator',
      'skärm',
      'skrivare',
      'telefon',
      'verktyg',
    ],
    examples: [
      'Mindre utrustning till verksamheten',
      'Kamera eller tillbehör som får kostnadsföras direkt',
      'Datorutrustning som får kostnadsföras direkt',
    ],
  },

  {
    id: 'programvaror',
    primaryAccount: '5420',
    name: 'Programvaror & prenumerationer',
    group: 'equipment',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5420',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Programvaror, licenser, appar och digitala abonnemang.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Programvaror, appar, licenser och digitala abonnemang som används i verksamheten.',
      suitableWhen:
        'När du betalar för en programvara, SaaS-tjänst, app, licens eller liknande digital tjänst för verksamheten.',
      warning:
        'En konsult eller utvecklare som utför arbete åt dig är normalt en köpt tjänst, inte en programvaruprenumeration.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen kan skilja sig beroende på var leverantören finns och hur tjänsten faktureras.',
      warning:
        'Utländska leverantörer och digitala tjänster kan kräva annan momsbehandling än ett vanligt svenskt inköp.',
    },
    keywords: [
      'programvara',
      'mjukvara',
      'app',
      'saas',
      'licens',
      'prenumeration',
      'abonnemang',
      'adobe',
      'molntjänst',
    ],
    examples: [
      'Adobe Creative Cloud',
      'Bokföringsprogram',
      'Molntjänst',
      'Programlicens',
    ],
  },

  {
    id: 'resor',
    primaryAccount: '5800',
    name: 'Resor i verksamheten',
    group: 'travel',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5800',
      creditAccount: '1930',
      defaultVatRate: 6,
      comment:
        'Resor i verksamheten. Kontrollera alltid momsbehandlingen på underlaget.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Resor som görs för verksamhetens räkning.',
      suitableWhen:
        'Till exempel när du reser till ett kunduppdrag, möte eller annan plats som du behöver besöka i verksamheten.',
      warning:
        'Vanliga resor mellan bostaden och verksamhetslokalen kan omfattas av andra regler. Egen bil i verksamheten hanteras också separat.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsen kan skilja sig mellan olika typer av resor och underlag.',
      warning:
        'Utgå från det faktiska underlaget i stället för att anta en viss momssats för alla resor.',
    },
    keywords: [
      'resa',
      'resor',
      'tåg',
      'taxi',
      'buss',
      'kollektivtrafik',
      'flyg',
      'kundresa',
    ],
    examples: [
      'Tåg till kunduppdrag',
      'Taxi i samband med arbete',
      'Kollektivtrafik under en verksamhetsresa',
    ],
  },

  {
    id: 'bankavgift',
    primaryAccount: '6570',
    name: 'Bankavgifter',
    group: 'administration',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6570',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'Bank- och betaltjänstkostnader.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Avgifter som banken eller en betaltjänst tar ut för tjänster som hör till verksamheten.',
      suitableWhen:
        'Till exempel bankavgifter och andra avgifter för företagets bank- och betaltjänster.',
      warning:
        'Kontrollera att det verkligen är en avgift och inte exempelvis ränta, amortering eller ett vanligt inköp.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Vanliga bank- och finansiella avgifter har normalt ingen avdragsgill ingående moms.',
    },
    keywords: [
      'bankavgift',
      'bankkostnad',
      'bank',
      'kortavgift',
      'betaltjänst',
    ],
    examples: [
      'Bankens kontoavgift',
      'Avgift för företagets banktjänst',
    ],
  },

  {
    id: 'kurser',
    primaryAccount: '6991',
    name: 'Kurser & fortbildning',
    group: 'education',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6991',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment:
        'Utbildning med tydlig koppling till den verksamhet du redan bedriver.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Utbildning och fortbildning kan vara avdragsgill när den har ett tydligt samband med verksamheten du redan bedriver.',
      suitableWhen:
        'Utbildningen underhåller eller utvecklar kunskaper som du behöver i din nuvarande verksamhet.',
      warning:
        'Utbildning som ger dig förutsättningar att starta en ny verksamhet eller arbeta inom ett nytt område är normalt inte avdragsgill som fortbildning. Kontrollera därför syftet med utbildningen innan du bokför den.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på utbildningen och hur den har fakturerats.',
      warning:
        'Kontrollera underlaget i stället för att anta att alla kurser har samma momsbehandling.',
    },
    keywords: [
      'kurs',
      'kurser',
      'utbildning',
      'fortbildning',
      'workshop',
      'seminarium',
    ],
    examples: [
      'Fortbildning inom det område verksamheten redan arbetar med',
      'Kurs som utvecklar befintliga yrkeskunskaper',
    ],
  },

  {
    id: 'skatter_avgifter',
    primaryAccount: '2012',
    name: 'Skatter & avgifter – eget uttag',
    group: 'owner',
    availability: 'default',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '2012',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment:
        'När firmans pengar används för ägarens F-skatt och andra privata skatter eller avgifter.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'När firmans pengar används för ägarens F-skatt eller andra privata skatter och avgifter.',
      suitableWhen:
        'När en skatt eller avgift som hör till dig som privatperson betalas med pengar från firman.',
      warning:
        'Ägarens privata skatt är inte en kostnad i den enskilda firman utan hanteras som eget uttag.',
    },
    vatGuidance: {
      status: 'none',
    },
    keywords: [
      'f-skatt',
      'preliminärskatt',
      'skatt',
      'egenavgift',
      'skatteverket',
    ],
    examples: [
      'F-skatt betald från företagskontot',
      'Privat skatt betald med firmans pengar',
    ],
  },

  {
    id: 'eget_uttag',
    primaryAccount: '2013',
    name: 'Eget uttag',
    group: 'owner',
    availability: 'default',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '2013',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'När pengar tas ut från firman för privat användning.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Pengar eller privata utgifter som tas ur den enskilda firman för ägarens privata användning.',
      suitableWhen:
        'När du för över pengar från firman till dig själv eller när firman betalar en privat kostnad.',
      warning:
        'Eget uttag är inte lön och inte en kostnad i verksamheten. En privat kostnad som betalas med firmans pengar ska inte bokföras som exempelvis 6992.',
    },
    vatGuidance: {
      status: 'none',
    },
    keywords: [
      'eget uttag',
      'privat uttag',
      'privat kostnad',
      'överföring privat',
      'ta ut pengar',
    ],
    examples: [
      'Överföring från företagskontot till privat konto',
      'Privat inköp betalt med firmans pengar',
    ],
  },

  {
    id: 'egen_insattning',
    primaryAccount: '2018',
    name: 'Egen insättning',
    group: 'owner',
    availability: 'default',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '1930',
      creditAccount: '2018',
      defaultVatRate: 0,
      comment: 'När privata pengar sätts in i firman.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Privata pengar eller privata utlägg som förs in i verksamheten.',
      suitableWhen:
        'När du sätter in privata pengar i firman eller har betalat en verklig verksamhetskostnad med privata pengar.',
      warning:
        'Om du privat har betalat en kostnad för verksamheten måste även själva kostnaden bokföras. Egen insättning beskriver hur verksamheten finansierades – inte vad som köptes.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Själva egna insättningen har ingen moms. Moms kan däremot finnas på den verksamhetskostnad som betalades privat.',
    },
    keywords: [
      'egen insättning',
      'privat utlägg',
      'privata pengar',
      'betalat privat',
      'insättning',
    ],
    examples: [
      'Sätta in privata pengar på företagskontot',
      'Verksamhetsinköp betalt med privat kort',
    ],
  },

  // ---------------------------------------------------------------------------
  // QUICK
  // ---------------------------------------------------------------------------

  {
    id: 'varor_material',
    primaryAccount: '4010',
    name: 'Varor & material för försäljning',
    group: 'purchases',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '4010',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Varor och material som köps in för försäljning eller används direkt i det som säljs.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Varor och material som köps in för att säljas vidare eller användas direkt i det som levereras till kunden.',
      suitableWhen:
        'När inköpet har en tydlig och direkt koppling till de varor eller produkter som verksamheten säljer.',
      warning:
        'Kontorsmaterial, utrustning och inventarier ska inte läggas här bara för att de används i verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på inköpet, leverantören och verksamhetens avdragsrätt.',
      warning:
        'Kontrollera fakturan och leverantörens momsbehandling.',
    },
    keywords: [
      'varor',
      'material',
      'råmaterial',
      'inköp för försäljning',
      'vidareförsäljning',
    ],
    examples: [
      'Varor som köps in för vidareförsäljning',
      'Material som direkt används i det som säljs till kund',
    ],
  },

  {
    id: 'kopta_tjanster_kunduppdrag',
    primaryAccount: '4600',
    name: 'Köpta tjänster för kunduppdrag',
    group: 'purchases',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '4600',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Extern tjänst som är en direkt del av ett kunduppdrag.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Tjänster från andra företag eller personer som är en direkt del av det du levererar till kunden.',
      suitableWhen:
        'När en extern tjänst köps in specifikt för att kunna genomföra eller leverera ett kunduppdrag.',
      warning:
        'Allmän IT-support, redovisning och andra stödtjänster hör normalt inte hit bara för att de hjälper verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror bland annat på leverantören och var tjänsten köps från.',
      warning:
        'Utländska leverantörer kan kräva särskild momsbehandling.',
    },
    keywords: [
      'underleverantör',
      'underentreprenör',
      'kunduppdrag',
      'köpt tjänst',
      'extern hjälp',
      'legoarbete',
    ],
    examples: [
      'Extern retuschör i ett specifikt kunduppdrag',
      'Underleverantör som utför en del av kundens beställning',
    ],
  },

  {
    id: 'lokalhyra',
    primaryAccount: '5010',
    name: 'Hyra för verksamhetslokal',
    group: 'premises',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5010',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'Hyra för separat verksamhetslokal – inte vanligt hemmakontor.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Hyra för en separat lokal som används i verksamheten.',
      suitableWhen:
        'Till exempel separat kontor, studio, lager eller annan verksamhetslokal.',
      warning:
        'Använd inte kategorin automatiskt för vanligt hemmakontor eller för en del av den privata bostaden. Där gäller särskilda regler.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Moms på lokalhyra beror på hur lokalen och uthyrningen behandlas.',
      warning:
        'Utgå från hyresavin eller fakturan och anta inte automatiskt att lokalhyran innehåller moms.',
    },
    keywords: [
      'lokal',
      'lokalhyra',
      'hyra',
      'studio',
      'kontor',
      'lager',
    ],
    examples: [
      'Hyra för separat fotostudio',
      'Hyra för separat kontorslokal',
      'Hyra för lagerlokal',
    ],
  },

  {
    id: 'el_verksamhetslokal',
    primaryAccount: '5020',
    name: 'El för verksamhetslokal',
    group: 'premises',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5020',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'El för separat verksamhetslokal – inte vanlig hushållsel.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Elkostnad för en separat lokal som används i verksamheten.',
      suitableWhen:
        'När elen avser exempelvis ett separat kontor, studio, lager eller annan verksamhetslokal.',
      warning:
        'Vanlig hushållsel i den privata bostaden ska inte automatiskt bokföras som verksamhetskostnad.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Kontrollera momsen på elräkningen och verksamhetens avdragsrätt.',
      warning:
        'Om kostnaden helt eller delvis hör till privatbostaden kan särskilda regler gälla.',
    },
    keywords: [
      'el',
      'elräkning',
      'verksamhetslokal',
      'studioel',
      'lokalel',
    ],
    examples: [
      'El för separat studio',
      'El för separat kontorslokal',
    ],
  },

  {
    id: 'frakt',
    primaryAccount: '5710',
    name: 'Frakt & varutransporter',
    group: 'travel',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5710',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Frakt och transport av varor i verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Frakt och transport av varor som hör till verksamheten.',
      suitableWhen:
        'När varor skickas, levereras eller transporteras i verksamheten.',
      warning:
        'Porto för brev och mindre postförsändelser hör normalt till Porto. Dina egna verksamhetsresor hör till Resor i verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på transporttjänsten och underlaget.',
      warning:
        'Kontrollera fakturan eller kvittot för den aktuella frakten.',
    },
    keywords: [
      'frakt',
      'transport',
      'varutransport',
      'leverans',
      'paketfrakt',
    ],
    examples: [
      'Frakt av varor till kund',
      'Transportkostnad för varuleverans',
    ],
  },

  {
    id: 'egen_bil',
    primaryAccount: '5843',
    name: 'Egen bil i verksamheten',
    group: 'travel',
    availability: 'quick',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '5843',
      creditAccount: '2018',
      defaultVatRate: 0,
      comment: 'Privat bil som används för resor i verksamheten.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'När du använder din privata bil för resor som görs i verksamheten.',
      suitableWhen:
        'När resan är en verksamhetsresa och du använder en bil som är privatägd.',
      warning:
        'Bokför inte privata bensin-, försäkrings- eller servicekvitton här. Vanliga resor mellan bostaden och verksamhetslokalen hanteras också separat.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Själva schablonavdraget/milersättningen för användning av privat bil har ingen separat ingående moms.',
    },
    keywords: [
      'egen bil',
      'privat bil',
      'milersättning',
      'mil',
      'bilresa',
      'körjournal',
    ],
    examples: [
      'Privat bil till kunduppdrag',
      'Privat bil till verksamhetsmöte',
    ],
  },

  {
    id: 'reklam',
    primaryAccount: '5910',
    name: 'Reklam & annonsering',
    group: 'marketing',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5910',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Reklam och annonsering för verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Annonsering och reklam som görs för att marknadsföra verksamheten.',
      suitableWhen:
        'När du köper annonser, reklamkampanjer eller motsvarande marknadsföring.',
      warning:
        'Andra typer av marknadsföringskostnader kan behöva bedömas separat om de inte faktiskt är reklam eller annonsering.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror bland annat på vilken leverantör som säljer annonseringen.',
      warning:
        'Utländska annonsplattformar kan kräva annan momsbehandling än svenska annonser.',
    },
    keywords: [
      'reklam',
      'annons',
      'annonsering',
      'google ads',
      'meta ads',
      'facebook ads',
      'instagram ads',
      'kampanj',
    ],
    examples: [
      'Google Ads',
      'Meta-annonser',
      'Tidningsannons',
      'Betald reklamkampanj',
    ],
  },

  {
    id: 'kontorsmaterial',
    primaryAccount: '6110',
    name: 'Kontorsmaterial',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6110',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Kontorsmaterial som används i verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Förbrukningsmaterial som används för vanligt kontorsarbete.',
      suitableWhen:
        'Till exempel papper, pennor, kuvert, pärmar och etiketter för verksamheten.',
      warning:
        'Datorer, skärmar, skrivare och annan utrustning är inte kontorsmaterial bara för att de står på kontoret.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på underlaget och verksamhetens avdragsrätt.',
      warning:
        'Kontrollera att inköpet faktiskt hör till verksamheten och att momsen framgår korrekt.',
    },
    keywords: [
      'kontorsmaterial',
      'papper',
      'pennor',
      'kuvert',
      'pärmar',
      'etiketter',
    ],
    examples: [
      'Kopieringspapper',
      'Pennor',
      'Kuvert',
      'Pärmar',
    ],
  },

  {
    id: 'mobiltelefoni',
    primaryAccount: '6212',
    name: 'Mobiltelefoni',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6212',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Mobilabonnemang och telefoni som hör till verksamheten.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Kostnader för mobilabonnemang och telefoni som används i verksamheten.',
      suitableWhen:
        'När kostnaden gäller själva telefonitjänsten eller mobilabonnemanget för verksamheten.',
      warning:
        'Själva mobiltelefonen är utrustning och ska inte bokföras här. Privat användning kan också påverka hur stor del av kostnaden som hör till verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsavdraget beror på hur tjänsten används i verksamheten och på underlaget.',
      warning:
        'Om abonnemanget också används privat kan avdragsrätten behöva bedömas.',
    },
    keywords: [
      'mobil',
      'mobilabonnemang',
      'telefon',
      'telefoni',
      'mobiltelefoni',
      'samtal',
    ],
    examples: [
      'Mobilabonnemang för verksamheten',
      'Telefonitjänst för företaget',
    ],
  },

  {
    id: 'internet',
    primaryAccount: '6230',
    name: 'Internet & datakommunikation',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6230',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Internet- och datakommunikationstjänster som hör till verksamheten.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Internet- och datakommunikationstjänster som hör till verksamheten.',
      suitableWhen:
        'När kostnaden avser internet eller datakommunikation som används i verksamheten.',
      warning:
        'Ett vanligt privat internetabonnemang i bostaden är inte automatiskt fullt avdragsgillt bara för att internet också används i verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsavdraget beror på underlaget och hur tjänsten används i verksamheten.',
      warning:
        'Blandad privat användning kan påverka avdragsrätten.',
    },
    keywords: [
      'internet',
      'bredband',
      'datakommunikation',
      'fiber',
      'uppkoppling',
    ],
    examples: [
      'Internetanslutning för separat verksamhetslokal',
      'Datakommunikation för verksamheten',
    ],
  },

  {
    id: 'porto',
    primaryAccount: '6250',
    name: 'Porto',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6250',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Porto och posttjänster som används i verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Porto och posttjänster som används i verksamheten.',
      suitableWhen:
        'När du skickar brev eller andra försändelser där kostnaden är en post- eller portotjänst.',
      warning:
        'Frakt och transport av varor hör normalt till Frakt & varutransporter.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen kan skilja sig mellan olika post- och transporttjänster.',
      warning:
        'Kontrollera det faktiska underlaget i stället för att anta en momssats.',
    },
    keywords: [
      'porto',
      'frimärke',
      'brev',
      'post',
      'posttjänst',
    ],
    examples: [
      'Porto för brev',
      'Frimärken för verksamheten',
    ],
  },

  {
    id: 'foretagsforsakring',
    primaryAccount: '6310',
    name: 'Företagsförsäkring',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6310',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'Försäkringar som tecknats för verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Försäkringar som tecknats för verksamheten.',
      suitableWhen:
        'Till exempel ansvarsförsäkring eller sakförsäkring som hör till firman.',
      warning:
        'Privata försäkringar ska inte bokföras här bara för att du driver enskild firma.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Vanliga försäkringstjänster har normalt ingen avdragsgill ingående moms.',
    },
    keywords: [
      'företagsförsäkring',
      'försäkring',
      'ansvarsförsäkring',
      'sakförsäkring',
    ],
    examples: [
      'Ansvarsförsäkring för verksamheten',
      'Sakförsäkring för företagets utrustning',
    ],
  },

  {
    id: 'redovisningstjanster',
    primaryAccount: '6530',
    name: 'Redovisningstjänster',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6530',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Extern hjälp med bokföring, redovisning, bokslut och liknande ekonomiadministration.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Extern hjälp med bokföring, redovisning, bokslut och liknande ekonomiadministration.',
      suitableWhen:
        'När du köper redovisnings- eller bokföringstjänster för verksamheten.',
      warning:
        'Allmän affärsrådgivning eller andra konsulttjänster kan höra till en annan kategori.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på leverantören och underlaget.',
      warning:
        'Kontrollera fakturan, särskilt om tjänsten köps från en utländsk leverantör.',
    },
    keywords: [
      'redovisning',
      'bokföring',
      'bokslut',
      'deklaration',
      'redovisningskonsult',
      'bokförare',
    ],
    examples: [
      'Hjälp med löpande bokföring',
      'Redovisningskonsult',
      'Hjälp med bokslut eller deklaration',
    ],
  },

  {
    id: 'it_tjanster',
    primaryAccount: '6540',
    name: 'IT-tjänster',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6540',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Externa IT-tjänster som stödjer den egna verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Externa IT-tjänster som stödjer den egna verksamheten.',
      suitableWhen:
        'Till exempel IT-support, teknisk drift, webbutveckling eller annan extern teknisk hjälp för verksamheten.',
      warning:
        'Programvaror och SaaS hör normalt till Programvaror & prenumerationer. En extern person som arbetar direkt i ett kunduppdrag kan i stället höra till Köpta tjänster för kunduppdrag.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på leverantören och var tjänsten köps från.',
      warning:
        'Utländska IT-leverantörer kan kräva särskild momsbehandling.',
    },
    keywords: [
      'it',
      'it-support',
      'support',
      'webbutveckling',
      'utvecklare',
      'teknisk hjälp',
      'drift',
    ],
    examples: [
      'IT-konsult som reparerar eller konfigurerar företagets datorer',
      'Extern webbutvecklare för företagets egen webbplats',
      'Teknisk support för verksamheten',
    ],
  },

  // ---------------------------------------------------------------------------
  // GUIDED
  // ---------------------------------------------------------------------------

  {
    id: 'konsultarvoden',
    primaryAccount: '6550',
    name: 'Konsultarvoden',
    group: 'administration',
    availability: 'guided',
    usageType: 'direct',
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Generella konsulttjänster som hör till verksamheten när ingen mer specifik kategori passar bättre.',
      suitableWhen:
        'När du köper rådgivning eller konsultarbete för verksamheten och tjänsten inte tydligare hör hemma under exempelvis redovisning, IT eller ett kunduppdrag.',
      warning:
        'Använd inte Konsultarvoden som standard för alla externa tjänster. Redovisning hör normalt till 6530, IT-tjänster till 6540 och tjänster som är en direkt del av ett kunduppdrag kan höra till 4600.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på vilken konsulttjänst som köpts och var leverantören finns.',
      warning:
        'Kontrollera fakturan och leverantörens land innan momsbehandlingen bestäms.',
    },
    keywords: [
      'konsult',
      'konsultarvode',
      'rådgivare',
      'rådgivning',
      'expert',
    ],
    examples: [
      'Extern affärskonsult',
      'Specialistrådgivning som inte passar bättre i en annan kategori',
    ],
  },

  {
    id: 'ej_avdragsgill_verksamhetskostnad',
    primaryAccount: '6992',
    name: 'Ej avdragsgill verksamhetskostnad',
    group: 'administration',
    availability: 'guided',
    usageType: 'special',
    categoryGuidance: {
      status: 'conditional',
      summary:
        'En verklig kostnad som hör till verksamheten men som inte får dras av skattemässigt.',
      suitableWhen:
        'Endast när utgiften faktiskt hör till verksamheten och du har konstaterat att den inte är skattemässigt avdragsgill.',
      warning:
        'VIKTIGT: En privat kostnad är inte en ej avdragsgill verksamhetskostnad. Om firman betalar något privat ska det normalt hanteras som eget uttag. SoloLedger ska därför först kontrollera att utgiften verkligen hör till verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen måste bedömas utifrån den faktiska typen av kostnad.',
      warning:
        'Att en kostnad är skattemässigt ej avdragsgill betyder inte automatiskt att alla momsfrågor behandlas på samma sätt.',
    },
    keywords: [
      'ej avdragsgill',
      'inte avdragsgill',
      'böter',
      'förseningsavgift',
      'verksamhetskostnad',
    ],
    examples: [
      'Verksamhetsrelaterad kostnad som enligt skattereglerna inte får dras av',
    ],
  },

  {
    id: 'inventarier',
    primaryAccount: '1220',
    name: 'Inventarier',
    group: 'assets',
    availability: 'guided',
    usageType: 'special',
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Utrustning och inventarier som ska bokföras som tillgång och normalt skrivas av över flera år.',
      suitableWhen:
        'När inköpet är en inventarie som inte ska kostnadsföras direkt som förbrukningsinventarie.',
      warning:
        'Valet mellan Inventarier och Förbrukningsinventarier beror bland annat på värde, ekonomisk livslängd och om flera inköp är naturligt sammanhängande. SoloLedger ska använda reglerna för det aktuella året och inte en permanent beloppsgräns i kategorin.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på verksamhetens momsstatus, inköpet och leverantören.',
      warning:
        'För en verksamhet som inte får dra av ingående moms kan momsen påverka tillgångens anskaffningsvärde.',
    },
    keywords: [
      'inventarie',
      'inventarier',
      'tillgång',
      'avskrivning',
      'dyr utrustning',
      'kamera',
      'dator',
      'maskin',
    ],
    examples: [
      'Utrustning som ska användas under flera år och bokföras som tillgång',
      'Inventarie som ska skrivas av',
    ],
  },
]

/**
 * Grundkontoplan v1 – systemkonton.
 *
 * Dessa är BAS-konton som SoloLedger behöver känna till för bokföring,
 * rapportering, moms, eget kapital och särskilda bokföringsflöden.
 *
 * De är INTE vanliga användarkategorier och ska därför inte visas som
 * normala val när användaren väljer vad en transaktion gäller.
 *
 * Vissa konton har usageType 'special'. Det betyder att de kan ingå i
 * ett särskilt guidat flöde, men fortfarande inte ska väljas fritt som
 * en vanlig bokföringskategori.
 *
 * Resultat- och NE-klassificering hör fortsatt hemma i resultEngine.ts.
 */
export const SYSTEM_ACCOUNTS: SystemAccount[] = [
  {
    accountNumber: '1790',
    name: 'Förutbetalda kostnader',
    group: 'periodization',
    availability: 'system',
    usageType: 'system',
    description:
      'Tekniskt konto för kostnader som har betalats men helt eller delvis hör till en senare period. Användaren ska normalt beskriva periodiseringen i ett särskilt flöde i stället för att själv välja 1790.',
    userSelectable: false,
  },

  {
    accountNumber: '1930',
    name: 'Företagskonto',
    group: 'system',
    availability: 'system',
    usageType: 'system',
    description:
      'Företagets bankkonto. Detta beskriver hur en transaktion betalades eller togs emot och är därför ett betalningskonto, inte en kategori för vad transaktionen gäller.',
    userSelectable: false,
  },

  {
    accountNumber: '2010',
    name: 'Eget kapital',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för eget kapital i den enskilda firman. Ska inte användas som vanlig kategori för egna insättningar eller uttag.',
    userSelectable: false,
  },

  {
    accountNumber: '2011',
    name: 'Egna varuuttag',
    group: 'owner',
    availability: 'system',
    usageType: 'special',
    description:
      'SoloLedger känner till kontot för bland annat importerad bokföring och rapportering, men v1 stödjer inte ett komplett guidat flöde för egna varuuttag. Ett sådant uttag kan kräva hantering även av intäkt och moms, så SoloLedger ska inte förenkla det till en vanlig användarkategori.',
    userSelectable: false,
  },

  {
    accountNumber: '2014',
    name: 'Uttag av förmåner',
    group: 'owner',
    availability: 'system',
    usageType: 'special',
    description:
      'SoloLedger känner till kontot för bland annat importerad bokföring och rapportering, men v1 stödjer inte ett komplett guidat flöde för uttag av förmåner. Kontot ska därför inte erbjudas som en vanlig användarkategori.',
    userSelectable: false,
  },

  {
    accountNumber: '2017',
    name: 'Egna insättningar / kapitaltillskott',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'Kapital-/insättningskonto som SoloLedger behöver förstå vid bland annat importerad bokföring och rapportering. SoloLedgers primära användarkategori för egen insättning använder tills vidare 2018 för bakåtkompatibilitet.',
    userSelectable: false,
  },

  {
    accountNumber: '2019',
    name: 'Årets resultat',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'Tekniskt konto för årets resultat och eget kapital. Ska inte väljas som vanlig bokföringskategori av användaren.',
    userSelectable: false,
  },

  {
    accountNumber: '2611',
    name: 'Utgående moms 25 %',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för utgående moms med 25 procent. Momsflödet ska skapa och hantera momsraden utifrån den aktuella transaktionen i stället för att användaren väljer kontot manuellt.',
    userSelectable: false,
  },

  {
    accountNumber: '2621',
    name: 'Utgående moms 12 %',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för utgående moms med 12 procent. Momsflödet ska skapa och hantera momsraden utifrån den aktuella transaktionen i stället för att användaren väljer kontot manuellt.',
    userSelectable: false,
  },

  {
    accountNumber: '2631',
    name: 'Utgående moms 6 %',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för utgående moms med 6 procent. Momsflödet ska skapa och hantera momsraden utifrån den aktuella transaktionen i stället för att användaren väljer kontot manuellt.',
    userSelectable: false,
  },

  {
    accountNumber: '2641',
    name: 'Ingående moms',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för avdragsgill ingående moms på inköp. Användaren ska normalt ange eller kontrollera momsbehandlingen för inköpet, medan SoloLedger hanterar själva momskontot.',
    userSelectable: false,
  },

  {
    accountNumber: '2650',
    name: 'Redovisningskonto för moms',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Tekniskt avräkningskonto för momsredovisningen. Kontot är relevant för SoloLedgers moms- och rapporteringslogik men ska inte användas som vanlig bokföringskategori.',
    userSelectable: false,
  },

  {
    accountNumber: '7830',
    name: 'Avskrivning på inventarier',
    group: 'assets',
    availability: 'system',
    usageType: 'special',
    description:
      'Kostnadskonto som används när inventarier skrivs av. Användaren ska normalt hantera inventarien genom ett särskilt inventarie- och avskrivningsflöde i stället för att själv välja 7830.',
    userSelectable: false,
  },
]

export function getSystemAccount(accountNumber: string) {
  const nr = accountNumber.trim()
  return (
    SYSTEM_ACCOUNTS.find(account => account.accountNumber === nr) ?? null
  )
}

export function isSystemAccount(accountNumber: string) {
  return getSystemAccount(accountNumber) !== null
}

/**
 * Legacy-modell.
 *
 * Den används fortfarande av nuvarande Kontoplan och setupDefaultAccounts.
 * Den tas bort eller migreras först när de delarna har kopplats över till
 * Grundkontoplan v1.
 */
export interface AccountPreset {
  id: string
  name: string
  debit_account: string
  credit_account: string
  default_vat_rate: number
  comment: string

  /**
   * Ska kategorin skapas automatiskt för en ny användare?
   */
  seedDefault?: boolean

  /**
   * Ska kategorin visas som snabbförslag i Kontoplan?
   */
  quickSuggestion?: boolean

  /**
   * Guidning som SoloLedger kan använda för att hjälpa användaren
   * förstå när kategorin passar och när extra kontroll behövs.
   */
  guidance?: AccountGuidance
}

/**
 * Legacy-kunskapskälla för nuvarande SoloLedger-kategorier.
 *
 * OBS:
 * Denna lista behålls tills nuvarande Kontoplan/setupDefaultAccounts
 * har migrerats till Grundkontoplan v1.
 *
 * Ändra inte denna lista enbart för att BOOKING_CATEGORIES ovan har
 * en nyare eller bättre modell. Migreringen görs separat och kontrollerat.
 */
export const ACCOUNT_PRESETS: AccountPreset[] = [
  {
    id: 'avskrivning_inventarier',
    name: 'Avskrivning på inventarier',
    debit_account: '7830',
    credit_account: '1220',
    default_vat_rate: 0,
    comment: 'Avskrivning på inventarier som bokförts som tillgång',
    seedDefault: true,
  },
  {
    id: 'bankavgift',
    name: 'Bankavgift',
    debit_account: '6570',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: 'Bank- och betaltjänstkostnader',
    seedDefault: true,
    guidance: {
      status: 'direct',
      summary:
        'Avgifter som banken eller en betaltjänst tar ut för tjänster som hör till verksamheten.',
      suitableWhen:
        'Till exempel bankavgifter och andra avgifter för företagets bank- och betaltjänster.',
      warning:
        'Kontrollera att det verkligen är en avgift och inte exempelvis ränta, amortering eller ett vanligt inköp.',
    },
  },
  {
    id: 'egen_insättning',
    name: 'Egen insättning',
    debit_account: '1930',
    credit_account: '2018',
    default_vat_rate: 0,
    comment: 'När du sätter in privata pengar i firman',
    seedDefault: true,
  },
  {
    id: 'eget_uttag',
    name: 'Eget uttag',
    debit_account: '2013',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: 'När du tar ut pengar från firman privat – inte lön',
    seedDefault: true,
  },
  {
    id: 'ej_avdragsgillt',
    name: 'Ej avdragsgilla kostnader',
    debit_account: '6992',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'T.ex. böter och förseningsavgifter som inte är skattemässigt avdragsgilla',
    seedDefault: true,
  },
  {
    id: 'försäljning',
    name: 'Försäljning',
    debit_account: '1930',
    credit_account: '3010',
    default_vat_rate: 25,
    comment: 'Vanlig momspliktig försäljning. Ändra momssats vid behov.',
    seedDefault: true,
  },

  // Teknisk/legacy-kategori.
  // Behålls oförändrad tills migreringen till Grundkontoplan v1 görs.
  {
    id: 'ingående_balans',
    name: 'Eget kapital, ingående balans (IB)',
    debit_account: '1930',
    credit_account: '2010',
    default_vat_rate: 0,
    comment:
      'Tekniskt konto för ingående eget kapital – använd inte för vanliga egna insättningar',
    seedDefault: true,
  },

  {
    id: 'kurser',
    name: 'Kurser & fortbildning',
    debit_account: '6991',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'Utbildning med tydlig koppling till den verksamhet du redan bedriver',
    seedDefault: true,
    guidance: {
      status: 'conditional',
      summary:
        'Utbildning och fortbildning kan vara avdragsgill när den har ett tydligt samband med verksamheten du redan bedriver.',
      suitableWhen:
        'Utbildningen underhåller eller utvecklar kunskaper som du behöver i din nuvarande verksamhet.',
      warning:
        'Utbildning som ger dig förutsättningar att starta en ny verksamhet eller arbeta inom ett nytt område är normalt inte avdragsgill som fortbildning. Kontrollera därför syftet med utbildningen innan du bokför den.',
    },
  },
  {
    id: 'prenumerationer',
    name: 'Prenumerationer & programvaror',
    debit_account: '5420',
    credit_account: '1930',
    default_vat_rate: 25,
    comment: 'T.ex. Adobe och andra programvaror/SaaS',
    seedDefault: true,
  },

  // OBS: Blandar idag VAD som köpts med HUR det betalats.
  // Behålls oförändrad tills VAD/HUR-frågan hanteras separat.
  {
    id: 'privat_utlägg',
    name: 'Privat utlägg för firman',
    debit_account: '5410',
    credit_account: '2018',
    default_vat_rate: 25,
    comment: 'När du privat har betalat ett inköp som hör till firman',
    seedDefault: true,
  },

  {
    id: 'resor',
    name: 'Resor',
    debit_account: '5800',
    credit_account: '1930',
    default_vat_rate: 6,
    comment:
      'T.ex. tåg, kollektivtrafik och taxi – kontrollera momsen på underlaget',
    seedDefault: true,
  },

  // Teknisk kategori som används av SoloLedgers periodiseringsflöde.
  {
    id: 'periodisering',
    name: 'Förutbetalda kostnader',
    debit_account: '1790',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'Används automatiskt av SoloLedger vid periodisering över årsskifte',
    seedDefault: true,
  },
  {
    id: 'skattekonto_default',
    name: 'Skatter & avgifter (eget uttag)',
    debit_account: '2012',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'När firmans pengar används för ägarens F-skatt och andra privata skatter/avgifter',
    seedDefault: true,
  },

  // Nuvarande snabbförslag i Kontoplan.
  {
    id: 'lokalhyra',
    name: 'Hyra för verksamhetslokal',
    debit_account: '5010',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'Hyra för separat kontor, studio, lager eller annan verksamhetslokal - inte vanligt hemmakontor',
    quickSuggestion: true,
  },
  {
    id: 'el-lokal',
    name: 'El för verksamhetslokal',
    debit_account: '5020',
    credit_account: '1930',
    default_vat_rate: 25,
    comment:
      'El för separat verksamhetslokal - inte vanlig hushållsel i bostaden',
    quickSuggestion: true,
  },
  {
    id: 'reklam',
    name: 'Reklam & Annonsering',
    debit_account: '5900',
    credit_account: '1930',
    default_vat_rate: 25,
    comment: 'Google Ads, Meta-annonser, trycksaker',
    quickSuggestion: true,
  },
  {
    id: 'frakt',
    name: 'Frakt & transporter',
    debit_account: '5710',
    credit_account: '1930',
    default_vat_rate: 25,
    comment: 'Frakt och transporter av varor i verksamheten',
    quickSuggestion: true,
  },
  {
    id: 'forsakring',
    name: 'Företagsförsäkring',
    debit_account: '6310',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: 'Ansvars- och sakförsäkring för firman',
    quickSuggestion: true,
  },
  {
    id: 'milersattning',
    name: 'Egen bil i verksamheten',
    debit_account: '5843',
    credit_account: '2018',
    default_vat_rate: 0,
    comment:
      'Privat bil som används för resor i verksamheten - 25 kr/mil. Gäller inte vanliga resor mellan bostad och verksamhetslokal',
    quickSuggestion: true,
  },
]

/**
 * Kuraterad BAS-hjälp för konton SoloLedger använder eller behöver
 * kunna förklara. Detta är medvetet inte en full BAS-kontoplan.
 *
 * Denna tabell är endast för kontonamn/förklaring.
 * Resultat- och NE-klassificering hör fortfarande hemma i resultEngine.ts.
 */
export const BAS_ACCOUNT_HELP: Record<string, string> = {
  '1790': 'Övriga förutbetalda kostnader och upplupna intäkter',
  '1930': 'Företagskonto / checkkonto / affärskonto',
  '2010': 'Eget kapital',
  '2011': 'Egna varuuttag',
  '2012': 'Avräkning för skatter och avgifter',
  '2013': 'Övriga egna uttag',
  '2014': 'Uttag förmåner',
  '2017': 'Egna insättningar / årets kapitaltillskott',
  '2018': 'Övriga egna insättningar',
  '2019': 'Årets resultat',
  '2611': 'Utgående moms 25 %',
  '2621': 'Utgående moms 12 %',
  '2631': 'Utgående moms 6 %',
  '2641': 'Debiterad ingående moms',
  '2650': 'Redovisningskonto för moms',
  '3010': 'Försäljning',
  '4010': 'Inköp av varor och material',
  '4600': 'Legoarbeten och underentreprenader',
  '5010': 'Lokalhyra',
  '5020': 'El för belysning',
  '5410': 'Förbrukningsinventarier',
  '5420': 'Programvaror',
  '5710': 'Frakter och transporter',
  '5800': 'Resekostnader',
  '5843': 'Bilersättning, skattefri',
  '5900': 'Reklam och PR',
  '5910': 'Annonsering',
  '6110': 'Kontorsmateriel',
  '6212': 'Mobiltelefon',
  '6230': 'Datakommunikation',
  '6250': 'Postbefordran',
  '6310': 'Företagsförsäkringar',
  '6530': 'Redovisningstjänster',
  '6540': 'IT-tjänster',
  '6550': 'Konsultarvoden',
  '6570': 'Bankkostnader',
  '6991': 'Övriga externa kostnader',
  '6992': 'Övriga externa kostnader, ej avdragsgilla',
  '7830': 'Avskrivningar på maskiner och inventarier',
}

export function getBasAccountHelp(accountNumber: string) {
  const nr = accountNumber.trim()
  return BAS_ACCOUNT_HELP[nr] ?? null
}

/**
 * Legacy-helper.
 * Används fortfarande av setupDefaultAccounts.
 */
export function getDefaultAccountPresets() {
  return ACCOUNT_PRESETS.filter(preset => preset.seedDefault)
}

/**
 * Legacy-helper.
 * Används fortfarande av nuvarande Kontoplan.
 */
export function getQuickAccountSuggestions() {
  return ACCOUNT_PRESETS.filter(preset => preset.quickSuggestion)
}

/**
 * Grundkontoplan v1-helpers.
 *
 * Dessa används inte av nuvarande UI ännu men ger nästa steg en tydlig,
 * typad ingång till den nya kunskapsmodellen.
 */
export function getDefaultBookingCategories() {
  return BOOKING_CATEGORIES.filter(
    category => category.availability === 'default'
  )
}

export function getQuickBookingCategories() {
  return BOOKING_CATEGORIES.filter(
    category => category.availability === 'quick'
  )
}

export function getGuidedBookingCategories() {
  return BOOKING_CATEGORIES.filter(
    category => category.availability === 'guided'
  )
}

export function getBookingCategory(id: string) {
  return BOOKING_CATEGORIES.find(category => category.id === id) ?? null
}