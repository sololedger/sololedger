'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import Image from 'next/image'
import { helpArticles, helpTopics, helpDestinations, searchHelp, type HelpDestination, type HelpMedia } from '@/lib/helpContent'
import { helpQuestionUrl, type HelpReadingState } from '@/lib/helpNavigation'

export function HelpArticleMedia({ media }: { media: HelpMedia }) {
  const [opened, setOpened] = useState(false)
  const [failed, setFailed] = useState(false)
  return <details className="mt-5 border-t border-slate-200 pt-3" onToggle={e => setOpened(e.currentTarget.open)}>
    <summary className="cursor-pointer py-2 font-semibold">{media.kind === 'image' ? 'Visa bildstöd' : 'Visa film och textversion'}</summary>
    {opened && <figure className="mt-3 space-y-3">
      {failed ? <p role="status">Mediet kunde inte laddas. Instruktionen finns i texten ovan.</p> : media.kind === 'image'
        ? <a href={media.src} target="_blank" rel="noopener noreferrer" className="block rounded-lg" aria-label={`Förstora bild: ${media.alt}`}><Image src={media.src} alt={media.alt} width={media.width} height={media.height} unoptimized className="h-auto max-w-full rounded-lg" onError={() => setFailed(true)} /></a>
        : <video src={media.src} controls playsInline preload="none" className="w-full rounded-lg" onError={() => setFailed(true)}><track kind="captions" src={media.captions} srcLang="sv" label="Svenska" default />Din webbläsare kan inte visa filmen.</video>}
      <figcaption className="text-sm text-slate-600">{media.caption}</figcaption>
      {media.kind === 'video' && <p><strong>Textversion: </strong>{media.transcript}</p>}
    </figure>}
  </details>
}

type Props = {
  reading: HelpReadingState; onReadingChange: Dispatch<SetStateAction<HelpReadingState>>
  unknownId: boolean; focusRevision: number
  onQuestion: (id: string) => void; onNavigate: (destination: HelpDestination) => void
}

