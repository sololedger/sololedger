import { useEffect, useRef, useState } from 'react'
import { getBookingCategory } from '@/lib/accountingKnowledge'
import { findHelpArticle, findHelpSearchContext } from '@/lib/helpContent'
import { purchaseGuideHelpUrl } from '@/lib/helpNavigation'
import { analyzePurchaseDescription, findGuideCategory, findPurchaseGuideReferral, getGuideCategoryAvailability, type GuideCategory } from '@/lib/purchaseCategoryGuide'

type Step = 'search' | 'analysis' | 'use' | 'seller' | 'purpose' | 'equipment-check' | 'rent-vat' | 'payment' | 'result'
type Result = 'mixed' | 'use-unknown' | 'seller-unknown' | 'foreign' |
  'purpose-uncertain' | 'equipment-uncertain' | 'equipment' | 'private-payment-uncertain' | 'payment-uncertain' |
  'rent-vat-review' | 'unavailable' | 'category' | 'withdrawal'
type Stage =
  | { step: Exclude<Step, 'result'>; privatePurchase?: boolean }
  | { step: 'result'; result: Result }

interface Props {
  categories: readonly GuideCategory[]
  ready: boolean
  getVatChange: (id: string) => string | null
  onChooseCategory: (id: string) => void
  onOpenForeignPurchase: () => void
  onOpenFixedAssets: () => void
  onOpenChart: () => void
}

const answerClass = 'min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left font-medium hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'
const actionClass = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'

