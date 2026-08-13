'use client'
import React from 'react'

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
}

export default function Layout({ children, activeTab, setActiveTab, onLogout, isAdmin }: LayoutProps) {
  return (
    <main className="w-full max-w-7xl mx-auto p-4 md:p-8 bg-gray-50/50 min-h-screen">
      {/* HEADER / NAVIGATION */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 bg-white p-4 rounded-3xl border shadow-sm">
        <div className="flex items-center gap-3 shrink-0">
          {/* S-Loggan med grön smaragdprofil */}
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-emerald-200">
            S
          </div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-800">
            SoloLedger
          </h1>
        </div>

        <nav className="flex gap-2 bg-gray-100 p-1 rounded-xl items-center overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-1">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'dashboard' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Bokföring
          </button>
          <button 
            onClick={() => setActiveTab('kontoplan')} 
            className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'kontoplan' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Kontoplan
          </button>
          <button 
            onClick={() => setActiveTab('ne')} 
            className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'ne' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            NE-Bilaga
          </button>
          <button 
            onClick={() => setActiveTab('moms')} 
            className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'moms' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Moms
          </button>
          <button 
            onClick={() => setActiveTab('faq')} 
            className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'faq' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Hjälp & FAQ
          </button>

          <button 
            onClick={() => setActiveTab('profil')} 
            className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'profil' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Profil
          </button>


          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`shrink-0 snap-start px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'admin' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Admin
            </button>
          )}
          {/* ✅ SPÅRARE INLAGD: Loggar LOGOUT CLICKED i F12 innan funktionen körs */}
          {onLogout && (
            <button 
              onClick={() => {
                console.log('LOGOUT CLICKED')
                onLogout()
              }}
              className="shrink-0 snap-start ml-2 px-4 py-2 bg-gray-200/60 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-lg font-black text-xs uppercase tracking-wider transition-all"
            >
              Logga ut
            </button>
          )}
        </nav>
      </div>

      {/* INNEHÅLLET (Dashboard, Kontoplan, NE eller FAQ) */}
      <div className="animate-in fade-in duration-500">
        {children}
      </div>
    </main>
  )
}