export default function FAQ({ reading, onReadingChange, unknownId, focusRevision, onQuestion, onNavigate }: Props) {
  const [copyNotice, setCopyNotice] = useState('')
  const [manualLink, setManualLink] = useState<string | null>(null)
  const region = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const entries = searchHelp(reading.query, reading.topic)
  const title = reading.query.trim() ? 'Sökresultat' : helpTopics.find(topic => topic.id === reading.topic)?.label ?? 'Frågor och guider'

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const anchor = reading.anchor
      const target = anchor ? region.current?.querySelector<HTMLElement>(`[data-help-id="${anchor}"] > summary`) : null
      if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }) }
      else region.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
    // Focus only on a link/history/return request, never while typing or toggling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRevision])

  async function copyLink(id: string) {
    const link = helpQuestionUrl(window.location.href, id)
    setManualLink(null)
    try {
      await navigator.clipboard.writeText(link)
      setCopyNotice('Frågelänken är kopierad.')
    } catch {
      setManualLink(link)
      setCopyNotice('Markera och kopiera frågelänken nedan.')
    }
  }

  return <section ref={region} lang="sv" aria-label="Hjälp & FAQ" className="sl-help mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-slate-50 p-4 text-slate-800 sm:p-8 lg:p-10">
    <header className="mb-7 max-w-3xl">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-700">Hjälp & FAQ</p>
      <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight sm:text-3xl">Vad vill du ha hjälp med?</h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">Hitta ett kort svar eller följ en guide, ett steg i taget.</p>
      <label htmlFor="help-search" className="mb-2 mt-6 block text-sm font-semibold">Sök i frågor och guider</label>
      <div className="flex flex-wrap gap-2">
        <input ref={search} id="help-search" type="search" autoComplete="off" value={reading.query} onChange={e => onReadingChange(previous => ({ ...previous, query: e.target.value }))} placeholder="Till exempel moms, R14 eller årslås" className="min-h-12 min-w-0 flex-[1_1_14rem] rounded-xl border border-slate-400 bg-white px-4 py-3 text-base" />
        {reading.query && <button type="button" onClick={() => { onReadingChange(previous => ({ ...previous, query: '' })); search.current?.focus() }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold">Rensa sökning</button>}
      </div>
    </header>
    {unknownId && <div role="status" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4"><strong>Frågelänken kunde inte hittas.</strong><p className="mt-1">Frågan kan ha flyttats. Sök här eller välj ett ämne.</p></div>}
    <div className="mb-6 lg:hidden">
      <label htmlFor="help-topic" className="mb-2 block text-sm font-semibold">Ämne</label>
      <select id="help-topic" value={reading.topic} onChange={e => onReadingChange(previous => ({ ...previous, topic: e.target.value as HelpReadingState['topic'] }))} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 text-base"><option value="all">Alla ämnen</option>{helpTopics.map(topic => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select>
    </div>
    <div className="grid min-w-0 gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Hjälpens ämnen" className="hidden lg:block">
        <h2 className="mb-3 text-lg font-semibold">Ämnen</h2>
        <div className="flex flex-col gap-2">{[{ id: 'all', label: 'Alla ämnen' }, ...helpTopics].map(topic => <button key={topic.id} type="button" aria-pressed={reading.topic === topic.id} onClick={() => onReadingChange(previous => ({ ...previous, topic: topic.id as HelpReadingState['topic'] }))} className={`min-h-12 rounded-xl border px-3 py-3 text-left text-sm font-semibold ${reading.topic === topic.id ? 'border-emerald-300 bg-white text-emerald-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white'}`}>{topic.label}</button>)}</div>
      </nav>
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2><p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-slate-600">{entries.length} av {helpArticles.length} frågor och guider</p></div>
        {entries.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Ingen träff</h3><p className="mt-2">Prova ett kortare ord eller välj Alla ämnen.</p><button type="button" className="mt-3 min-h-11 font-semibold text-emerald-800 underline" onClick={() => { onReadingChange(previous => ({ ...previous, query: '', topic: 'all' })); search.current?.focus() }}>Visa alla frågor</button></div>}
        {entries.map(article => <details key={article.id} data-help-id={article.id} open={reading.open.includes(article.id)} onToggle={e => {
          const opened = e.currentTarget.open
          if (opened === reading.open.includes(article.id)) return
          onReadingChange(previous => ({ ...previous, open: opened ? [...new Set([...previous.open, article.id])] : previous.open.filter(id => id !== article.id), anchor: article.id }))
          if (opened) onQuestion(article.id)
        }} className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="min-h-14 cursor-pointer px-4 py-5 text-base font-semibold leading-relaxed sm:px-5">{article.title}</summary>
          <div className="space-y-4 border-t border-slate-200 px-4 py-5 text-base leading-relaxed sm:px-5">
            <p>{article.answer}</p>
            {article.applies && <p className="text-sm text-slate-600">{article.applies}</p>}
            {article.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {article.steps && <ol className="list-decimal space-y-3 pl-6">{article.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>}
            {article.warning && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Kontrollera: </strong>{article.warning}</p>}
            <div className="flex flex-wrap gap-3">{article.destinations?.map(destination => <button key={destination} type="button" onClick={() => { onReadingChange(previous => ({ ...previous, anchor: article.id })); onNavigate(destination) }} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Öppna {helpDestinations[destination]}</button>)}</div>
            {article.media && <HelpArticleMedia media={article.media} />}
            <div className="space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
              {article.sources?.map(source => <p key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer" className="inline-block py-2 text-emerald-800 underline underline-offset-4">{source.label}<span className="sr-only"> (öppnas i ny flik)</span></a></p>)}
              <p>Innehåll granskat {article.reviewed}. Kontrollera aktuellt år och dina förutsättningar.</p>
              <button type="button" onClick={() => void copyLink(article.id)} className="min-h-11 py-2 font-semibold text-emerald-800 underline underline-offset-4" aria-label={`Kopiera frågelänk: ${article.title}`}>Kopiera frågelänk</button>
            </div>
          </div>
        </details>)}
      </div>
    </div>
    <p role="status" aria-live="polite" className="mt-4 text-sm text-slate-700">{copyNotice}</p>
    {manualLink && <label className="mt-2 block text-sm font-semibold">Frågelänk<input readOnly value={manualLink} onFocus={e => e.currentTarget.select()} className="mt-2 w-full min-w-0 rounded-lg border border-slate-400 bg-white p-3 text-base" /></label>}
    <footer className="mt-7 border-t border-slate-200 pt-5 text-sm leading-relaxed text-slate-600">Hittar du inte svaret? <a href="mailto:sololedger2026@gmail.com" className="inline-block py-2 text-emerald-800 underline">Kontakta SoloLedger</a>. Skicka aldrig lösenord eller återställningslänkar.</footer>
  </section>
}
