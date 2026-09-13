interface EmptyBookkeepingStateProps {
    selectedYear: number
    onImportSIE: () => void
  }
  
  export default function EmptyBookkeepingState({
    selectedYear,
    onImportSIE,
  }: EmptyBookkeepingStateProps) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm px-6 py-8 sm:px-10 sm:py-10 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">
          📒
        </div>
  
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">
          Din bokföring börjar här
        </h2>
  
        <p className="mt-2 text-xs sm:text-sm text-gray-400 font-medium max-w-md mx-auto leading-relaxed">
          Du har inga verifikationer bokförda för {selectedYear} ännu.
          Registrera din första transaktion ovan eller importera en befintlig SIE-fil.
        </p>
  
        <button
          type="button"
          onClick={onImportSIE}
          className="mt-6 inline-flex items-center justify-center h-10 px-5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-black uppercase tracking-wider transition-colors"
        >
          Importera SIE
        </button>
      </div>
    )
  }