export default function PurchaseCategoryGuide({
  categories, ready, getVatChange, onChooseCategory, onOpenForeignPurchase, onOpenFixedAssets, onOpenChart,
}: Props) {
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<{ stage: Stage; answer?: string }[]>([])
  const stage: Stage = history.at(-1)?.stage ?? { step: 'search' }
  const { step } = stage
  const { matches, partial, equipmentCheck, spellingSuggestion } = analyzePurchaseDescription(query)
  const referral = findPurchaseGuideReferral(query)
  const helpContext = !referral && matches.length === 0 ? findHelpSearchContext(query) : undefined
  const helpArticleIds = referral ? [referral.articleId, referral.additionalArticleId] : helpContext?.articleIds
  const topic = matches.length === 1 && !partial ? matches[0] : null
  const availability = topic && topic.id !== 'inventarier' ? getGuideCategoryAvailability(topic.id, categories, ready) : null
  const topicSelection = availability?.status === 'available' ? availability.selection : null
  const result = stage.step === 'result' ? stage.result : null
  const categoryConflict = availability?.status === 'conflict'
  const selection = categoryConflict ? null : result === 'withdrawal'
    ? findGuideCategory('eget_uttag', categories, ready)
    : result === 'category' ? topicSelection : null
  const vatChange = selection && getVatChange(selection.category.id)

  useEffect(() => {
    if (!details.current?.open) return
    if (step === 'search') search.current?.focus()
    else heading.current?.focus()
  }, [step])

  function advance(next: Stage, answer?: string) {
    setHistory(previous => [...previous, { stage: next, answer }])
  }

  function finish(result: Result, answer: string) {
    advance({ step: 'result', result }, answer)
  }

  function reset() {
    setQuery('')
    setHistory([])
  }

  function close(restoreFocus = true) {
    if (details.current) details.current.open = false
    reset()
    if (restoreFocus) summary.current?.focus()
  }

  const bankQuestion = 'Drogs pengarna direkt från företagets bankkonto?'
  const equipmentClarification = equipmentCheck === 'together'
    ? 'Om det är separata köp, beskriv ett i taget. Kontrollera underlaget om du är osäker.'
    : 'Kontrollera om det du köpte går åt, ingår i en kundleverans eller ska användas flera gånger. Guiden lämnar inget kategoriförslag här.'
  let question = ''
  let answers: { label: string; choose: () => void }[] = []
  if (step === 'use') {
    question = 'Vad ska köpet användas till?'
    answers = [
      { label: 'Enbart i verksamheten', choose: () => advance({ step: 'seller' }, 'Verksamheten') },
      { label: 'Enbart privat', choose: () => advance({ step: 'payment', privatePurchase: true }, 'Privat') },
      { label: 'Både privat och i verksamheten', choose: () => finish('mixed', 'Blandad användning') },
      { label: 'Jag vet inte', choose: () => finish('use-unknown', 'Okänd användning') },
    ]
  } else if (step === 'seller') {
    question = 'Visar fakturan eller kvittot att säljaren finns i Sverige?'
    answers = [
      { label: 'Ja, i Sverige', choose: () => advance({ step: 'purpose' }, 'Svensk säljare') },
      { label: 'Nej, utomlands', choose: () => finish('foreign', 'Utländsk säljare') },
      { label: 'Jag vet inte', choose: () => finish('seller-unknown', 'Okänd säljare') },
    ]
  } else if (step === 'purpose' && topic) {
    question = topic.question
    answers = [
      { label: 'Ja', choose: () => {
        if (topic.id === 'inventarier' && equipmentCheck) advance({ step: 'equipment-check' }, 'Köpt för verksamheten')
        else if (topic.id === 'inventarier') finish('equipment', 'Köpt för verksamheten')
        else if (topicSelection) advance({ step: topic.id === 'lokalhyra' ? 'rent-vat' : 'payment' }, 'Ändamål bekräftat')
        else finish('unavailable', 'Ändamål bekräftat')
      } },
      { label: 'Nej', choose: () => finish('purpose-uncertain', 'Annat ändamål') },
      { label: 'Jag vet inte', choose: () => finish('purpose-uncertain', 'Okänt ändamål') },
    ]
  } else if (step === 'equipment-check') {
    const together = equipmentCheck === 'together'
    question = together
      ? 'Köptes delarna tillsammans för att användas som en utrustning?'
      : 'Ska föremålet användas flera gånger utan att förbrukas eller lämnas till kunden?'
    answers = [
      { label: 'Ja', choose: () => finish('equipment', together ? 'Delarna hör ihop' : 'Används flera gånger') },
      { label: 'Nej', choose: () => finish('equipment-uncertain', together ? 'Separata inköp' : 'Används inte flera gånger') },
      { label: 'Jag vet inte', choose: () => finish('equipment-uncertain', 'Behöver kontrolleras') },
    ]
  } else if (step === 'rent-vat') {
    question = 'Visar hyresavin eller fakturan att hyran är utan moms?'
    answers = [
      { label: 'Ja, hyran är utan moms', choose: () => advance({ step: 'payment' }, 'Hyra utan moms') },
      { label: 'Nej, moms står på underlaget', choose: () => finish('rent-vat-review', 'Moms på underlaget') },
      { label: 'Jag vet inte', choose: () => finish('rent-vat-review', 'Okänd moms') },
    ]
  } else if (stage.step === 'payment') {
    const privatePurchase = stage.privatePurchase
    question = bankQuestion
    answers = [
      { label: 'Ja', choose: () => finish(privatePurchase ? 'withdrawal' : 'category', 'Företagets bankkonto') },
      { label: 'Nej', choose: () => finish(privatePurchase ? 'private-payment-uncertain' : 'payment-uncertain', 'Annan betalning') },
      { label: 'Jag vet inte', choose: () => finish(privatePurchase ? 'private-payment-uncertain' : 'payment-uncertain', 'Okänd betalning') },
    ]
  }

  const availabilityMessages = {
    missing: 'Standardkategorin saknas i din kontoplan. Kontrollera om den finns som snabbförslag i Kontoplan.',
    hidden: 'Kategorin är dold för ny bokföring. Du kan granska synligheten i Kontoplan.',
    modified: 'Kategorin avviker från standardinställningarna för namn, konto eller moms. Granska den i Kontoplan.',
    conflict: 'Både den aktuella och den äldre kategorin finns i Kontoplan, men guiden kunde inte verifiera dem som likvärdiga. Granska kategoriernas synlighet, namn, konton och moms där.',
    loading: 'Kontoplanen är inte färdigladdad. Vänta tills den har laddats innan du väljer kategori.',
    'visibility-unknown': 'Kategorins synlighet kunde inte kontrolleras. Läs in kontoplanen igen.',
  }
  const availabilityMessage = availability && availability.status !== 'available' ? availabilityMessages[availability.status] : null
  const unavailable = availabilityMessage ?? 'En matchande standardkategori är inte tillgänglig för ny bokföring.'
  const shippingOrPostage = matches.length === 2 &&
    matches.some(match => match.id === 'frakt') && matches.some(match => match.id === 'porto')
  const clarification = shippingOrPostage
    ? 'Kontrollera om avgiften gäller varufrakt eller brevporto. Om båda ingår, beskriv ett inköp i taget.'
    : matches.length > 1
      ? 'Flera typer av köp matchar. Beskriv ett inköp i taget, till exempel ”kurs i fotografering” eller ”frakt till kund”.'
      : partial
        ? 'Bara en del av beskrivningen matchar. Beskriv ett inköp i taget, till exempel ”abonnemang på Lightroom”.'
        : 'Guiden hittade ingen inköpstyp. Prova vad som står på underlaget, till exempel ”stativ” eller ”kontorsmaterial”.'
  const analysisHeading = helpArticleIds ? 'Annat bokföringsärende'
    : topic ? getBookingCategory(topic.id)?.name : 'Förtydliga vad du köpte'
  const messages: Record<Result, string> = {
    mixed: 'Ta reda på hur köpet ska användas privat och i verksamheten innan du väljer kategori.',
    'use-unknown': 'Kontrollera om köpet hör till verksamheten, är privat eller används till båda.',
    'seller-unknown': 'Kontrollera på underlaget vem som faktiskt sålde varan eller tjänsten och vilket land säljaren finns i.',
    foreign: 'Kontrollera säljarens land, vad du köpt och om säljaren debiterat moms. Gå vidare till den befintliga kontrollen för utlandsinköp.',
    'purpose-uncertain': topic?.clarify ?? '',
    'equipment-uncertain': equipmentClarification,
    equipment: 'I Inventarier bedöms om köpet ska kostnadsföras direkt eller bokföras som tillgång. Ta fram pris, beräknad livslängd och uppgifter om utrustning som används tillsammans.',
    'private-payment-uncertain': 'Kontrollera vem som betalade och vilket konto som belastades. Eget uttag är aktuellt när verksamhetens pengar användes till det privata köpet.',
    'payment-uncertain': 'Kontrollera hur köpet betalades. Om du betalade med privata pengar behöver betalningen hanteras som ett privat utlägg för verksamheten.',
    'rent-vat-review': 'Kontrollera hyresavin eller fakturan och rätten till momsavdrag. Guiden lämnar inget förslag med standardmomsen 0 % när moms anges eller underlaget är oklart.',
    unavailable,
    category: selection?.guidance.categoryGuidance.summary ?? unavailable,
    withdrawal: selection?.guidance.categoryGuidance.summary ?? 'Kategorin Eget uttag är inte tillgänglig för ny bokföring. Kontrollera den i Kontoplan.',
  }

  return (
    <details ref={details} className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4"
      onToggle={event => {
        if (event.currentTarget.open) search.current?.focus()
        else reset()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && details.current?.open) {
          event.preventDefault()
          close()
        }
      }}>
      <summary ref={summary} className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-gray-900">
        Hjälp mig välja kategori
      </summary>
      <div className="max-w-xl space-y-3 pb-4 text-sm text-gray-800">
        {step === 'search' ? (
          <form className="space-y-3" onSubmit={event => {
            event.preventDefault()
            if (query.trim()) advance({ step: 'analysis' })
          }}>
            <label className="block font-medium">
              Vad har du köpt eller betalat?
              <input
                ref={search}
                type="text"
                value={query}
                maxLength={160}
                onChange={event => setQuery(event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                placeholder="Till exempel Meta-annonser, extern retusch eller frakt"
              />
            </label>
            <button type="submit" className={actionClass} disabled={!query.trim()}>Sök</button>
            <a href="?help=" target="_blank" rel="noopener noreferrer"
              className="ml-3 inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">
              Sök bokföringshjälp<span className="sr-only"> (öppnas i ny flik)</span>
            </a>
          </form>
        ) : (
          <>
            <p className="break-words text-xs text-gray-600" aria-label="Dina svar">
              {query}{history.map(entry => entry.answer && ` · ${entry.answer}`)}
            </p>
            <h3 ref={heading} tabIndex={-1} className="font-semibold">
              {step === 'analysis' ? analysisHeading : question || (selection ? 'Förslag på kategori' : 'Så går du vidare')}
            </h3>
            {answers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {answers.map(answer => (
                  <button key={answer.label} type="button" className={answerClass} onClick={answer.choose}>
                    {answer.label}
                  </button>
                ))}
              </div>
            )}
            {result && <p role="status">{categoryConflict ? availabilityMessages.conflict : messages[result]}</p>}
            {step === 'analysis' && helpArticleIds && (
              <>
                <p role="status">Det här är ett bokföringsärende som hanteras i bokföringshjälpen. {referral?.message ?? helpContext?.message}</p>
                <ul className="space-y-2">
                  {helpArticleIds.flatMap(id => {
                    const article = findHelpArticle(id ?? null)
                    return article ? [<li key={article.id}>
                      <a className="inline-block min-h-11 py-2 font-semibold text-emerald-800 underline"
                        href={purchaseGuideHelpUrl(article.id, query)} target="_blank" rel="noopener noreferrer">
                        {article.title} (ny flik)
                      </a>
                    </li>] : []
                  })}
                </ul>
              </>
            )}
            {step === 'analysis' && !helpArticleIds && (
              <>
                <p role="status">{topic ? availabilityMessage
                  ?? (equipmentCheck ? 'Det kan gälla utrustning. Guiden ställer en extra fråga innan den vägleder vidare.'
                    : 'Guiden känner igen inköpstypen. Svara på några frågor för att få vägledning.')
                  : clarification}</p>
                {topic && !categoryConflict ? (
                  <button type="button" className={actionClass} onClick={() => advance({ step: 'use' })}>Fortsätt till frågorna</button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {spellingSuggestion && (
                      <button type="button" className={answerClass} onClick={() => {
                        setQuery(spellingSuggestion)
                        setHistory([])
                      }}>Menade du {spellingSuggestion}?</button>
                    )}
                    <button type="button" className={actionClass} onClick={() => setHistory([])}>Ändra beskrivningen</button>
                    {matches.length === 0 && !spellingSuggestion && (
                      <button type="button" className={answerClass} onClick={() => advance({ step: 'payment', privatePurchase: true }, 'Privat')}>
                        Det gäller ett helt privat köp
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {result === 'equipment-uncertain' && (
              <button type="button" className={answerClass} onClick={() => setHistory([])}>Ändra beskrivningen</button>
            )}
            {availabilityMessage && availability?.status !== 'loading' && !helpArticleIds &&
              (step === 'analysis' || result === 'unavailable' || categoryConflict) && (
              <button type="button" className={answerClass} onClick={onOpenChart}>Gå till Kontoplan</button>
            )}
            {result === 'foreign' && (
              <button type="button" className={actionClass} onClick={() => {
                close(false)
                onOpenForeignPurchase()
              }}>Öppna Utlandsinköp</button>
            )}
            {result === 'equipment' && (
              <button type="button" className={actionClass} onClick={() => {
                close(false)
                onOpenFixedAssets()
              }}>Gå till Inventarier</button>
            )}
            {selection && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3">
                <p className="font-semibold">{selection.category.name} · konto {selection.account}</p>
                <p>{result === 'withdrawal'
                  ? 'Moms: inget momsavdrag för det privata köpet.'
                  : 'Kontrollera moms och avdragsrätt separat mot underlaget.'}</p>
                {vatChange && <p className="font-medium text-amber-900">{vatChange}</p>}
                <button type="button" className={actionClass} onClick={() => {
                  close(false)
                  onChooseCategory(selection.category.id)
                }}>{vatChange ? 'Bekräfta momsändring och välj' : 'Välj'} {selection.category.name}</button>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {step !== 'search' && (
            <button type="button" className={answerClass} onClick={() => setHistory(previous => previous.slice(0, -1))}>Tillbaka</button>
          )}
          {(step !== 'search' || query) && (
            <button type="button" className={answerClass} onClick={() => {
              reset()
              search.current?.focus()
            }}>Börja om</button>
          )}
          <button type="button" className={answerClass} onClick={() => close()}>Avbryt guiden</button>
        </div>
        {step !== 'search' && <p className="text-xs text-gray-600">
          Tillbaka går ett steg. Börja om rensar sökningen och svaren. Avbryt guiden stänger den.
        </p>}
      </div>
    </details>
  )
}
