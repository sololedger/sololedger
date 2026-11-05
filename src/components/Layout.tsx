'use client'
import React, { useEffect, useRef, useState } from 'react'

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
}

type NavItem = {
  tab: string;
  label: string;
}

const PRIMARY_ITEMS: NavItem[] = [
  { tab: 'dashboard', label: 'Bokföring' },
  { tab: 'kontoplan', label: 'Bokföringskategorier' },
  { tab: 'fakturor', label: 'Fakturor' },
  { tab: 'moms', label: 'Moms' },
  { tab: 'inventarier', label: 'Inventarier' },
]

const YEAR_END_ITEMS: NavItem[] = [
  { tab: 'arsavslut', label: 'Årsavslut' },
  { tab: 'leverantorsskulder', label: 'Bokslutsskulder' },
  { tab: 'ne', label: 'NE-bilaga' },
]

const OTHER_ITEMS: NavItem[] = [
  { tab: 'faq', label: 'Hjälp & FAQ' },
  { tab: 'profil', label: 'Profil' },
]

const YEAR_END_LABEL = 'Bokslut och deklaration'
const ADMIN_ITEM: NavItem = { tab: 'admin', label: 'Admin' }
const DESKTOP_BUTTON_CLASS = 'whitespace-nowrap px-3 py-2 rounded-lg font-bold text-xs transition-all'

