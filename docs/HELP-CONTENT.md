# Hjälpinnehåll – KAN-102

Hjälpen är statiskt versionshanterad i `src/lib/helpContent.ts`. `FAQ.tsx` visar
innehållet; `helpNavigation.ts` och `useHelpNavigation.ts` hanterar endast hjälpens
länkar, historik och läsläge. Ingen databas eller extern sökning används.

KAN-107 kompletterar med sju publika artiklar i `src/lib/withdrawalHelp.ts`,
inkluderade i samma register/sökning. `WithdrawalPanel` öppnar relevant artikel
inne i panelen så att användaren kan återvända till samma kontroll och utkast.
Länkens vanliga `?help=...`-adress fungerar även i en ny flik och i ordinarie FAQ.
Ingen kontrolluppgift, ägare, belopp eller token skrivs till länken. Paus/hjälp
sparar ingenting. Konto-/datumbyte rensar uttagspanelens tillstånd via dess
befintliga sessionsgräns. Se `docs/reviews/KAN-107-LOCAL-IMPLEMENTATION-20261027.md`.

## Redigera en fråga

- Behåll `id` när rubriken ändras. Om ett ID måste bytas, behåll det gamla i
  `aliases`. ID:n och alias måste vara unika.
- Ange ett av de sex ämnena, ett kort begripligt svar, sökord och granskningsdatum.
  Använd vid behov tillämpning, textstycken, steg, kontrolltext och källor.
- Funktionsmål måste finnas i `helpDestinations`. Knappar öppnar en befintlig vy;
  de får aldrig boka, bekräfta, låsa eller deklarera något.
- Kontrollera innehållet mot aktuell implementation och officiella källor.
  En innehållsgranskning är inte en ändring av bokföringsregler eller beräkningar.
- Kör `npm run test:help-center` och `node scripts/check-help-center-lint.mjs`.
  Testa sedan visuellt på dator och mobil. Manuell skärmläsargranskning krävs
  separat; en grön browserassertion ersätter inte den.

## Frågelänkar och inloggning

`?help=ne-r14` öppnar frågan efter inloggning. Alias `r14` stöds. Okända ID:n
visar begripligt besked och sökningen. Kopierad länk byggs om från appens origin,
sökväg och kanoniska fråge-ID; övriga parametrar och hela fragmentet tas bort.
Interna hjälpbyten ändrar bara `help`, så att Auth kan hantera kod/fragment själv.
Lösenordsåterställningen prioriteras framför hjälpen. Återställningsbegärans
returadress kan bära ett verifierat fråge-ID, aldrig tokens eller annan querydata.

Sökning, ämne och öppna svar hålls endast i minnet för aktuell HomeSession.
Återgång från en funktion bevarar läsläge och återför fokus till frågan.
Vanliga menyval avslutar återgångsläget. Det aktiveras endast av en funktionsknapp
i FAQ under aktuell session, aldrig av en kvarvarande historikpost efter omladdning.
Historikens funktionsmål kan fortfarande återställa vyn; det ger i sig ingen
återgångslänk. En besöksmarkering i historiken måste matcha det aktiva besöket i
minnet. Äldre/avslutade besök återaktiveras inte av ett nytt besök.
Bakåt/framåt inom ett aktivt hjälpbesök bevarar återgångsmöjligheten.
Kontobyte/utloggning rensar besöket. Inga sökningar sparas i localStorage,
sessionStorage, databasen eller en extern analys-/söktjänst.

## Frivilligt bild- och filmstöd

Inga produktmedier eller tomma platshållare har lagts till. Lägg först en granskad,
liten fil i `public/help/` och fyll sedan i artikelns typade `media`-fält.
Allt i public är publikt: endast syntetiska exempel, inga kunduppgifter,
inloggningslänkar, tokens eller andra hemligheter.

- Bild: `kind: image`, `src`, tydlig `alt`, `caption`, `width`, `height`.
  Bilden skalas inom läsytan. Länken öppnar originalet för förstoring.
- Film: `kind: video`, `src`, `caption`, svensk `captions`-fil (.vtt), full
  `transcript`. Vanliga spelarkontroller, ingen autoplay, preload none.
- Filen monteras först när det frivilliga mediestödet öppnas. Vid fel visas
  begripligt besked, medan grundinstruktionen och filmens textversion finns kvar.
- Full instruktion ska alltid finnas i artikelns vanliga text. Granska alttext,
  bildtext, textning, skalning och felväg innan något publiceras.

Tester validerar befintliga artiklars ID:n, mål, källvärdar, datum och eventuella
mediefiler. Isolerade browserprov använder riktiga Home/useAuth/FAQ med syntetisk
Auth-transport och installerad Auth SDK för recovery. Ekonomivyer är markörer och
externa nätanrop är blockerade. Riktig e-postleverans och miljöns redirect-allowlist
verifieras separat med tillstånd; inga sådana inställningar ändras här.
