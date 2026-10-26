# SoloLedger Project State

2026-10-26 – KAN-112 lokal kandidat. Ingen Staging/Production-publicering.

## Aktuellt uppdrag och arbetskopia

- KAN-112: godkänd UX och lokal implementation av årsavslut med sparad checklista.
- Kopia: audit-packages/KAN-100-app-release-20261024.
- Gren: codex/KAN-112-year-end-checklist. Bas 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e.
- Lokal scoped checkpoint enligt git log; inga senare orelaterade produktcommits.
- Origin är lokal KAN-62-kopia, inte GitHub. Ingen push utförd.
- Root och andra arbetsgrenars tidigare ändringar/fixtures är bevarade.
- KAN-110/KAN-111 är enligt tidigare release och återläst Jira Done.
  Äldre LOCAL-läge här är ersatt; se arkiv och releasearbetsgrenen.

## Kandidat

- Befintlig Årsavslut: fyra delar, elva manuella kontrollpunkter och navigation.
- Permanent autosparande per ägare/år; avmarkering och omkontroll utan automatisk radering.
- Systemstatus skiljs från manuella svar. Ingen grön komplett-bokslut-status.
- Avgränsade kontrollvärden för profil, bank, fakturor, inventarier, moms,
  rapportunderlag och betalningar. Kundfaktura ger inte varning på alla punkter.
- Ny tabell year_end_checklist, egna SELECT-policyer, explicit begränsade grants,
  ägarhärledda RPC:er med revision och återspelningsbar sparbegäran.
- Befintlig raderingsgräns utökad med antal/radering/restkontroll; Edge räknar tabellen.
- Migration: 20261026092741_kan112_year_end_checklist.sql, endast ny fil.
- SHA256: 4ee37317959b7b68758f98776c347a646c62ca43e7ce5ac84c18c7e3fa4c64a5.
- FAQ, NE-historik, momsberäkning, journal och årslåslogik är oförändrade.

## Verifiering

- Typkontroll och riktad lint PASS. Home/Layout: inga nya baselinefel.
- Hela säkra test:regression PASS, inklusive publik smoke 2/2 med uttrycklig
  syntetisk localhost-konfiguration, inga riktiga authkonton/fjärrdata.
- Faktiska Home/Layout/guide/store: Playwright 1440/390 px PASS med syntetisk
  checklisttransport och nekade externa anrop. Ägar-/årsbyte, återbesök,
  nätverks-/läsfel, avmarkering, omkontroll och målvyernas återgång täcks.
- Faktisk klienttransport: profilgeneration, session, ägare/år och felhantering PASS.
- Lokal PostgreSQL17, sololedger_kan62_disposable_20261021, 127.0.0.1:5432,
  OID57199 och tidigare unik syntetmarkör kontrollerade före SQL.
- 12 DB-testgrupper PASS: RLS/ACL, två ägare/år, replay, stale-write/basis,
  separat konkurrerande session, verklig syntetisk bokning, riktad ändring,
  låst år, 50001-radersgräns, radering/antal/restkontroll och exakta datadigester.
- Lokala DB:n saknar KAN-100. Dess publicerade beroendemigrationer och KAN-112
  provades endast inom ROLLBACK; inget installerades permanent.
- Befintlig test:db-invariants ger samma statiska årslås-delegatfel som
  oförändrad produktbas. Raderingskontrollen följer nu nya wrappern med
  originalkontroller bevarade. Se rapport för avgränsning; inget fel dolt.
- Full app–hosted RPC, faktisk ny authsession och två hosted browserflikar
  återstår på Staging. Lokala lager är verifierade var för sig.

## Dokumentation och Jira

- Rapport: docs/reviews/KAN-112-LOCAL-IMPLEMENTATION-20261026.md (exakt fillista).
- Bevis: coverage/kan112-local/db-result.json, coverage/kan112-browser/,
  coverage/kan112-final-regression.log och coverage/kan112-final-lint.log.
- KAN-113 Bug/To Do skapad på uttryckligt uppdrag efter dubblettsökning.
  Ingen reproduktion/rättning av pågående/framtida årslås ingår.
- KAN-112 status/assignee/kommentarer har inte ändrats. KAN-102/KAN-109 separata.
- Inga hemligheter eller riktiga användaruppgifter i nya filer.

## Nästa säkra steg

Pontus granskar lokal kandidat. Begär separat exakt godkännande för migrationen
på Staging fzxqiqenqjzhlyxxpvhg samt app- och delete-user Edge-publicering.
Kontrollera aktuell Staging-preimage/ledger; schema före klient/Edge.
Därefter syntetisk hosted acceptans med separat kohort, befintliga fixtures kvar.
Ingen push, fjärrmigration, deployment, Production eller årslåsrättning är godkänd.