export default function Layout({ children, activeTab, setActiveTab, onLogout, isAdmin }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const mobileButtonRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const firstMoreItemRef = useRef<HTMLButtonElement>(null)

  const otherItems = isAdmin ? [...OTHER_ITEMS, ADMIN_ITEM] : OTHER_ITEMS
  const moreActive = [...YEAR_END_ITEMS, ...otherItems].some(item => item.tab === activeTab)

  useEffect(() => {
    if (!moreMenuOpen) return

    firstMoreItemRef.current?.focus()

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [moreMenuOpen])

  const closeMore = () => {
    setMoreMenuOpen(false)
    moreButtonRef.current?.focus()
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    mobileButtonRef.current?.focus()
  }

  const handleMobileEscape = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && mobileMenuOpen) {
      event.preventDefault()
      closeMobileMenu()
    }
  }

  const handleMoreKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && moreMenuOpen) {
      event.preventDefault()
      closeMore()
      return
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    event.preventDefault()
    if (!moreMenuOpen) {
      setMoreMenuOpen(true)
      return
    }

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const index = items.findIndex(item => item === event.target)
    const nextIndex = event.key === 'ArrowDown'
      ? (index + 1) % items.length
      : (index <= 0 ? items.length - 1 : index - 1)
    items[nextIndex]?.focus()
  }

  const renderMoreItem = (item: NavItem) => (
    <button
      key={item.tab}
      ref={item === YEAR_END_ITEMS[0] ? firstMoreItemRef : undefined}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-current={activeTab === item.tab ? 'page' : undefined}
      onClick={() => {
        setActiveTab(item.tab)
        closeMore()
      }}
      className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition-all ${
        activeTab === item.tab
          ? item === ADMIN_ITEM ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }`}
    >
      {item.label}
    </button>
  )

  const renderMobileItem = (item: NavItem) => (
    <button
      key={item.tab}
      type="button"
      aria-current={activeTab === item.tab ? 'page' : undefined}
      onClick={() => {
        setActiveTab(item.tab)
        closeMobileMenu()
      }}
      className={`min-w-0 break-words px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${item.tab === 'kontoplan' ? 'col-span-2' : ''} ${
        activeTab === item.tab
          ? item === ADMIN_ITEM ? 'bg-white text-purple-600 shadow-sm' : 'bg-white text-emerald-600 shadow-sm'
          : 'text-gray-500 hover:bg-white'
      }`}
    >
      {item.label}
    </button>
  )

  return (
    <main className="w-full max-w-7xl mx-auto p-4 md:p-8 bg-gray-50/50 min-h-screen">
      <div className="mb-8 bg-white rounded-3xl border shadow-sm overflow-visible">
        <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:flex-nowrap xl:w-auto xl:shrink-0">
            <div className="flex min-w-0 max-w-full items-center gap-3 sm:min-w-[19rem] xl:min-w-[20rem]">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-emerald-200 shrink-0">
                S
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="break-all text-xl font-black italic uppercase tracking-tighter text-gray-800 leading-none sm:break-normal sm:whitespace-nowrap">
                  SoloLedger
                </h1>
                <span className="mt-1 text-[10px] font-medium leading-snug text-gray-400 sm:text-xs sm:whitespace-nowrap">
                  Bokföring för enskild firma – utan anställda
                </span>
              </div>
            </div>

            <button
              ref={mobileButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(open => !open)}
              onKeyDown={handleMobileEscape}
              className="lg:hidden w-10 h-10 shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center font-black text-lg transition-all"
              aria-label={mobileMenuOpen ? 'Stäng meny' : 'Öppna meny'}
              aria-expanded={mobileMenuOpen}
              aria-controls={mobileMenuOpen ? 'mobile-main-menu' : undefined}
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          <nav
            aria-label="Huvudmeny"
            className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-2 rounded-xl bg-gray-100 p-1 lg:flex"
          >
            {PRIMARY_ITEMS.map(item => (
              <button
                key={item.tab}
                type="button"
                onClick={() => {
                  setActiveTab(item.tab)
                  setMoreMenuOpen(false)
                }}
                aria-current={activeTab === item.tab ? 'page' : undefined}
                className={`${DESKTOP_BUTTON_CLASS} ${
                  activeTab === item.tab ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {item.label}
              </button>
            ))}

            <div
              ref={moreRef}
              className="relative"
              onKeyDown={handleMoreKeyDown}
              onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setMoreMenuOpen(false)
              }}
            >
              <button
                ref={moreButtonRef}
                type="button"
                onClick={() => setMoreMenuOpen(open => !open)}
                aria-haspopup="menu"
                aria-expanded={moreMenuOpen}
                aria-controls={moreMenuOpen ? 'main-more-menu' : undefined}
                aria-current={moreActive ? 'true' : undefined}
                className={`inline-flex ${DESKTOP_BUTTON_CLASS} ${
                  moreActive || moreMenuOpen ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Mer
                <span className="ml-1 text-[10px]" aria-hidden="true">
                  {moreMenuOpen ? '▲' : '▼'}
                </span>
              </button>

              {moreMenuOpen && (
                <div
                  id="main-more-menu"
                  role="menu"
                  aria-label="Fler sidor"
                  className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl"
                >
                  <div role="group" aria-labelledby="desktop-year-end-label">
                    <div id="desktop-year-end-label" className="px-3 py-2 text-xs font-bold text-gray-600">
                      {YEAR_END_LABEL}
                    </div>
                    {YEAR_END_ITEMS.map(renderMoreItem)}
                  </div>
                  <div role="presentation" className="mt-1 border-t border-gray-100 pt-1">
                    {otherItems.map(renderMoreItem)}
                  </div>
                </div>
              )}
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="whitespace-nowrap px-3 py-2 bg-gray-200/60 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-lg font-black text-xs uppercase tracking-wider transition-all"
              >
                Logga ut
              </button>
            )}
          </nav>
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-main-menu"
            aria-label="Huvudmeny"
            onKeyDown={handleMobileEscape}
            className="lg:hidden border-t border-gray-100 p-3 bg-gray-50/60"
          >
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_ITEMS.map(renderMobileItem)}
            </div>
            <div role="group" aria-labelledby="mobile-year-end-label" className="mt-3 border-t border-gray-200 pt-3">
              <div id="mobile-year-end-label" className="px-4 pb-2 text-xs font-bold text-gray-600">
                {YEAR_END_LABEL}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {YEAR_END_ITEMS.map(renderMobileItem)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-3">
              {otherItems.map(renderMobileItem)}
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full mt-3 px-4 py-3 rounded-xl bg-white border border-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 font-black text-xs uppercase tracking-wider transition-all"
              >
                Logga ut
              </button>
            )}
          </nav>
        )}
      </div>

      <div className="animate-in fade-in duration-500">
        {children}
      </div>
    </main>
  )
}
