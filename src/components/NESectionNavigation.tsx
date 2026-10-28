'use client'
import { neReviewSummary, type NeSummarySource } from '@/lib/nePresentation'
import type { ReactNode } from 'react'

export function openNESection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) node.open = true
  }
  requestAnimationFrame(() => {
    const focus = target instanceof HTMLDetailsElement ? target.querySelector<HTMLElement>(':scope > summary') : target
    focus?.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
}
export default function NESectionNavigation({ ready,source,children }: { ready: boolean;source?:NeSummarySource|null;children?:ReactNode }) {
  return <><nav aria-label="NE-vyns delar" className="ne-section-nav">
    {([['ne-figures','NE-bilagan'],['ne-guide','Vägledning'],['ne-review','Kontrollera underlaget'],['ne-documentation','Spara och historik']] as const).map(([id,label]) =>
      <button type="button" className="ne-secondary" key={id} disabled={!ready && (id === 'ne-guide' || id === 'ne-review')} onClick={() => openNESection(id)}>{label}</button>)}
  </nav><section id="ne-figures" tabIndex={-1} aria-label="NE-bilagans belopp"><NEReviewNotice source={source} ready={ready}/>{children}</section></>
}
export function NEReviewNotice({ source, ready }: { source: NeSummarySource | null | undefined; ready: boolean }) {
  const summary = neReviewSummary(source, ready)
  return <aside aria-label="Granskningsstatus för NE-bilagan" className={'ne-review-banner ' + (summary.areas.length || !summary.known ? 'ne-warning' : '')}>
    <div><strong>{summary.text}</strong><p>{summary.areas.length ? `Granska före deklaration · berör ${summary.areas.join(', ')}.` : summary.known ? 'Rapporten ersätter inte din egen kontroll av underlag och skatteuppgifter.' : 'Inget besked om att underlaget är kontrollerat kan lämnas.'}</p></div>
    {ready && <button type="button" className="ne-link" onClick={() => openNESection('ne-review')}>Visa granskningen</button>}
  </aside>
}
