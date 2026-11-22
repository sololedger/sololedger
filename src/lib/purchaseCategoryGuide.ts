import {
  ACCOUNT_PRESETS,
  bookingCategoryToAccountPreset,
  getBookingCategory,
} from './accountingKnowledge.ts'
import { newBookingCategoryError, type BookingCategoryVisibility } from './bookingCategoryVisibility.ts'

export interface GuideCategory extends BookingCategoryVisibility {
  name: string
  debit_account?: string | null
  credit_account?: string | null
  default_vat_rate?: number | string | null
}

const softwareProducts = [
  'adobe creative cloud', 'creative cloud', 'adobe cc', 'adobe lightroom', 'lightroom', 'adobe photoshop',
  'photoshop', 'capture one', 'davinci resolve', 'adobe premiere pro', 'premiere pro',
]
const equipmentAccessories = ['batteri', 'batteriet', 'batterier', 'kamerabatteri', 'kamerabatteriet', 'minneskort', 'minneskortet', 'sd kort']
const reusableOrConsumable = [...equipmentAccessories, 'fotobakgrund', 'fotobakgrunden', 'fotobakgrunder']
const displays = ['bildskärm', 'bildskärmen', 'bildskärmar', 'datorskärm', 'datorskärmen', 'monitor', 'monitorn', 'monitorer']
const equipmentHosts = ['kamera', 'kameran', 'kamerahus', 'kamerahuset', 'systemkamera', 'systemkameran',
  'dator', 'datorn', 'borrmaskin', 'borrmaskinen']
const equipmentItems = [...equipmentHosts, ...displays, 'objektiv', 'objektivet', 'kameraobjektiv', 'stativ', 'stativet',
  'kamerastativ', 'blixt', 'blixten', 'blixtar', 'kamerablixt', 'studioblixt', 'studioblixten']

