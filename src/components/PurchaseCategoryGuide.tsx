import { useEffect, useRef, useState } from 'react'
import { analyzePurchaseDescription, findGuideCategory, type GuideCategory } from '@/lib/purchaseCategoryGuide'

type Step = 'search' | 'use' | 'seller' | 'purpose' | 'payment' | 'result'
type Result = 'mixed' | 'use-unknown' | 'seller-unknown' | 'foreign' | 'clarify' |
  'purpose-uncertain' | 'equipment' | 'private-payment-uncertain' | 'payment-uncertain' |
  'unavailable' | 'category' | 'withdrawal'
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
}

const answerClass = 'min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left font-medium hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'
const actionClass = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'

export default function PurchaseCategoryGuide({
  categories, ready, getVatChange, onChooseCategory, onOpenForeignPurchase, onOpenFixedAssets,
}: Props) {
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<{ stage: Stage; answer?: string }[]>([])
  const stage: Stage = history.at(-1)?.stage ?? { step: 'search' }
  const { step } = stage
  const { matches, partial } = analyzePurchaseDescription(query)
  const topic = matches.length === 1 && !partial ? matches[0] : null
  const topicSelection = topic && findGuideCategory(topic.id, categories, ready)
  const result = stage.step === 'result' ? stage.result : null
  const selection = result === 'withdrawal'
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
      { label: 'Ja, i Sverige', choose: () => topic ? advance({ step: 'purpose' }, 'Svensk säljare') : finish('clarify', 'Svensk säljare') },
      { label: 'Nej, utomlands', choose: () => finish('foreign', 'Utländsk säljare') },
      { label: 'Jag vet inte', choose: () => finish('seller-unknown', 'Okänd säljare') },
    ]
  } else if (step === 'purpose' && topic) {
    question = topic.question
    answers = [
      { label: 'Ja', choose: () => {
        if (topic.id === 'inventarier') finish('equipment', 'Köpt för verksamheten')
        else if (topicSelection) advance({ step: 'payment' }, 'Ändamål bekräftat')
        else finish('unavailable', 'Ändamål bekräftat')
      } },
      { label: 'Nej', choose: () => finish('purpose-uncertain', 'Annat ändamål') },
      { label: 'Jag vet inte', choose: () => finish('purpose-uncertain', 'Okänt ändamål') },
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

  const unavailable = ready
    ? 'En matchande standardkategori är inte tillgänglig för ny bokföring. Kontrollera kategorin och dess inställningar i Kontoplan.'
    : 'Kontoplanen är inte färdigladdad. Läs in den igen innan du väljer kategori.'
  const shippingOrPostage = matches.length === 2 &&
    matches.some(match => match.id === 'frakt') && matches.some(match => match.id === 'porto')
  const messages: Record<Result, string> = {
    mixed: 'Ta reda på hur köpet ska användas privat och i verksamheten innan du väljer kategori.',
    'use-unknown': 'Kontrollera om köpet hör till verksamheten, är privat eller används till båda.',
    'seller-unknown': 'Kontrollera på underlaget vem som faktiskt sålde varan eller tjänsten och vilket land säljaren finns i.',
    foreign: 'Kontrollera säljarens land, vad du köpt och om säljaren debiterat moms. Gå vidare till den befintliga kontrollen för utlandsinköp.',
    clarify: shippingOrPostage
      ? 'Kontrollera om avgiften gäller varufrakt eller brevporto. Om båda ingår, beskriv ett inköp i taget.'
      : matches.length > 1
        ? 'Flera typer av köp matchar. Beskriv en sak i taget och vad du ska använda den till.'
        : partial
          ? 'Bara en del av beskrivningen matchar. Förtydliga vad du köpte eller beskriv ett inköp i taget.'
          : 'Förtydliga vad du köpte och vad det används till. Prova ett enklare ord från fakturan eller kvittot.',
    'purpose-uncertain': topic?.clarify ?? '',
    equipment: 'I Inventarier bedöms om köpet ska kostnadsföras direkt eller bokföras som tillgång. Ta fram pris, beräknad livslängd och uppgifter om utrustning som används tillsammans.',
    'private-payment-uncertain': 'Kontrollera vem som betalade och vilket konto som belastades. Eget uttag är aktuellt när verksamhetens pengar användes till det privata köpet.',
    'payment-uncertain': 'Kontrollera hur köpet betalades. Om du betalade med privata pengar behöver betalningen hanteras som ett privat utlägg för verksamheten.',
    unavailable,
    category: selection?.guidance.categoryGuidance.summary ?? unavailable,
    withdrawal: selection?.guidance.categoryGuidance.summary ?? unavailable,
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
            if (query.trim()) advance({ step: 'use' })
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
            <button type="submit" className={actionClass} disabled={!query.trim()}>Fortsätt</button>
          </form>
        ) : (
          <>
            <p className="break-words text-xs text-gray-600" aria-label="Dina svar">
              {query}{history.map(entry => entry.answer && ` · ${entry.answer}`)}
            </p>
            <h3 ref={heading} tabIndex={-1} className="font-semibold">
              {question || (selection ? 'Förslag på kategori' : 'Så går du vidare')}
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
            {result && <p role="status">{messages[result]}</p>}
            {result === 'clarify' && (
              <button type="button" className={answerClass} onClick={() => setHistory([])}>Ändra beskrivningen</button>
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
          <button type="button" className={answerClass} onClick={() => close()}>Avbryt guiden</button>
        </div>
      </div>
    </details>
  )
}
