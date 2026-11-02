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
    if (!target.isConnected) return
    const focus = target instanceof HTMLDetailsElement ? target.querySelector<HTMLElement>(':scope > summary') : target
    focus?.focus({ preventScroll: true })
    // Let focus/disclosure layout settle before starting smooth scrolling.
    requestAnimationFrame(() => {
      if (!target.isConnected) return
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' })
      // The figures section also contains the guide/review; mark only its report card.
      const card = target.querySelector<HTMLElement>('[data-ne-figures-card]') ?? target
      for (const animation of card.getAnimations()) {
        if (animation.id === 'ne-section-highlight') animation.cancel()
      }
      const highlight = 'inset 0 0 0 2px rgb(5 150 105 / 0.35), 0 0 0 3px rgb(5 150 105 / 0.12)'
      card.animate(
        reducedMotion
          ? [{ boxShadow: highlight }, { boxShadow: highlight }]
          : [{ boxShadow: highlight, offset: 0 }, { boxShadow: highlight, offset: 0.35 }, { boxShadow: 'inset 0 0 0 2px transparent, 0 0 0 3px transparent', offset: 1 }],
        { id: 'ne-section-highlight', duration: 1800, easing: 'ease-out' }
      )
    })
  })
}
export default function NESectionNavigation({ ready,source,children }: { ready: boolean;source?:NeSummarySource|null;children?:ReactNode }) {
  return <><nav aria-label="NE-vyns delar" className="ne-section-nav">
    {([['ne-figures','NE-bilagan'],['ne-guide','Vägledning'],['ne-review','Kontrollera NE-underlaget'],['ne-documentation','Spara och historik']] as const).map(([id,label]) =>
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