const topics = [
  {
    id: 'kurser',
    words: ['fotokurs', 'fotokursen', 'fotokurser', 'fotoworkshop', 'ljussättningskurs', 'frisörkurs', 'kursen', 'utbildningen'],
    question: 'Är kursen fortbildning för verksamheten du redan bedriver, utan att du startar eller utökar verksamheten?',
    clarify: 'Kontrollera vad kursen ska användas till. En utbildning för att starta eller utöka verksamheten behöver en annan bedömning.',
  },
  {
    id: 'programvaror',
    words: [
      ...softwareProducts, 'bildredigeringsprogram', 'redigeringsprogram',
      'program', 'programvaran', 'programvarulicens', 'programlicens', 'bokföringsprogram', 'bokföringsprogrammet', 'program för bokföring',
      'programvaruabonnemang', 'programvaruprenumeration',
    ],
    question: 'Gäller betalningen en programvara, en programvarulicens eller en prenumeration på ett digitalt verktyg?',
    clarify: 'Kontrollera om fakturan gäller en programvara, en annan prenumeration eller en köpt IT-tjänst som support eller tekniskt arbete.',
  },
  {
    id: 'varor_material',
    words: ['hårfärg', 'virke', 'virket', 'målarfärg', 'kakel', 'schampo', 'fotopapper', 'fotopappret', 'fotopapperet', 'papper för fotoutskrift'],
    question: 'Ska du sälja varan vidare eller använda materialet direkt i det kunden köper?',
    clarify: 'Ta reda på om materialet säljs vidare, ingår i en kundleverans eller används i verksamheten på annat sätt.',
  },
  {
    id: 'lokalhyra',
    words: ['salongshyra', 'fotostudio', 'fotostudion', 'studiohyra', 'studiohyran', 'verkstadshyra', 'hyrde studio', 'hyran för studion'],
    question: 'Gäller hyran en separat verksamhetslokal utanför din bostad?',
    clarify: 'Kontrollera vilken lokal hyran gäller. En arbetsplats i den privata bostaden behöver en särskild bedömning.',
  },
  {
    id: 'kontorsmaterial',
    words: ['skrivarpapper', 'kopieringspapper', 'pennor', 'kontorspapper', 'kontorsmaterialet'],
    question: 'Är det material som går åt i det vanliga kontorsarbetet?',
    clarify: 'Kontrollera om köpet gäller kontorsmaterial, utrustning eller material som ingår i en kundleverans.',
  },
  {
    id: 'redovisningstjanster',
    words: ['bokföringshjälp', 'bokföringsbyrå', 'bokföringsbyrån', 'hjälp med bokföringen', 'hjälp med bokslutet', 'bokföraren'],
    question: 'Har du betalat för hjälp med företagets bokföring, bokslut eller deklaration?',
    clarify: 'Kontrollera om du betalat för hjälp med redovisningen eller för ett bokföringsprogram.',
  },
  {
    id: 'inventarier',
    words: [...equipmentItems, ...reusableOrConsumable, 'kameror', 'mikrofon', 'mikrofonen', 'hårfön', 'sax', 'utrustning'],
    question: 'Har du köpt utrustningen för att använda den i verksamheten, utan att hyra den eller sälja den vidare?',
    clarify: 'Kontrollera om det gäller köp av utrustning till verksamheten, hyra eller en vara för vidareförsäljning.',
  },
  {
    id: 'reklam',
    words: ['annonser', 'annonsen', 'annonser på meta', 'annons på meta', 'annonser på google', 'annons på google', 'meta annonser', 'meta annons', 'meta annonsering', 'google annonser', 'reklamkampanj'],
    question: 'Gäller kostnaden annonser eller reklam för att marknadsföra den egna verksamheten?',
    clarify: 'Kontrollera om du har köpt annonsutrymme eller reklam för verksamheten. Andra marknadsföringskostnader kan behöva bedömas separat.',
  },
  {
    id: 'kopta_tjanster_kunduppdrag',
    words: ['extern retusch', 'extern retuschör', 'retusch', 'retuschör', 'extern bildretusch', 'extern videoredigering', 'hjälp med retusch'],
    question: 'Har du köpt en tjänst som är en direkt del av det du levererar i ett specifikt kunduppdrag?',
    clarify: 'Kontrollera om tjänsten utfördes för kundens uppdrag eller var ett allmänt stöd till ditt eget företag.',
  },
  {
    id: 'frakt',
    words: ['fraktkostnad', 'frakten', 'budfrakt', 'fotoboksfrakt', 'fotoboksleverans', 'fotoboksleveranser', 'frakt av fotobok', 'frakt av fotoböcker', 'leverans av fotoböcker'],
    question: 'Gäller kostnaden frakt eller transport av själva varan, och är den skild från varans pris och från brevporto?',
    clarify: 'Kontrollera om avgiften gäller varufrakt, brevporto eller själva varan som levereras.',
  },
  {
    id: 'porto',
    words: ['brevporto', 'frimärken', 'portot', 'brevutskick', 'portokostnad', 'postporto', 'porto för brev'],
    question: 'Gäller kostnaden porto eller en posttjänst, till exempel frimärken för brev?',
    clarify: 'Kontrollera vilken avgift som står på underlaget. Om det gäller transport av varor behöver du skilja den från brevporto.',
  },
  {
    id: 'resor',
    words: ['tågbiljett', 'taxiresa', 'bussbiljett', 'flygbiljett', 'tåget', 'taxin', 'resa till kunduppdrag', 'tåg till kunduppdrag'],
    question: 'Gäller kostnaden en resa i företagets arbete, till exempel till en kund, utan att det är pendling eller resa med egen bil?',
    clarify: 'Kontrollera resans syfte. Resor mellan bostaden och verksamhetslokalen och resor med egen bil behöver bedömas separat.',
  },
  {
    id: 'foretagsforsakring',
    words: ['företagsförsäkringen', 'försäkringspremie', 'ansvarsförsäkringen', 'utrustningsförsäkring', 'försäkring för kamerautrustning'],
    question: 'Är försäkringen tecknad för verksamheten, till exempel för firmans utrustning eller ansvar?',
    clarify: 'Kontrollera försäkringsbrevet och vad försäkringen täcker. Om den gäller privat eller blandad användning behöver du kontrollera kostnaden separat.',
  },
  {
    id: 'mobiltelefoni',
    words: [
      'mobilabonnemanget', 'telefonabonnemang', 'mobilfaktura', 'telefonitjänst', 'mobilräkning',
    ],
    question: 'Gäller kostnaden själva telefonitjänsten eller mobilabonnemanget för verksamheten?',
    clarify: 'Kontrollera om fakturan gäller abonnemanget, själva telefonen eller en kombination av båda.',
  },
  {
    id: 'internet',
    words: [
      'webbuppkoppling', 'internetuppkoppling', 'internetabonnemang', 'bredbandsabonnemang', 'bredbandsabonnemanget',
      'bredbandet', 'internetanslutning',
    ],
    question: 'Gäller kostnaden en internetanslutning eller datakommunikation för verksamheten?',
    clarify: 'Kontrollera om kostnaden gäller uppkopplingen, utrustning eller en annan digital tjänst. En uppkoppling som också används privat behöver bedömas separat.',
  },
  {
    id: 'bankavgift',
    words: ['bankavgiften', 'kontoavgift', 'bankens kontoavgift', 'betalningsavgift', 'transaktionsavgift', 'avgift för betaltjänst', 'avgift från banken'],
    question: 'Är det en avgift som banken eller en betaltjänst tar ut för en tjänst som hör till verksamheten?',
    clarify: 'Kontrollera specifikationen. Ränta, amortering och det underliggande inköpet är andra typer av betalningar.',
  },
] as const

