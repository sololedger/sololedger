import { resultClosingMessage, resultClosingNextStep, type ResultClosingReview } from '@/lib/resultClosingReview'

export default function ResultClosingNotice({ review }: { review?: ResultClosingReview }) {
  if (!review?.blocked) return null
  return <section role="alert" aria-label="Osäkert resultat efter bokslutsposter" className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
    <h3 className="font-bold">Resultatunderlaget behöver granskas</h3>
    <p>{resultClosingMessage}</p>
    <ul className="my-2 list-disc pl-5">
      {review.entries.map(entry => <li key={entry.transaction_id} className="break-words">
        Verifikation {entry.ver_nr} · {entry.date} · konton {entry.accounts.join(', ')}
        {entry.journal_dates.some(date => date !== entry.date) && <> · journalens datum: {entry.journal_dates.join(', ')}</>}
      </li>)}
    </ul>
    <p>{resultClosingNextStep}</p>
    <p className="mt-2">Beskedet gäller även ett redan låst år. Inga bokningar eller historiska versioner ändras.</p>
  </section>
}
