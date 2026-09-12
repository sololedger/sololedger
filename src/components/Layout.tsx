'use client'
import React, { useState } from 'react'

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
}

export default function Layout({ children, activeTab, setActiveTab, onLogout, isAdmin }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const selectMobileTab = (tab: string) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
  }
  return (
    <main className="w-full max-w-7xl mx-auto p-4 md:p-8 bg-gray-50/50 min-h-screen">
{/* HEADER / NAVIGATION */}
<div className="mb-8 bg-white rounded-3xl border shadow-sm overflow-hidden">

  {/* TOPPRAD */}
  <div className="flex items-center justify-between gap-3 p-4">

    {/* LOGGA */}
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-emerald-200 shrink-0">
        S
      </div>

      <div className="flex flex-col min-w-0">
        <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-800 leading-none">
          SoloLedger
        </h1>

        <span className="text-[10px] sm:text-xs text-gray-400 font-medium mt-1 truncate">
          Bokföring för enskild firma – utan anställda
        </span>
      </div>
    </div>

    {/* HAMBURGARE – ENDAST MOBIL */}
    <button
      type="button"
      onClick={() => setMobileMenuOpen(prev => !prev)}
      className="md:hidden w-10 h-10 shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center font-black text-lg transition-all"
      aria-label={mobileMenuOpen ? 'Stäng meny' : 'Öppna meny'}
      aria-expanded={mobileMenuOpen}
    >
      {mobileMenuOpen ? '✕' : '☰'}
    </button>

    {/* DESKTOPNAVIGATION */}
    <nav className="hidden md:flex gap-2 bg-gray-100 p-1 rounded-xl items-center">
      <button
        onClick={() => setActiveTab('dashboard')}
        className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
          activeTab === 'dashboard'
            ? 'bg-white text-emerald-600 shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Bokföring
      </button>

      <button
        onClick={() => setActiveTab('kontoplan')}
        className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
          activeTab === 'kontoplan'
            ? 'bg-white text-emerald-600 shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Kontoplan
      </button>

      <button
        onClick={() => setActiveTab('ne')}
        className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
          activeTab === 'ne'
            ? 'bg-white text-emerald-600 shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        NE-Bilaga
      </button>

      <button
        onClick={() => setActiveTab('moms')}
        className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
          activeTab === 'moms'
            ? 'bg-white text-emerald-600 shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Moms
      </button>

      <button
        onClick={() => setActiveTab('faq')}
        className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
          activeTab === 'faq'
            ? 'bg-white text-emerald-600 shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Hjälp & FAQ
      </button>

      <button
        onClick={() => setActiveTab('profil')}
        className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
          activeTab === 'profil'
            ? 'bg-white text-emerald-600 shadow-sm'
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Profil
      </button>

      {isAdmin && (
        <button
          onClick={() => setActiveTab('admin')}
          className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'admin'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          Admin
        </button>
      )}

      {onLogout && (
        <button
          onClick={onLogout}
          className="ml-2 px-4 py-2 bg-gray-200/60 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-lg font-black text-xs uppercase tracking-wider transition-all"
        >
          Logga ut
        </button>
      )}
    </nav>
  </div>

  {/* MOBILMENY */}
  {mobileMenuOpen && (
    <nav className="md:hidden border-t border-gray-100 p-3 bg-gray-50/60">
      <div className="grid grid-cols-2 gap-2">

        <button
          onClick={() => selectMobileTab('dashboard')}
          className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
            activeTab === 'dashboard'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-500 hover:bg-white'
          }`}
        >
          Bokföring
        </button>

        <button
          onClick={() => selectMobileTab('kontoplan')}
          className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
            activeTab === 'kontoplan'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-500 hover:bg-white'
          }`}
        >
          Kontoplan
        </button>

        <button
          onClick={() => selectMobileTab('ne')}
          className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
            activeTab === 'ne'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-500 hover:bg-white'
          }`}
        >
          NE-Bilaga
        </button>

        <button
          onClick={() => selectMobileTab('moms')}
          className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
            activeTab === 'moms'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-500 hover:bg-white'
          }`}
        >
          Moms
        </button>

        <button
          onClick={() => selectMobileTab('faq')}
          className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
            activeTab === 'faq'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-500 hover:bg-white'
          }`}
        >
          Hjälp & FAQ
        </button>

        <button
          onClick={() => selectMobileTab('profil')}
          className={`px-4 py-3 rounded-xl font-bold text-sm text-left transition-all ${
            activeTab === 'profil'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-500 hover:bg-white'
          }`}
        >
          Profil
        </button>

        {isAdmin && (
          <button
            onClick={() => selectMobileTab('admin')}
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