function normalize(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('sv-SE').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function findPurchaseGuideReferral(query: string) {
  // Recognize complete descriptions of other bookkeeping events. A tax or
  // payment word inside a purchase description is not enough to redirect it.
  const description = normalize(query)
  if (/^(?:jag |vi )?(?:har )?(?:förde över|fört över|överfört|överföring|betalat in|inbetalning)(?: pengar)?(?: från (?:företagskontot|banken))? till skattekontot$/.test(description)) {
    return { articleId: 'skattekonto', message: 'Kontrollera bankraden under Pengar till/från skattekontot i Moms. En överföring visar inte att momsen har dragits.' }
  }
  if (/^(?:skatteverket har dragit moms(?:en)?(?: från skattekontot)?|moms(?:en)? (?:har )?(?:dragits|debiterats) på skattekontot|(?:debiterad moms|momsdebitering) på skattekontot)$/.test(description)) {
    return { articleId: 'skattekonto', message: 'Jämför momsraden i skattekontots historik med Avräkning på skattekontot i Moms.' }
  }
  if (/^(?:momsbetalning|betala moms(?:en)?|(?:(?:jag |vi )?(?:har )?)?betalat moms(?:en)?(?: till (?:skatteverket|skattekontot))?)$/.test(description)) {
    return { articleId: 'skattekonto', additionalArticleId: 'moms-redovisa-betala', message: 'Kontrollera om pengarna fördes över från banken eller om Skatteverket drog momsen på skattekontot. I Moms finns ett eget flöde för varje händelse.' }
  }
  if (/^(?:(?:betalat|betala) )?(?:preliminärskatt|f skatt)$/.test(description)) {
    return { articleId: 'skatt-forsta-aret', message: 'Jämför betalningen med skattebeslutet och skattekontots historik.' }
  }
  if (/^(?:eget uttag|egen insättning|privat uttag)$/.test(description)) {
    return { articleId: 'intakt-insattning', message: 'Läs hur du skiljer överföringar mellan dig och firman från företagets inköp och försäljning.' }
  }
  if (/^(?:privat utlägg|privat betalt företagsinköp|(?:företagsinköp|inköp (?:för|till) (?:firman|företaget)) betalt privat|betalat företagsinköp privat)$/.test(description)) {
    return { articleId: 'privat-betalning', message: 'Läs vilka inköpsflöden som stöder privat betalning och hur du granskar betalningskällan.' }
  }
  return null
}

const purchasePrefix = /^(?:(?:jag|vi) )?(?:(?:har )?(?:köpte(?: in)?|köpt(?: in)?|betalade(?: för)?|betalat(?: för)?|hyrde|förnyade|beställde|inköp av|köp av) )?/
const itemQualifiers = /^(?:(?:en|ett|min|mitt|ny|nytt|nya|begagnad|begagnat)(?: |$))*$/
const simpleContext = /^(?:i|inom|om|för|till|på)(?: (?:en|ett|min|mitt|den|det|ny|nytt|nya|digital|digitalt|digitala|egen|eget|egna))* \p{L}[\p{L}\p{N}]*$/u
const separateItems = /[;,/&+\r\n]|[.!?]\s*[\p{L}\p{N}]|\s[-–—]\s/u
const uncertainContext = / (?:i|inom|om|för|till|på|och|samt|eller|plus|med|också|dessutom|inklusive|inkl|köpte|köpt|betalade|betalat|beställde|beställt|förutom|inte|ingen|inget|utan)(?: |$)/u
// These catalog keywords describe the context or a possible piece of equipment.
const contextKeywords = new Set(['kunduppdrag', 'mobil', 'telefon', 'bank', 'betaltjänst'])
const itServiceKeywords = (getBookingCategory('it_tjanster')?.keywords ?? []).map(normalize)
const genericSubscriptionKeywords = new Set(['abonnemang', 'prenumeration'])
const subscriptionSubjects: Partial<Record<string, string[]>> = {
  programvaror: [...softwareProducts, 'programvara', 'mjukvara', 'bildredigeringsprogram', 'bokföringsprogram'],
  mobiltelefoni: ['mobil', 'telefon', 'mobiltelefon'],
  internet: ['bredband', 'internet', 'webbuppkoppling'],
}

function subscriptionPhrases(subject: string) {
  return [...genericSubscriptionKeywords].flatMap(word => [
    `${subject} ${word}`, `${word} på ${subject}`, `${word} för ${subject}`,
  ])
}

const searchTopics = topics.map(topic => {
  const keywords = getBookingCategory(topic.id)?.keywords?.filter(word => !contextKeywords.has(word)) ?? []
  const subscriptions = (subscriptionSubjects[topic.id] ?? []).flatMap(subscriptionPhrases)
  return { topic, words: [...new Set([...topic.words, ...keywords, ...subscriptions].map(normalize))] }
})

const spellingTerms = ['kontorsmaterial', 'minneskort', 'bildskärm', 'fotobakgrund', 'mobilabonnemang']

function suggestSpelling(word: string) {
  // Suggest only for a standalone word with one unambiguous single-letter edit.
  if (!/^\p{L}{8,}$/u.test(word)) return null
  const candidates = spellingTerms.filter(term => {
    const [shorter, longer] = word.length <= term.length ? [word, term] : [term, word]
    if (longer.length - shorter.length > 1 || shorter === longer) return false
    let index = 0
    while (index < shorter.length && shorter[index] === longer[index]) index++
    return shorter.slice(index + (shorter.length === longer.length ? 1 : 0)) === longer.slice(index + 1)
  })
  return candidates.length === 1 ? candidates[0] : null
}

type PurchaseDescription = {
  matches: (typeof topics)[number][]
  partial: boolean
  equipmentCheck?: 'reuse' | 'together'
  spellingSuggestion?: string | null
}

export function analyzePurchaseDescription(query: string): PurchaseDescription {
  const normalized = ` ${normalize(query)} `
  const hits = searchTopics.flatMap(({ topic, words }) =>
    words.flatMap(word => {
      const phrase = ` ${word} `
      const hits = []
      for (let start = normalized.indexOf(phrase); start !== -1; start = normalized.indexOf(phrase, start + 1)) {
        hits.push({ topic, word, start, end: start + phrase.length })
      }
      return hits
    }),
  )

  // A phrase can explain a shorter hit inside it. Separate hits may describe
  // separate purchases and must remain visible as an ambiguity.
  const strongest = hits.filter(hit => !hits.some(other =>
    other.start <= hit.start && other.end >= hit.end &&
    other.end - other.start > hit.end - hit.start
  ))
  const matches = topics.filter(topic => strongest.some(hit => hit.topic === topic))
  if (!matches.length) {
    return { matches, partial: false, spellingSuggestion: suggestSpelling(query.trim().normalize('NFC').toLocaleLowerCase('sv-SE')) }
  }
  if (matches.length !== 1) return { matches, partial: false }
  // A subscription identifies a payment arrangement, not what was purchased.
  // A specific phrase may supersede it through the same containment rule above.
  if (strongest.some(hit => genericSubscriptionKeywords.has(hit.word))) {
    return { matches, partial: true }
  }
  if (matches[0].id === 'programvaror' && itServiceKeywords.some(word => normalized.includes(` ${word} `))) {
    return { matches, partial: true }
  }

  // An identified word only supports a recommendation if the surrounding text
  // reads as purchase wording, context, or a recognized equipment accessory.
  const [first, ...remaining] = strongest.sort((a, b) => a.start - b.start || b.end - a.end)
  const prefix = normalized.slice(0, first.start).trim()
  const prefixWords = prefix ? `${prefix} ` : ''
  if (separateItems.test(query) || !itemQualifiers.test(prefixWords.replace(purchasePrefix, ''))) {
    return { matches, partial: true }
  }

  const [second] = remaining
  if (first.topic.id === 'inventarier' && remaining.length === 1 && !normalized.slice(second.end).trim()) {
    const connector = normalized.slice(first.end, second.start).trim()
    const [relation, ...qualifiers] = connector.split(' ')
    if (itemQualifiers.test(qualifiers.join(' '))) {
      const accessory = reusableOrConsumable.includes(first.word) || displays.includes(first.word)
      if (relation === 'till' && accessory && equipmentHosts.includes(second.word)) {
        return { matches, partial: false, equipmentCheck: 'reuse' }
      }
      if (relation === 'och' && equipmentItems.includes(first.word) && equipmentItems.includes(second.word)) {
        return { matches, partial: false, equipmentCheck: 'together' }
      }
    }
  }

  let end = first.end
  let hasEquipmentParts = false
  for (const hit of remaining) {
    // Match spans include the boundary spaces, so a shared boundary is
    // adjacency. Overlapping words belong to the same recognized phrase.
    if (hit.start >= end - 1) {
      const gap = normalized.slice(end, hit.start).trim()
      if (first.topic.id !== 'inventarier' || !/^med(?: |$)/.test(gap) ||
        !itemQualifiers.test(gap.slice(3).trim())) {
        return { matches, partial: true }
      }
      hasEquipmentParts = true
    }
    end = Math.max(end, hit.end)
  }

  const context = normalized.slice(end).trim()
  const partial = Boolean(context && (!simpleContext.test(context) || uncertainContext.test(context)))
  if (!partial && hasEquipmentParts) return { matches, partial: false, equipmentCheck: 'together' }
  if (!partial && strongest.some(hit => reusableOrConsumable.includes(hit.word))) {
    return { matches, partial: false, equipmentCheck: 'reuse' }
  }
  return { matches, partial }
}

export function getGuideCategoryAvailability(
  topicId: string,
  categories: readonly GuideCategory[],
  ready: boolean,
) {
  const guidance = getBookingCategory(topicId)
  const preset = guidance && bookingCategoryToAccountPreset(guidance)
  if (!ready) return { status: 'loading' } as const
  if (!preset) return { status: 'missing' } as const

  const legacyId = topicId === 'programvaror' ? 'prenumerationer'
    : topicId === 'foretagsforsakring' ? 'forsakring' : topicId
  const legacy = ACCOUNT_PRESETS.find(item =>
    item.id === legacyId && item.debit_account === preset.debit_account &&
    item.credit_account === preset.credit_account && item.default_vat_rate === preset.default_vat_rate
  )
  for (const expected of [preset, legacy]) {
    if (!expected || newBookingCategoryError(categories, expected.id, ready)) continue
    const category = categories.find(item => item.id === expected.id)
    const rate = category?.default_vat_rate
    if (
      category?.name === expected.name &&
      category.debit_account === expected.debit_account &&
      category.credit_account === expected.credit_account &&
      rate != null && String(rate).trim() !== '' && Number(rate) === expected.default_vat_rate
    ) {
      return { status: 'available', selection: { category, guidance, account: expected.debit_account } } as const
    }
  }

  const existing = categories.find(category => category.id === preset.id)
    ?? categories.find(category => category.id === legacyId)
  if (!existing) return { status: 'missing' } as const
  if (existing.hidden_from_new_booking === true) return { status: 'hidden' } as const
  if (existing.hidden_from_new_booking !== false) return { status: 'visibility-unknown' } as const
  return { status: 'modified' } as const
}

export function findGuideCategory(topicId: string, categories: readonly GuideCategory[], ready: boolean) {
  const availability = getGuideCategoryAvailability(topicId, categories, ready)
  return availability.status === 'available' ? availability.selection : null
}
