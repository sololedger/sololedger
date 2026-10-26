# Momsperioder och skapandeknapp – läsande Production-granskning

2026-10-26. Endast analys beställd. **KORREKT periodtäckning för 2026 mot
registeruppgifterna i uppdraget. Ingen momsperiod saknas. Otydlig skapandeknapp.**
Inga profil-/Auth-rader, identifierare, namn, kontaktuppgifter eller bokföringsdata
kopieras hit. Nedan redovisas slutsatser och systembeteende, inte användarrådata.

## Underlag och verifieringsgräns

- Root/L AGENTS, L/PROJECT_STATE, release-/backuprapporter och relevant kod lästa.
- L ren före analys, codex/KAN-113-year-lock-analysis/02af89d. Ingen produktdiff
  mot e992e4f. Origin är lokal KAN62-kopia; inga lokala refar flyttade.
- GitHub main/staging färskt lästa direkt: e992e4f97e1d74c91b24947d61f1774596340bc1.
- Publik Production HTTP200; levererad JavaScript innehåller aktuell knapp/RPC,
  Production-ref och ingen Staging-ref. Ingen inloggning eller knapptryckning.
  Vercels deployment-ID/READY har inte återlästs separat i denna granskning.
- Direkt PostgreSQL17-läsning mot db.wbaxmuvudpnkvuliicuy.supabase.co:5432/postgres,
  TLS, startup-skrivskydd och BEGIN READ ONLY/ROLLBACK; ledger64. Befintlig pgpass
  använd endast som filreferens. Inga credentials lästa ut eller nya rådatafiler sparade.
- Unik målprofil identifierad internt. Profilens momsstatus, frekvens och start
  matchar uppdragets registeruppgifter. Den befintliga öppna interna årsperioden
  matchar angivet intervall. Ingen lucka, extra period eller överlapp hittades.
- Generatorns väntade intervall jämfördes med befintliga perioder genom ren SELECT:
  ingen saknad period. Varken generatorn eller årslåsfunktionen anropades.
- Startkällan är vat_management_from och matchar uppdragets redovisningsstart;
  registreringsdatumet används inte i dess ställe. Profilen har inget separat
  registreringsdatum, metodval eller räkenskapsårsslut. Periodfunktionen använder
  kalenderintervall; detta är ingen full verifiering av kontantmetodens bokföring.
  Registerutdraget jämfördes med uppgifterna i uppdraget, inte en ny myndighetshämtning.

## Knappens faktiska beteende

- Momsrapport.tsx:300,1440: visas vid registered, ifylld periodtyp/start och valt
  år högst innevarande år. Ingen kontroll av att något faktiskt saknas, även för
  år före profilstart. Inaktiveras vid pågående laddning, beräkning/stängning/deklaration.
- :530/:477 → accountingService.ts:1234 → ensure_vat_periods(valt års sista dag).
  Klick begär skrivning direkt, utan förhandsgranskning eller bekräftelse. Dubbelklick
  spärras. Vanlig öppning/årsbyte/omläsning läser enbart befintliga perioder.
- Live pg_get_functiondef för ensure_vat_periods och assert_vat_year_coverage läst;
  relevant logik motsvarar KAN110/111-migrationerna. Generatorn går från profilstarten
  genom alla periodstarter till min(valt års sista dag, databasens dagens datum).
  Den kan alltså behandla tidigare år och hela pågående perioden, vars slut kan ligga
  efter idag. Den begränsar sig inte till det valda årets saknade perioder.
- Exakt befintligt datumpar med samma periodtyp räknas som befintligt. Ingen UPDATE
  eller DELETE: datum, status, källa, avslut och deklaration skrivs inte om.
  Även annan befintlig källa återanvänds; årslåsets täckningskontroll är striktare.
- Saknad första delperiod, annan typ på exakt datumpar, överlapp eller saknad period
  i låst år ger fel. Saknade hela perioder skapas som open/sololedger. Ett fel rullar
  tillbaka hela RPC-anropet. Ingen journal, momsberäkning eller deklaration skapas.
- Serverns profillås serialiserar generatoranrop för samma ägare. Unik nyckel på
  ägare/start/slut hindrar exakta dubbletter. RLS har ägarbunden SELECT-policy;
  inga tabelltriggers finns. Ingen allmän överlappsexkludering finns i tabellkontraktet;
  generatorn har uttrycklig överlappskontroll före INSERT.
- Med kontrollerad profil/befintlig period innebär dagens klick enligt läst logik
  noll nya perioder och återanvändning av befintlig. Detta är härlett, inte skrivtestat.
  Klienten ignorerar created_count/existing_count och visar inget särskilt nollresultat.

## Riskbedömning och minsta rekommendation

Ingen konstaterad felaktig period eller bokföringspåverkan hos granskad användare.
Knappens närvaro antyder däremot en brist som inte finns. Felaktiga profilvärden
kan stoppas av skydden men också ge felaktiga nya, icke överlappande hela perioder
om första delperioden redan finns eller profilstarten ligger på en kalendergräns.
Systemet verifierar inte profilvärden mot Skatteverket. Skydd mot dubbletter är
inte bevis för skattemässigt rätt periodisering. Öppen period är inte en saknad period.

Föreslå en liten statusrad i befintligt kort: ”Alla momsperioder för 2026 finns”
och dölj skapandeknappen när täckningen är verifierad. Vid lucka: visa datum och
”Granska saknade perioder”. Före skrivning: uttrycklig bekräftelse med samtliga
intervall som faktiskt kommer att behandlas/skapas, även tidigare år. Osäker
första delperiod eller konflikt ska visa utredningsbesked/länk till Profil.
Laddningsfel får aldrig visas som komplett täckning. Behåll serverns skydd;
ingen ny automatisk generering eller gissad delperiod föreslås.

Kort hjälptext bör skilja fyra åtgärder:
1. Skapa period: lägger upp ett datumintervall utan verifikation eller inlämning.
2. Beräkna: läser bokföringen och visar aktuellt momsunderlag.
3. Stäng: separat bekräftad åtgärd som kan skapa momsavslutsverifikation och spärrar.
4. Deklarera: lämna hos Skatteverket; SoloLedgers bekräftelse dokumenterar redan
   gjord inlämning och skickar ingen deklaration eller betalning.

## Jira och nästa steg

Färsk läsande Jira-sökning i KAN på momsperioder/periodgenerering samt öppna
moms-/profilärenden: KAN110/111/112/113 Done. Inget öppet ärende täcker specifikt
skapandeknappens täckningsstatus/förhandsgranskning. Rekommendera ett nytt litet
UX-ärende efter Pontus beslut. KAN-102 täcker kompletterande FAQ; KAN-114 visuell
samordning, inte detta konkreta beteende. Inga Jira-mutationer gjorda.

Nästa steg: Pontus beslutar om separat avgränsat UX-uppdrag. Vid framtida implementation
bör deterministiska regressioner täcka komplett/lucka/läsfel, datum i bekräftelsen,
avbryt utan RPC och bekräftat skapande. Dator/mobil granskas visuellt. Inga nya
tester, syntetiska skrivningar, migrationer, deployer, commits eller pushar här.
