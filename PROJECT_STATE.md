# SoloLedger Project State

Avstämt 2026-10-22. **KAN-98 LOCAL PASS; Jira In Review, Pontus.**
Permanent regelbok: AGENTS.md. Detaljer och testbevis: docs/reviews/KAN-98-LOCAL-PASS.md.

## Aktuell kandidat

- Produktkopia audit-packages/KAN-62-rule-contract-local.
- Gren codex/KAN-98-supplier-year-end, bas 3e7aa0c85aabdb624b687f48f0662278de217242.
- Den lokala checkpoint som innehåller denna state är implementationskandidaten.
- Origin är lokal KAN-97-kopia, inte GitHub. Root är aldrig produktreleasebas.
- Liten guide för svenska helt obetalda bokslutsfakturor, senare full betalning och auditerade
  rättelser. KAN-99 förbereds med lästjänst/statuslista; full årsavslutsguide återstår.
- Ny migration 20261022120000_kan98_supplier_year_end.sql, endast isolerat lokalt applicerad.
  Inga Staging-/Production-skrivningar, pushar eller deployer inom KAN-98.

## Verifierat

- DB/RPC 32 kontroller PASS: journal/moms/IB/årslås, replay, samtidighet, rättelser,
  isolering/grants och raderingslifecycle. Tidigare ägares data oförändrade.
- Rapportadapter 42 kombinationer PASS, tjänst 1 001 fakturor PASS, Reactpanel 16 PASS,
  slutlig Home-återhämtning desktop/mobil PASS. Säker regression och publik smoke 2/2 PASS.
- Typecheck, riktad lint, slutbygge, admin-delete dry-run, DB invariants och lifecycle PASS.
- Vid avslut endast logg-/statuskontroll och dokumentationscheckpoint, ingen testomkörning.
- Bevarade credentialfria loggar/bilder/DB-resultat: docs/testing/kan98-local-2026/evidence/.
- Syntetisk lokal DB sololedger_kan62_disposable_20261021, 127.0.0.1:5432, OID57199.
  Exakt tidigare identitet verifierades före skrivningar. Inga reset eller gamla fixture-raderingar.

## Gränser och nästa steg

- Staging-publicering och migration kräver separat godkännande för exakt kandidat + Edge-räknare.
  Kontrollera liveförutsättningar och migrationsidentitet; använd inte root eller gammal kedjereplay.
- Hosted Auth/RPC/UI-acceptans återstår. Full repo-lint påstås inte grön.
- Faktisk momsavslutning 2026 är ännu framtidsspärrad; samma flöde provat för avslutat 2025.
  Ingen deklaration eller NE-inlämning. Lokal faktisk årslås-/betalningskedja PASS.
- Endast svenska SEK-kostnader, hela fakturor/full betalning och full/ingen styrkt avdragsrätt.
  Kredit/delbetalning/utland/inventarier/osäker moms stoppas. Bankroll 1930 krävs.
- KAN-98 ändrar inte tidigare Bokio-/inventarieprov eller Jessikas konto.
- Root PROJECT_STATE.md innehåller senast verifierad extern release och bevarade testkonton.
  Äldre lokala UX-anteckningar är supersederade; kort historik i PROJECT_ARCHIVE.md.
