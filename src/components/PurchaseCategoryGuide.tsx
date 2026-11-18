import { useRef, useState } from 'react'
import { findGuideCategory, findPurchaseTopics, type GuideCategory } from '@/lib/purchaseCategoryGuide'

type PurchaseUse = '' | 'business' | 'private' | 'mixed' | 'unknown'
type PurchaseContext = '' | 'yes' | 'no' | 'unknown'

interface Props {
  categories: readonly GuideCategory[]
  ready: boolean
  onChooseCategory: (id: string) => void
  onOpenForeignPurchase: () => void
  onOpenFixedAssets: () => void
}

const fieldClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900'
const actionClass = 'mt-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800'

export default function PurchaseCategoryGuide({
  categories, ready, onChooseCategory, onOpenForeignPurchase, onOpenFixedAssets,
}: Props) {
  const details = useRef<HTMLDetailsElement>(null)
  const [query, setQuery] = useState('')
  const [use, setUse] = useState<PurchaseUse>('')
  const [context, setContext] = useState<PurchaseContext>('')
  const [purpose, setPurpose] = useState<PurchaseContext>('')
  const [bankPayment, setBankPayment] = useState<PurchaseContext>('')
  const matches = findPurchaseTopics(query)
  const topic = matches.length === 1 ? matches[0] : null
  const bankQuestion = 'Drogs pengarna direkt från företagets bankkonto?'
  const question = use === 'private'
    ? bankQuestion
    : 'Visar fakturan eller kvittot att säljaren finns i Sverige?'
  const foreign = use === 'business' && context === 'no'
  const domestic = use === 'business' && context === 'yes'
  const privateWithdrawal = use === 'private' && context === 'yes'
  const confirmedTopic = domestic && purpose === 'yes' ? topic : null
  const equipment = confirmedTopic?.id === 'inventarier'
  const categoryId = privateWithdrawal ? 'eget_uttag' : equipment ? null : confirmedTopic?.id
  const selection = categoryId ? findGuideCategory(categoryId, categories, ready) : null

  function updatePurpose(value: PurchaseContext) {
    setPurpose(value)
    setBankPayment('')
  }

  function updateQuery(value: string) {
    setQuery(value)
    setUse('')
    setContext('')
    updatePurpose('')
  }

  return (
    <details ref={details} className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-gray-900">
        Hjälp mig välja kategori
      </summary>
      <div className="max-w-xl space-y-3 pb-4 text-sm text-gray-800">
        <label className="block font-medium">
          Vad har du köpt eller betalat?
          <input
            type="text"
            value={query}
            maxLength={160}
            onChange={event => updateQuery(event.target.value)}
            className={fieldClass}
            placeholder="Till exempel kurs, virke eller programvara"
          />
        </label>
        {query.trim() && (
          <label className="block font-medium">
            Vad ska köpet användas till?
            <select className={fieldClass} value={use} onChange={event => {
              setUse(event.target.value as PurchaseUse)
              setContext('')
              updatePurpose('')
            }}>
              <option value="">Välj</option>
              <option value="business">Enbart i verksamheten</option>
              <option value="private">Enbart privat</option>
              <option value="mixed">Både privat och i verksamheten</option>
              <option value="unknown">Jag vet inte</option>
            </select>
          </label>
        )}
        {(use === 'mixed' || use === 'unknown') && (
          <p role="status">Ta reda på hur köpet ska användas privat och i verksamheten innan du väljer kategori.</p>
        )}
        {(use === 'business' || use === 'private') && (
          <label className="block font-medium">
            {question}
            <select className={fieldClass} value={context} onChange={event => {
              setContext(event.target.value as PurchaseContext)
              updatePurpose('')
            }}>
              <option value="">Välj</option>
              <option value="yes">Ja</option>
              <option value="no">{use === 'business' ? 'Nej, säljaren finns utomlands' : 'Nej'}</option>
              <option value="unknown">Jag vet inte</option>
            </select>
          </label>
        )}
        {use === 'private' && (context === 'no' || context === 'unknown') && (
          <p role="status">Kontrollera vem som betalade och vilket konto som belastades. Eget uttag är aktuellt när verksamhetens pengar användes till det privata köpet.</p>
        )}
        {use === 'business' && context === 'unknown' && (
          <p role="status">Kontrollera på underlaget vem som faktiskt sålde varan eller tjänsten och vilket land säljaren finns i. Fråga säljaren om uppgiften saknas.</p>
        )}
        {foreign && (
          <div>
            <p>Kontrollera säljarens land, vad du köpt och om säljaren debiterat moms. Gå vidare till den befintliga kontrollen för utlandsinköp.</p>
            <button type="button" className={actionClass} onClick={onOpenForeignPurchase}>Öppna Utlandsinköp</button>
          </div>
        )}
        {domestic && !topic && (
          <p role="status">{matches.length > 1
            ? 'Flera typer av köp matchar. Beskriv en sak i taget och vad du ska använda den till.'
            : 'Förtydliga vad du köpte och vad det används till. Prova ett enklare ord från fakturan eller kvittot.'}</p>
        )}
        {domestic && topic && (
          <label className="block font-medium">
            {topic.question}
            <select className={fieldClass} value={purpose} onChange={event => updatePurpose(event.target.value as PurchaseContext)}>
              <option value="">Välj</option>
              <option value="yes">Ja</option>
              <option value="no">Nej</option>
              <option value="unknown">Jag vet inte</option>
            </select>
          </label>
        )}
        {domestic && topic && (purpose === 'no' || purpose === 'unknown') && <p role="status">{topic.clarify}</p>}
        {equipment && (
          <div>
            <p>I Inventarier bedöms om utrustningen ska kostnadsföras direkt eller bokföras som tillgång. Ta fram pris, beräknad livslängd och uppgifter om utrustning som köpts för att användas tillsammans.</p>
            <button type="button" className={actionClass} onClick={onOpenFixedAssets}>Gå till Inventarier</button>
          </div>
        )}
        {categoryId && !selection && (
          <p role="status">{ready
            ? 'En matchande standardkategori är inte tillgänglig för ny bokföring. Kontrollera kategorin och dess inställningar i Kontoplan.'
            : 'Kontoplanen är inte färdigladdad. Läs in den igen innan du väljer kategori.'}</p>
        )}
        {selection && !privateWithdrawal && (
          <label className="block font-medium">
            {bankQuestion}
            <select className={fieldClass} value={bankPayment} onChange={event => setBankPayment(event.target.value as PurchaseContext)}>
              <option value="">Välj</option>
              <option value="yes">Ja</option>
              <option value="no">Nej</option>
              <option value="unknown">Jag vet inte</option>
            </select>
          </label>
        )}
        {selection && !privateWithdrawal && (bankPayment === 'no' || bankPayment === 'unknown') && (
          <p role="status">Kontrollera hur köpet betalades. Om du betalade med privata pengar behöver betalningen hanteras som ett privat utlägg för verksamheten.</p>
        )}
        {selection && (privateWithdrawal || bankPayment === 'yes') && (
          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <p role="status">{selection.guidance.categoryGuidance.summary}</p>
            <p className="mt-2 font-semibold">{selection.category.name} · konto {selection.account}</p>
            {privateWithdrawal
              ? <p className="mt-2">Moms: inget momsavdrag för det privata köpet.</p>
              : <p className="mt-2">Kontrollera moms och avdragsrätt separat mot underlaget.</p>}
            <button type="button" className={actionClass} onClick={() => {
              if (details.current) details.current.open = false
              updateQuery('')
              onChooseCategory(selection.category.id)
            }}>Välj {selection.category.name}</button>
          </div>
        )}
      </div>
    </details>
  )
}
