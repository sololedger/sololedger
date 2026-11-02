'use client'
import { neReviewSummary, type NeSummarySource } from '@/lib/nePresentation'
import type { ReactNode } from 'react'

let cancelSectionNavigation: (() => void) | undefined

export function openNESection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  cancelSectionNavigation?.()
  // The figures wrapper also contains other sections; mark only its report card.
  const card = target.querySelector<HTMLElement>('[data-ne-figures-card]') ?? target
  let frame = 0
  let animation: Animation | undefined
  const cancel = () => {
    cancelAnimationFrame(frame)
    if (animation) {
      animation.onfinish = null
      animation.cancel()
    }
    card.classList.remove('ne-navigation-highlight')
    if (cancelSectionNavigation === cancel) cancelSectionNavigation = undefined
  }
  cancelSectionNavigation = cancel
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) node.open = true
  }
  frame = requestAnimationFrame(() => {
    if (!target.isConnected) return cancel()
    const focus = target instanceof HTMLDetailsElement ? target.querySelector<HTMLElement>(':scope > summary') : target
    focus?.focus({ preventScroll: true })
    // Let focus/disclosure layout settle before starting smooth scrolling.
    frame = requestAnimationFrame(() => {
      if (!target.isConnected) return cancel()
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      card.classList.add('ne-navigation-highlight')
      animation = card.animate(
        reducedMotion
          ? [{ opacity: 1 }, { opacity: 1 }]
          : [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 3000 / 3400 }, { opacity: 0, offset: 1 }],
        { id: 'ne-section-highlight', pseudoElement: '::after', duration: reducedMotion ? 3000 : 3400, fill: 'both' }
      )
      // Keep the full tint during scrolling; start the three-second hold on arrival.
      animation.pause()
      animation.currentTime = 0
      target.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' })
      const started = performance.now()
      let stableSince = started
      let previous = target.getBoundingClientRect()
      function waitForArrival(now: number) {
        if (!target!.isConnected || now - started > 10000) return cancel()
        const rect = target!.getBoundingClientRect()
        if (Math.abs(rect.top - previous.top) > 0.5 || Math.abs(rect.left - previous.left) > 0.5) stableSince = now
        previous = rect
        if (rect.bottom > 0 && rect.top < window.innerHeight && now - stableSince >= 200) {
          animation!.onfinish = cancel
          animation!.play()
          frame = 0
        } else {
          frame = requestAnimationFrame(waitForArrival)
        }
      }
      frame = requestAnimationFrame(waitForArrival)
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
