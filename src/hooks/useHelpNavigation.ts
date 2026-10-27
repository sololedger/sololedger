'use client'

import { useEffect, useRef, useState } from 'react'
import { findHelpArticle, searchHelp, type HelpDestination } from '@/lib/helpContent'
import { emptyHelpReading, helpNavigationUrl, isHelpDestination } from '@/lib/helpNavigation'

export function useHelpNavigation(enabled: boolean, onTab: (tab: string) => void) {
  const [reading, setReading] = useState(emptyHelpReading)
  const [unknownId, setUnknownId] = useState(false)
  const [returnAvailable, setReturnAvailable] = useState(false)
  // History may survive reload. Only a live FAQ visit can offer a return.
  const activeVisit = useRef<string | null>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  useEffect(() => {
    if (!enabled) return
    function readLocation() {
      const url = new URL(window.location.href)
      if (url.searchParams.has('help')) {
        const id = url.searchParams.get('help')
        const article = findHelpArticle(id)
        setUnknownId(Boolean(id && !article))
        setReading(previous => {
          if (!article) return emptyHelpReading()
          const visible = searchHelp(previous.query, previous.topic).some(item => item.id === article.id)
          return { ...(visible ? previous : emptyHelpReading()), open: [...new Set([...previous.open, article.id])], anchor: article.id }
        })
        setFocusRevision(previous => previous + 1)
        setReturnAvailable(false)
        onTab('faq')
      } else {
        const destination = window.history.state?.soloLedgerHelpDestination
        setUnknownId(false)
        setReturnAvailable(Boolean(activeVisit.current &&
          window.history.state?.soloLedgerHelpVisit === activeVisit.current && isHelpDestination(destination)))
        onTab(isHelpDestination(destination) ? destination : 'dashboard')
      }
    }
    function clearOwnerVisit() {
      activeVisit.current = null
      setReading(emptyHelpReading())
      setUnknownId(false)
      setReturnAvailable(false)
      onTab('dashboard')
    }
    readLocation()
    window.addEventListener('popstate', readLocation)
    window.addEventListener('sololedger-help-owner-change', clearOwnerVisit)
    return () => {
      window.removeEventListener('popstate', readLocation)
      window.removeEventListener('sololedger-help-owner-change', clearOwnerVisit)
    }
  }, [enabled, onTab])
  function visit(id: string | null, destination?: HelpDestination, returnVisit: string | null = null) {
    if (!enabled) return
    const next = helpNavigationUrl(window.location.href, id)
    const state = { ...window.history.state, soloLedgerHelpDestination: destination ?? null, soloLedgerHelpVisit: returnVisit }
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next ||
      window.history.state?.soloLedgerHelpDestination !== state.soloLedgerHelpDestination ||
      window.history.state?.soloLedgerHelpVisit !== state.soloLedgerHelpVisit) {
      window.history.pushState(state, '', next)
    }
  }
  function openHelp() {
    visit(reading.anchor ?? '')
    setReturnAvailable(false)
    setUnknownId(false)
    setFocusRevision(previous => previous + 1)
    onTab('faq')
  }
  function openQuestion(id: string) {
    visit(id)
    setReading(previous => ({ ...previous, anchor: id }))
  }
  function openHelpFromMenu() {
    activeVisit.current = null
    openHelp()
  }
  function openDestination(destination: HelpDestination) {
    if (!isHelpDestination(destination)) return
    activeVisit.current = crypto.randomUUID()
    visit(null, destination, activeVisit.current)
    setReturnAvailable(true)
    onTab(destination)
  }
  function leaveHelp(destination: string) {
    activeVisit.current = null
    setReturnAvailable(false)
    visit(null, isHelpDestination(destination) ? destination : undefined)
  }
  return { reading, setReading, unknownId, returnAvailable, focusRevision, openHelp, openHelpFromMenu, openQuestion, openDestination, leaveHelp }
}
