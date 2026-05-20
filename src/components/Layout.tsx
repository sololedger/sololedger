'use client'

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  return (
    <main className="p-6 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen text-gray-900">
      
      {/* HEADER / NAVIGATION */}
      <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-3xl border shadow-sm">
        <div className="flex items-center gap-3">
          {/* S-Loggan har nu fått den gröna smaragdprofilen */}
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-emerald-200">
            S
          </div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-gray-800">
            SoloLedger
          </h1>
        </div>
        <nav className="flex gap-2 bg-gray-100 p-1 rounded-xl">
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
          {/* TILLAGD: Menyknapp för Hjälp & FAQ */}
          <button 
            onClick={() => setActiveTab('faq')} 
            className={`px-6 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'faq' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Hjälp & FAQ
          </button>
        </nav>
      </div>

      {/* HÄR RENDERAS INNEHÅLLET (Dashboard, Kontoplan, NE eller FAQ) */}
      <div className="animate-in fade-in duration-500">
        {children}
      </div>

    </main>
  )
}