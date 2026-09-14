export interface AccountPreset {
    id: string
    name: string
    debit_account: string
    credit_account: string
    default_vat_rate: number
    comment: string
  
    /**
     * Ska kategorin skapas automatiskt för en ny användare?
     */
    seedDefault?: boolean
  
    /**
     * Ska kategorin visas som snabbförslag i Kontoplan?
     */
    quickSuggestion?: boolean
  }
  
  /**
   * Gemensam kunskapskälla för SoloLedgers kontokategorier.
   *
   * OBS:
   * I första steget speglar denna lista medvetet befintligt beteende.
   * Innehållet kommer att kvalitetssäkras och förbättras stegvis.
   *
   * Ändringar här ska därför INTE automatiskt betraktas som
   * bokföringsmässigt godkända utan separat verifiering.
   */
  export const ACCOUNT_PRESETS: AccountPreset[] = [
    {
      id: 'avskrivning_inventarier',
      name: 'Avskrivning på inventarier',
      debit_account: '7830',
      credit_account: '1220',
      default_vat_rate: 0,
      comment: 'Avskrivning på inventarier som bokförts som tillgång',
      seedDefault: true,
    },
    {
      id: 'bankavgift',
      name: 'Bankavgift',
      debit_account: '6570',
      credit_account: '1930',
      default_vat_rate: 0,
      comment: 'Bank- och betaltjänstkostnader',
      seedDefault: true,
    },
    {
      id: 'egen_insättning',
      name: 'Egen insättning',
      debit_account: '1930',
      credit_account: '2018',
      default_vat_rate: 0,
      comment: 'När du sätter in privata pengar i firman',
      seedDefault: true,
    },
    {
      id: 'eget_uttag',
      name: 'Eget uttag',
      debit_account: '2013',
      credit_account: '1930',
      default_vat_rate: 0,
      comment: 'När du tar ut pengar från firman privat – inte lön',
      seedDefault: true,
    },
    {
      id: 'ej_avdragsgillt',
      name: 'Ej avdragsgilla kostnader',
      debit_account: '6992',
      credit_account: '1930',
      default_vat_rate: 0,
      comment:
        'T.ex. böter och förseningsavgifter som inte är skattemässigt avdragsgilla',
      seedDefault: true,
    },
    {
      id: 'försäljning',
      name: 'Försäljning',
      debit_account: '1930',
      credit_account: '3010',
      default_vat_rate: 25,
      comment: 'Vanlig momspliktig försäljning. Ändra momssats vid behov.',
      seedDefault: true,
    },
  
    // Teknisk/legacy-kategori.
    // Behålls oförändrad i första migreringssteget.
    {
      id: 'ingående_balans',
      name: 'Eget kapital, ingående balans (IB)',
      debit_account: '1930',
      credit_account: '2010',
      default_vat_rate: 0,
      comment:
        'Tekniskt konto för ingående eget kapital – använd inte för vanliga egna insättningar',
      seedDefault: true,
    },
  
    {
      id: 'kurser',
      name: 'Kurser & fortbildning',
      debit_account: '6991',
      credit_account: '1930',
      default_vat_rate: 0,
      comment:
        'Utbildning med tydlig koppling till den verksamhet du redan bedriver',
      seedDefault: true,
    },
    {
      id: 'prenumerationer',
      name: 'Prenumerationer & programvaror',
      debit_account: '5420',
      credit_account: '1930',
      default_vat_rate: 25,
      comment: 'T.ex. Adobe och andra programvaror/SaaS',
      seedDefault: true,
    },
  
    // OBS: Blandar idag VAD som köpts med HUR det betalats.
    // Behålls oförändrad tills VAD/HUR-frågan hanteras separat.
    {
      id: 'privat_utlägg',
      name: 'Privat utlägg för firman',
      debit_account: '5410',
      credit_account: '2018',
      default_vat_rate: 25,
      comment: 'När du privat har betalat ett inköp som hör till firman',
      seedDefault: true,
    },
  
    {
      id: 'resor',
      name: 'Resor',
      debit_account: '5800',
      credit_account: '1930',
      default_vat_rate: 6,
      comment:
        'T.ex. tåg, kollektivtrafik och taxi – kontrollera momsen på underlaget',
      seedDefault: true,
    },
  
    // Teknisk kategori som används av SoloLedgers periodiseringsflöde.
    {
      id: 'periodisering',
      name: 'Förutbetalda kostnader',
      debit_account: '1790',
      credit_account: '1930',
      default_vat_rate: 0,
      comment:
        'Används automatiskt av SoloLedger vid periodisering över årsskifte',
      seedDefault: true,
    },
    {
      id: 'skattekonto_default',
      name: 'Skatter & avgifter (eget uttag)',
      debit_account: '2012',
      credit_account: '1930',
      default_vat_rate: 0,
      comment:
        'När firmans pengar används för ägarens F-skatt och andra privata skatter/avgifter',
      seedDefault: true,
    },
  
    // Nuvarande snabbförslag i Kontoplan.
    // Innehållet behålls exakt i steg 1 och kvalitetssäkras senare.
    {
      id: 'lokalhyra',
      name: 'Hyra för verksamhetslokal',
      debit_account: '5010',
      credit_account: '1930',
      default_vat_rate: 0,
      comment: 'Hyra för separat kontor, studio, lager eller annan verksamhetslokal - inte vanligt hemmakontor',
      quickSuggestion: true,
    },
    {
      id: 'el-lokal',
      name: 'El för verksamhetslokal',
      debit_account: '5020',
      credit_account: '1930',
      default_vat_rate: 25,
      comment: 'El för separat verksamhetslokal - inte vanlig hushållsel i bostaden',
      quickSuggestion: true,
    },
    {
      id: 'reklam',
      name: 'Reklam & Annonsering',
      debit_account: '5900',
      credit_account: '1930',
      default_vat_rate: 25,
      comment: 'Google Ads, Meta-annonser, trycksaker',
      quickSuggestion: true,
    },
    {
      id: 'frakt',
      name: 'Frakt & transporter',
      debit_account: '5710',
      credit_account: '1930',
      default_vat_rate: 25,
      comment: 'Frakt och transporter av varor i verksamheten',
      quickSuggestion: true,
    },
    {
      id: 'forsakring',
      name: 'Företagsförsäkring',
      debit_account: '6310',
      credit_account: '1930',
      default_vat_rate: 0,
      comment: 'Ansvars- och sakförsäkring för firman',
      quickSuggestion: true,
    },
    {
      id: 'milersattning',
      name: 'Egen bil i verksamheten',
      debit_account: '5843',
      credit_account: '2018',
      default_vat_rate: 0,
      comment: 'Privat bil som används för resor i verksamheten - 25 kr/mil. Gäller inte vanliga resor mellan bostad och versamhetslokal',
      quickSuggestion: true,
    },
  ]
  
  /**
   * Kuraterad BAS-hjälp för konton SoloLedger använder eller behöver
   * kunna förklara. Detta är medvetet inte en full BAS-kontoplan.
   */
  export const BAS_ACCOUNT_HELP: Record<string, string> = {
    '1790': 'Övriga förutbetalda kostnader och upplupna intäkter',
    '1930': 'Företagskonto / checkkonto / affärskonto',
    '2010': 'Eget kapital',
    '2011': 'Egna varuuttag',
    '2012': 'Avräkning för skatter och avgifter',
    '2013': 'Övriga egna uttag',
    '2014': 'Uttag förmåner',
    '2017': 'Egna insättningar / årets kapitaltillskott',
    '2018': 'Övriga egna insättningar',
    '2019': 'Årets resultat',
    '2611': 'Utgående moms 25 %',
    '2621': 'Utgående moms 12 %',
    '2631': 'Utgående moms 6 %',
    '2641': 'Debiterad ingående moms',
    '2650': 'Redovisningskonto för moms',
    '3010': 'Försäljning',
    '5010': 'Lokalhyra',
    '5410': 'Förbrukningsinventarier',
    '5420': 'Programvaror',
    '5710': 'Frakter och transporter',
    '5800': 'Resekostnader',
    '5900': 'Reklam och PR',
    '6230': 'Datakommunikation',
    '6310': 'Företagsförsäkringar',
    '6570': 'Bankkostnader',
    '6992': 'Övriga externa kostnader, ej avdragsgilla',
    '7830': 'Avskrivningar på maskiner och inventarier',
  }
  
  export function getBasAccountHelp(accountNumber: string) {
    const nr = accountNumber.trim()
    return BAS_ACCOUNT_HELP[nr] ?? null
  }
  
  export function getDefaultAccountPresets() {
    return ACCOUNT_PRESETS.filter(preset => preset.seedDefault)
  }
  
  export function getQuickAccountSuggestions() {
    return ACCOUNT_PRESETS.filter(preset => preset.quickSuggestion)
  }