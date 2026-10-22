# KAN-99 Etapp A – fiktivt EU-momsexempel, LOCAL PASS

2026-10-22. **Redo för separat godkänd slutlig Staging-kontroll inför Production. Ingen publicering.**
Produktgren codex/KAN-99-year-end-guide, förälder **f7da31df6a8d2c88ad24174e19d1f6977f201d80**.
Ny kandidat är denna produktcheckpoints HEAD; exakt SHA registreras i root STATE efter commit.
Pontus har manuellt accepterat hela Etapp A på Stagingf7, inklusive navigation/retur/öppna kontroller.

## Enda produktändring

En textsträng i **YearEndGuide.tsx** byter tidigare228/57 till tydligt **fiktivt200/50**:
200kr exklusive moms och utan fakturamoms; 25% omvänd svensk moms50kr, ingen avdragsrätt,
inga andra momsposter. Ruta21=200kr, ruta30=50kr och ruta48=0kr. Underlagsvillkoret kvarstår,
liksom faktura, säljarland, tjänst, avdragsrätt och faktiska omständigheter. Adobe-/EU-/journalvägledning orörd.
Ingen navigations-, bokförings-, momsberäknings-, DB- eller RPC-kod ändrad. Full bokförings-E2E inte relevant.

Sakgranskat 2026-10-22 mot Skatteverkets
[EU-tjänsteinköp](https://www.skatteverket.se/foretag/moms/kopavarorochtjanster/inkopfranandraeulander/kopatjansterfranandraeulander) och
[momsdeklarationens fält21/30/48](https://www.skatteverket.se/foretag/moms/deklareramoms/fyllaimomsdeklarationen.4.3a2a542410ab40a421c80004214.html).
Räkningen200×25%=50 och noll avdrag är villkorade exempelvärden, ingen bedömning av en verklig faktura.

## Verifierat

- Befintligt guidetest utökat med kontroller av fiktiv markering, samtliga belopp/villkor/förbehåll,
  att228/57 inte förekommer i exemplet samt bevarad Adobe-vägledning.
- **12 browsergrupper PASS** på1440/390, inklusive tidigare navigation/retur/expansion/kontexttester.
  Verklig Home/Layout/guide med syntetiska data/mål, noll nätverk/skrivningar/browserfel.
- Typkontroll och optimerat lokalt Next16.2.6-bygge **PASS**; syntetisk processmiljö, ingen DB-kontakt/deploy.
- Riktad lint **PASS utan nya fel**, guide/test0; Home/Layout samma äldre10+1fel. Full lint/bred suite ej omkörd.
- Git-diff verifierad: enda src-fil YearEndGuide.tsx, exakt en textrad ersatt. Test plus handoff/bevis tillkommer.

Bevis **docs/testing/kan99-fictional-vat-local-20261022/**. Typ/build stöds av verifierade terminalutfall, resultat/lint sparas separat.
Kandidaten har ännu inte publicerats eller accepterats i Staging. Nästa steg efter nytt exakt SHA-godkännande:
verifiera rätt deployment/alias och det fiktiva exemplet på dator/mobil. Ingen momsinitiering/bokning/profilsparning behövs.
Ingen push, deploy, migration, live DB-skrivning eller Jira-mutation. KAN-99 kvar **In Review/Pontus**, inte Done.
