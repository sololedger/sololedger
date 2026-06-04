'use client'
import React from 'react'

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout?: () => void; // ✅ TILLAGD: Tar emot logga ut-funktionen från page.tsx
}

export default function Layout({ children, activeTab, setActiveTab, onLogout }: LayoutProps) {
  return (
    <main className="max-w-7xl mx-auto p-4 md:p-8 bg-gray-50/50 min-h-screen">
      {/* HEADER / NAVIGATION */}
      <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-3xl border shadow-sm">
        <div className="flex items-center gap-3">
          {/* S-Loggan med grön smaragdprofil */}
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-emerald-200">
            S
          </div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-800">
            SoloLedger
          </h1>
        </div>
        
        <nav className="flex gap-2 bg-gray-100 p-1 rounded-xl items-center">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'dashboard' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Bokföring
          </button>
          <button 
            onClick={() => setActiveTab('kontoplan')} 
            className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'kontoplan' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Kontoplan
          </button>
          <button 
            onClick={() => setActiveTab('ne')} 
            className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'ne' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            NE-Bilaga
          </button>
          <button 
            onClick={() => setActiveTab('moms')} 
            className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'moms' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Moms
          </button>
          <button 
            onClick={() => setActiveTab('faq')} 
            className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'faq' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Hjälp & FAQ
          </button>

          {/* ✅ TILLAGD: Logga ut-knapp som faktiskt kör vår skottsäkra reload-funktion */}
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

      {/* INNEHÅLLET (Dashboard, Kontoplan, NE eller FAQ) */}
      <div className="animate-in fade-in duration-500">
        {children}
      </div>
    </main>
  )
}