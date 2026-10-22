# KAN-101 Etapp 1 – lokal presentation och begriplig NE-information

2026-10-22. Lokal kandidat på `codex/KAN-101-ne-presentation`, produktbas
`65918796460741cc0a05ee281a8fe7f893d1ea28`. Exakt checkpoint-SHA finns i Git.
Arbetskopia: `audit-packages/KAN-99-local`. Dess origin är en lokal äldre arbetskopia, inte GitHub.
Root-grenen staging är separat dokumentationshistorik och får inte publiceras som produkt.

## Omfattning och faktisk förändring

Endast presentation och texter efter Pontus uttryckliga godkännande. Resultat/balans i två kolumner behålls.
R15/R16 visas även när 0 och märks **Inte bedömt**; texten förklarar att systemet saknar individuell bedömning.
R17 får alltid en neutral förklaring om SoloLedgers beräkning och återstående deklarationsbedömningar.
Den gröna R17-bakgrunden och balanskontrollens gröna bock tas bort; kontrollens villkor/belopp ändras inte.
Kontotäckningen ersätter grupptexten ”Behöver granskning / Inga konton” med en avgränsad beskrivning av kontokopplingar.

NEAccountTable är gemensam för kontotäckning och R-/B-underlag: konto, namn, kontosaldo/period,
NE-koppling, kopplingsstatus och Visa detaljer. Ett konto kan öppnas för regel/namnkälla, eventuellt separat
rutbidrag och journal med datum, VER, beskrivning, debet och kredit. På mobil visas märkta radkort.
Kontroller och nästa steg visas i tabell. Återkommande teknisk standardtext har kortats.

Saldo är fortfarande debet minus kredit. Rutbidrag hålls separat. B8/B14 behåller nettade underlag;
B10 behåller eget kapital, kumulativt resultat, ägarflöden och tekniska resultatöverföringar.
Nollkonton finns kvar i granskningsunderlaget, liksom original, rättelser, ingående balans,
avvikande journalradens datum och historiska R1/R2-beslut med beslutsgrund. Kontonamn är fortfarande hjälpinformation.
Journalerna hämtas först när kontots detaljer öppnas, genom samma befintliga ägarkontrollerade lässervice.

## Avgränsning och redovisningsyta

Ingen diff i `src/lib`, hooks, huvudsidans bokföringsflöden, Supabase, migrationer, RPC, package.json eller lockfil.
Ingen ny beräkning, kontokoppling, skattemotor, lagring eller ändring av årslås.
Journal, momsrapport/perioder, NE/resultat/balans, dashboard/uttag, fakturor/betalningar,
rättelser, SIE och låsta perioder använder samma befintliga regler och data.
Ingen ny transaktionskälla eller skrivväg. Därför behövs ingen ny boknings-/moms-/årslåsresa för UI-etappen;
verifieringen jämför befintliga belopp, läsgränser och presentation med syntetiska data.

## Officiella definitioner och vad som återstår

[Skatteverkets skattemässiga justeringar](https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet/fyllainebilagan/skattemassigajusteringar.4.361dc8c15312eff6fd2c7d1.html)
lästes 2026-10-22 innan nya texter skrevs. R15 gäller inkomster som inte bokförts som intäkt men ska beskattas;
R16 gäller avdrag utanför bokförda kostnader, även vissa belopp bokförda mot eget kapital.
R17 summerar R12–R16 och är inte deklarationens slutliga överskott/underskott.
Produktens nollor är begränsningar i underlaget, inte bevis för skattebedömda nollor.

Manuell bedömning kvarstår för R15/R16, fullständigheten i R13/R14, korrekt kontering/underlag,
historisk R1/R2-fördelning där beslut saknas, tidigare underskott, egenavgiftsavstämning och andra individuella
skattefrågor. Aktuellt inkomstårs regler och slutliga deklarationsuppgifter behöver kontrolleras hos Skatteverket.
Inga procentsatser eller personliga skattebelopp har lagts till.

KAN-96 (nollat importresultat) och KAN-108/83/34 är fortsatt öppna risker. Varningar och granskning bevaras;
ingen ny detektion eller lösning påstås. Årslås är inte en fryst NE-version eller inlämningsbekräftelse.
KAN-100:s sparade underlag/versioner och full överföringsguide ingår inte.

## Verifiering

- NE-review: 16 kontrollgrupper PASS. Jämförelse med exakt produktbas6591879:
  samma serviceutfall/läsanrop och alla renderade valutabelopp för 2025–2028, vinst/förlust/tomt och låst/olåst.
  Indata oförändrade. Inga ekonomiska uttryck eller regler ändrade i produktionskoden.
- Browser 1440/390/320 px PASS: faktisk React, konto-/journalöppning, R15/R16 synliga,
  R17-gräns, ägar-/årsbyte, sena svar, både rapport-/journalfel och laddning, inga externa anrop/skrivningar,
  klientfel eller horisontell överrullning. Dator/mobilbilder visuellt granskade.
- Kontotäckning: 21 service/renderfall och 8000 kontotillstånd PASS; dator/mobil, låst/olåst och belopp PASS.
- Säkra regressionens delar körda i delar. Första domänkörningen stannade vid en utbytt UI-rubrik;
  berörda UI-assertioner uppdaterades till kontorader/status och ny avgränsad text, inte svagare ekonomiska villkor.
  Fixat kontotäckningsprov och efterföljande domänkommandon PASS. Övriga historik/UI/bokningsprov PASS.
  Publik Playwright-smoke mot byggd lokal app 2/2 PASS. Ingen hosted testning eller DB-testskrivning.
- Typkontroll och fokuserad ESLint på samtliga ändrade komponenter/testskript PASS utan fel/varningar.
  Full repo-lintskuld har inte åtgärdats och ingen full repo-lint-PASS påstås.
- Optimerat bygge PASS med syntetisk localhost-Supabase-konfiguration och syntetiska nycklar.
  Första försök saknade lokal byggkonfiguration och nätåtkomst till befintliga typsnitt;
  inget produktfel eller produktändring krävdes. Befintlig varning om flera lockfiler kvarstår.

Råa lokala loggar: `coverage/kan101/` (ignorerat). Utvalda syntetiska bilder:
`docs/testing/kan101-local-20261022/`. Inga riktiga användaruppgifter eller credentials ingår.

## Nästa steg och acceptans

Redo som lokal Staging-kandidat efter gröna slutkontroller. Pontus godkänner separat exakt commit före publicering.
På Staging: läs NE på dator/mobil; kontrollera R15/R16/R17, kontotäckning utan falskt godkännande,
öppna R1/R2, R13/R14, B8/B14 och B10 samt konto/journal, byt år/användare och kontrollera läsfel/återförsök.
Jämför befintliga NE-belopp före/efter på samma underlag. Ingen provbokning eller årslåsning behövs för UI-acceptans.

Ingen push, deployment, liveanslutning, migration, DB-skrivning eller Jira-mutation i denna etapp.
Pontus visuell produktacceptans i Staging återstår; ingen full deklarationsacceptans eller HANDOFF READY påstås.
