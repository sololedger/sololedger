'use client'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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

const useSafeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const BASE_NAV_ITEMS: NavItem[] = [
  { tab: 'dashboard', label: 'Bokföring' },
  { tab: 'kontoplan', label: 'Kontoplan' },
  { tab: 'fakturor', label: 'Fakturor' },
  { tab: 'inventarier', label: 'Inventarier' },
  { tab: 'ne', label: 'NE-Bilaga' },
  { tab: 'moms', label: 'Moms' },
  { tab: 'faq', label: 'Hjälp & FAQ' },
  { tab: 'profil', label: 'Profil' },
]

const ADMIN_NAV_ITEM: NavItem = { tab: 'admin', label: 'Admin' }
const DESKTOP_NAV_BUTTON_CLASS = 'whitespace-nowrap px-3 py-2 rounded-lg font-bold text-xs transition-all'
const DESKTOP_MORE_BUTTON_CLASS = 'inline-flex whitespace-nowrap px-3 py-2 rounded-lg font-bold text-xs transition-all'
const DESKTOP_LOGOUT_BUTTON_CLASS = 'whitespace-nowrap px-3 py-2 bg-gray-200/60 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-lg font-black text-xs uppercase tracking-wider transition-all'

export default function Layout({ children, activeTab, setActiveTab, onLogout, isAdmin }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [desktopNavLayout, setDesktopNavLayout] = useState({
    measured: false,
    visibleCount: 0,
  })
  const desktopNavRef = useRef<HTMLElement | null>(null)
  const measureItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const measureMoreRef = useRef<HTMLButtonElement | null>(null)
  const measureLogoutRef = useRef<HTMLButtonElement | null>(null)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const firstMoreItemRef = useRef<HTMLButtonElement | null>(null)

  const desktopNavItems = useMemo(
    () => (isAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS),
    [isAdmin]
  )
  const hasLogout = Boolean(onLogout)
  const visibleDesktopNavItems = desktopNavItems.slice(0, desktopNavLayout.visibleCount)
  const overflowDesktopNavItems = desktopNavItems.slice(desktopNavLayout.visibleCount)
  const moreMenuActive = overflowDesktopNavItems.some(item => item.tab === activeTab)

  useSafeLayoutEffect(() => {
    const navElement = desktopNavRef.current

    if (!navElement || typeof ResizeObserver === 'undefined') {
      setDesktopNavLayout({
        measured: true,
        visibleCount: desktopNavItems.length,
      })
      return
    }

    let animationFrameId = 0

    const calculateDesktopNav = () => {
      window.cancelAnimationFrame(animationFrameId)

      animationFrameId = window.requestAnimationFrame(() => {
        const navStyle = window.getComputedStyle(navElement)
        const horizontalPadding =
          (Number.parseFloat(navStyle.paddingLeft) || 0) +
          (Number.parseFloat(navStyle.paddingRight) || 0)
        const availableWidth = navElement.clientWidth - horizontalPadding
        const gap = Number.parseFloat(navStyle.columnGap || navStyle.gap) || 0
        const itemWidths = desktopNavItems.map((_, index) =>
          measureItemRefs.current[index]?.getBoundingClientRect().width ?? 0
        )
        const moreWidth = measureMoreRef.current?.getBoundingClientRect().width ?? 0
        const logoutWidth = hasLogout ? measureLogoutRef.current?.getBoundingClientRect().width ?? 0 : 0

        const getTotalWidth = (visibleCount: number) => {
          const hiddenCount = desktopNavItems.length - visibleCount
          const visibleItemsWidth = itemWidths
            .slice(0, visibleCount)
            .reduce((sum, width) => sum + width, 0)
          const controlCount = visibleCount + (hiddenCount > 0 ? 1 : 0) + (hasLogout ? 1 : 0)
          const totalGapWidth = Math.max(controlCount - 1, 0) * gap

          return (
            visibleItemsWidth +
            (hiddenCount > 0 ? moreWidth : 0) +
            logoutWidth +
            totalGapWidth
          )
        }

        let nextVisibleCount = desktopNavItems.length
        while (nextVisibleCount > 0 && getTotalWidth(nextVisibleCount) > availableWidth) {
          nextVisibleCount -= 1
        }

        setDesktopNavLayout(current => {
          if (current.measured && current.visibleCount === nextVisibleCount) {
            return current
          }

          return {
            measured: true,
            visibleCount: nextVisibleCount,
          }
        })
      })
    }

    calculateDesktopNav()

    const observer = new ResizeObserver(calculateDesktopNav)
    observer.observe(navElement)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      observer.disconnect()
    }
  }, [desktopNavItems, hasLogout])

  useEffect(() => {
    if (!moreMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setMoreMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreMenuOpen(false)
        moreButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreMenuOpen])

  useEffect(() => {
    if (overflowDesktopNavItems.length === 0) {
      setMoreMenuOpen(false)
    }
  }, [overflowDesktopNavItems.length])

  useEffect(() => {
    if (moreMenuOpen) {
      firstMoreItemRef.current?.focus()
    }
  }, [moreMenuOpen])

  const selectDesktopTab = (tab: string) => {
    setActiveTab(tab)
    setMoreMenuOpen(false)
  }

  const selectMobileTab = (tab: string) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
    setMoreMenuOpen(false)
  }

  const handleMoreButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMoreMenuOpen(true)
    }
  }

  const handleMoreItemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setMoreMenuOpen(false)
      moreButtonRef.current?.focus()
      return
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    event.preventDefault()

    const menuItems = Array.from(
      moreMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    )

    if (menuItems.length === 0) return

    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (index + direction + menuItems.length) % menuItems.length
    menuItems[nextIndex]?.focus()
  }

  const renderDesktopNavButton = (item: NavItem) => {
    const isActive = activeTab === item.tab
    const isAdminTab = item.tab === 'admin'

    return (
      <button
        key={item.tab}
        type="button"
        onClick={() => selectDesktopTab(item.tab)}
        aria-current={isActive ? 'page' : undefined}
        className={`${DESKTOP_NAV_BUTTON_CLASS} ${
          isActive
            ? `bg-white ${isAdminTab ? 'text-purple-600' : 'text-emerald-600'} shadow-sm`
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        {item.label}
      </button>
    )
  }

  return (
    <main className="w-full max-w-7xl mx-auto p-4 md:p-8 bg-gray-50/50 min-h-screen">
{/* HEADER / NAVIGATION */}
<div className="mb-8 bg-white rounded-3xl border shadow-sm overflow-visible">

  {/* TOPPRAD */}
  <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">

    <div className="flex w-full items-center justify-between gap-3 lg:w-auto lg:shrink-0">
      {/* LOGGA */}
      <div className="flex min-w-0 items-center gap-3 sm:min-w-[19rem] lg:min-w-[18rem] xl:min-w-[20rem]">
        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-emerald-200 shrink-0">
          S
        </div>

        <div className="flex flex-col min-w-0">
          <h1 className="whitespace-nowrap text-xl font-black italic uppercase tracking-tighter text-gray-800 leading-none">
            SoloLedger
          </h1>

          <span className="mt-1 text-[10px] font-medium leading-snug text-gray-400 sm:text-xs sm:whitespace-nowrap">
            Bokföring för enskild firma – utan anställda
          </span>
        </div>
      </div>

      {/* HAMBURGARE – ENDAST MOBIL */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(prev => !prev)}
        className="lg:hidden w-10 h-10 shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center font-black text-lg transition-all"
        aria-label={mobileMenuOpen ? 'Stäng meny' : 'Öppna meny'}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
    </div>

    {/* DESKTOPNAVIGATION */}
    <nav
      ref={desktopNavRef}
      className="relative hidden min-w-0 flex-1 items-center justify-end gap-2 rounded-xl bg-gray-100 p-1 lg:flex"
      style={{ visibility: desktopNavLayout.measured ? 'visible' : 'hidden' }}
    >
      <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 -z-10 flex gap-2 opacity-0">
        {desktopNavItems.map((item, index) => (
          <button
            key={item.tab}
            ref={(element) => {
              measureItemRefs.current[index] = element
            }}
            type="button"
            tabIndex={-1}
            className={DESKTOP_NAV_BUTTON_CLASS}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          ref={measureMoreRef}
          tabIndex={-1}
          className={DESKTOP_MORE_BUTTON_CLASS}
        >
          Mer
          <span className="ml-1 text-[10px]" aria-hidden="true">
            ▼
          </span>
        </button>

        {hasLogout && (
          <button
            type="button"
            ref={measureLogoutRef}
            tabIndex={-1}
            className={DESKTOP_LOGOUT_BUTTON_CLASS}
          >
            Logga ut
          </button>
        )}
      </div>

      {visibleDesktopNavItems.map(renderDesktopNavButton)}

      {overflowDesktopNavItems.length > 0 && (
        <div ref={moreMenuRef} className="relative">
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreMenuOpen(prev => !prev)}
            onKeyDown={handleMoreButtonKeyDown}
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            aria-controls="main-more-menu"
            aria-current={moreMenuActive ? 'page' : undefined}
            className={`${DESKTOP_MORE_BUTTON_CLASS} ${
              moreMenuActive || moreMenuOpen
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
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
              {overflowDesktopNavItems.map((item, index) => (
                <button
                  key={item.tab}
                  ref={index === 0 ? firstMoreItemRef : undefined}
                  type="button"
                  role="menuitem"
                  onClick={() => selectDesktopTab(item.tab)}
                  onKeyDown={(event) => handleMoreItemKeyDown(event, index)}
                  aria-current={activeTab === item.tab ? 'page' : undefined}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition-all ${
                    activeTab === item.tab
                      ? item.tab === 'admin'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className={DESKTOP_LOGOUT_BUTTON_CLASS}
        >
          Logga ut
        </button>
      )}
    </nav>
  </div>

  {/* MOBILMENY */}
  {mobileMenuOpen && (
    <nav className="lg:hidden border-t border-gray-100 p-3 bg-gray-50/60">
      <div className="grid grid-cols-2 gap-2">

        {BASE_NAV_ITEMS.map(item => (
          <button
            key={item.tab}
            type="button"
            onClick={() => selectMobileTab(item.tab)}
            aria-current={activeTab === item.tab ? 'page' : undefined}
            className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
              activeTab === item.tab
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-gray-500 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}

        {isAdmin && (
          <button
            type="button"
            onClick={() => selectMobileTab('admin')}
            aria-current={activeTab === 'admin' ? 'page' : undefined}
            className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
              activeTab === 'admin'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-500 hover:bg-white'
            }`}
          >
            Admin
          </button>
        )}
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

      {/* INNEHÅLLET (Dashboard, Kontoplan, NE eller FAQ) */}
      <div className="animate-in fade-in duration-500">
        {children}
      </div>
    </main>
  )
}
