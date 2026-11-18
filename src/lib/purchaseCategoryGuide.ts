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
    words: ['fotokurs', 'frisörkurs', 'kursen'],
    question: 'Är kursen fortbildning för verksamheten du redan bedriver, utan att du startar eller utökar verksamheten?',
    clarify: 'Kontrollera vad kursen ska användas till. En utbildning för att starta eller utöka verksamheten behöver en annan bedömning.',
  },
  {
    id: 'programvaror',
    words: ['creative cloud', 'program', 'programvarulicens'],
    question: 'Gäller betalningen en programvara, en programvarulicens eller en prenumeration på ett digitalt verktyg?',
    clarify: 'Kontrollera om fakturan gäller en programvara, en annan prenumeration eller arbete som någon gjort åt dig.',
  },
  {
    id: 'varor_material',
    words: ['hårfärg', 'virke', 'målarfärg', 'kakel', 'schampo', 'fotopapper'],
    question: 'Ska du sälja varan vidare eller använda materialet direkt i det kunden köper?',
    clarify: 'Ta reda på om materialet säljs vidare, ingår i en kundleverans eller används i verksamheten på annat sätt.',
  },
  {
    id: 'lokalhyra',
    words: ['salongshyra', 'fotostudio', 'studiohyra', 'verkstadshyra'],
    question: 'Gäller hyran en separat verksamhetslokal utanför din bostad?',
    clarify: 'Kontrollera vilken lokal hyran gäller. En arbetsplats i den privata bostaden behöver en särskild bedömning.',
  },
  {
    id: 'kontorsmaterial',
    words: ['skrivarpapper', 'pennor'],
    question: 'Är det material som går åt i det vanliga kontorsarbetet?',
    clarify: 'Kontrollera om köpet gäller kontorsmaterial, utrustning eller material som ingår i en kundleverans.',
  },
  {
    id: 'redovisningstjanster',
    words: ['bokföringshjälp', 'bokföringsbyrå'],
    question: 'Har du betalat för hjälp med företagets bokföring, bokslut eller deklaration?',
    clarify: 'Kontrollera om du betalat för hjälp med redovisningen eller för ett bokföringsprogram.',
  },
  {
    id: 'inventarier',
    words: ['objektiv', 'stativ', 'borrmaskin', 'hårfön', 'sax', 'utrustning'],
    question: 'Är det utrustning som ska användas i verksamheten?',
    clarify: 'Kontrollera om du ska använda utrustningen i verksamheten eller om den köptes för att säljas vidare.',
  },
] as const

function normalize(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('sv-SE').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function findPurchaseTopics(query: string) {
  const normalized = ` ${normalize(query)} `
  return topics.filter(topic => {
    const keywords = getBookingCategory(topic.id)?.keywords ?? []
    return [...topic.words, ...keywords].some(word => normalized.includes(` ${normalize(word)} `))
  })
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
