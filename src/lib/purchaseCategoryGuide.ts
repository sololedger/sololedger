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

const topics = [
  {
    id: 'kurser',
    words: ['fotokurs', 'fotokursen', 'fotokurser', 'fotoworkshop', 'ljussättningskurs', 'frisörkurs', 'kursen', 'utbildningen'],
    question: 'Är kursen fortbildning för verksamheten du redan bedriver, utan att du startar eller utökar verksamheten?',
    clarify: 'Kontrollera vad kursen ska användas till. En utbildning för att starta eller utöka verksamheten behöver en annan bedömning.',
  },
  {
    id: 'programvaror',
    words: ['creative cloud', 'adobe cc', 'lightroom', 'photoshop', 'capture one', 'davinci resolve', 'premiere pro', 'bildredigeringsprogram', 'redigeringsprogram', 'program', 'programvaran', 'programvarulicens', 'programlicens', 'bokföringsprogram', 'bokföringsprogrammet', 'program för bokföring'],
    question: 'Gäller betalningen en programvara, en programvarulicens eller en prenumeration på ett digitalt verktyg?',
    clarify: 'Kontrollera om fakturan gäller en programvara, en annan prenumeration eller arbete som någon gjort åt dig.',
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
    words: ['kameran', 'kameror', 'kamerahus', 'kamerahuset', 'systemkamera', 'systemkameran', 'objektiv', 'objektivet', 'kameraobjektiv', 'stativ', 'stativet', 'kamerastativ', 'kamerablixt', 'studioblixt', 'minneskort', 'minneskortet', 'sd-kort', 'kamerabatteri', 'mikrofon', 'mikrofonen', 'borrmaskin', 'hårfön', 'sax', 'utrustning'],
    question: 'Har du köpt utrustningen för att använda den i verksamheten, utan att hyra den eller sälja den vidare?',
    clarify: 'Kontrollera om det gäller köp av utrustning till verksamheten, hyra eller en vara för vidareförsäljning.',
  },
] as const

function normalize(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('sv-SE').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function findPurchaseTopics(query: string) {
  const normalized = ` ${normalize(query)} `
  const hits = topics.flatMap(topic => {
    const keywords = getBookingCategory(topic.id)?.keywords ?? []
    return [...new Set([...topic.words, ...keywords].map(normalize))].flatMap(word => {
      const phrase = ` ${word} `
      const hits = []
      for (let start = normalized.indexOf(phrase); start !== -1; start = normalized.indexOf(phrase, start + 1)) {
        hits.push({ topic, start, end: start + phrase.length })
      }
      return hits
    })
  })

  // A phrase can explain a shorter hit inside it. Separate hits may describe
  // separate purchases and must remain visible as an ambiguity.
  const strongest = hits.filter(hit => !hits.some(other =>
    other.start <= hit.start && other.end >= hit.end &&
    other.end - other.start > hit.end - hit.start
  ))
  return topics.filter(topic => strongest.some(hit => hit.topic === topic))
}

export function findGuideCategory(
  topicId: string,
  categories: readonly GuideCategory[],
  ready: boolean,
) {
  const guidance = getBookingCategory(topicId)
  const preset = guidance && bookingCategoryToAccountPreset(guidance)
  if (!preset) return null

  const legacyId = topicId === 'programvaror' ? 'prenumerationer' : topicId
  const legacy = ACCOUNT_PRESETS.find(item => item.id === legacyId)
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
      return { category, guidance, account: expected.debit_account }
    }
  }
  return null
}
