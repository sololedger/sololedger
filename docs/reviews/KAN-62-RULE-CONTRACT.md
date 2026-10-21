# KAN-62 – lokal regelkontraktskandidat

2026-10-20. Ledarbeslut Jira-kommentar 11673 återläst. Ingen releaseacceptans.

## Kandidat och bevarande

- Vanlig separat lokal klon `audit-packages/KAN-62-rule-contract-local`, gren
  `codex/KAN-62-rule-contract`, HEAD/bas `d4320f5d6524216948904e0e58cae3a30ddd76fa`.
- KAN-62:s fyra kod-/testfilers ändringar från `8bb6a76~2..8bb6a76` har
  applicerats ovanpå aktuell releasekod. KAN-78:s laddningsskydd och
  KAN-104/105:s profil-/authskydd bevaras. Ingen generell KAN-65-import.
- Ursprungliga arbetskopior, deras dokumentändringar och båda redan tillämpade
  KAN-62-migrationer är orörda. Inga hemliga miljö-/credentialfiler kopierade.
- Klonens origin är en lokal arbetskopia, inte GitHub. Ingen commit eller push.

## Regelkontrakt och ändringar

- Mindre värde: anskaffningsutgift exklusive fakturamoms, strikt mindre än
  årets halva prisbasbelopp. 2026: 29 600 kr. Kostnad/aktivering inkluderar
  ej avdragsgill moms. 28 000 + 7 000 utan avdrag blir direktkostnad 35 000.
- Inklusivebelopp, vald 0/6/12/25-procentssats och härledd fakturamoms från
  KAN-62 behålls. Fakturabelopp med fler än två värdebärande decimaler stoppas
  på båda sidor; härledda moms-/exklusivebelopp avrundas fortfarande till ören.
- En ren gruppbedömning expanderar hela vald grupp, kontrollerar år/datum,
  summerar exklusivebelopp och tar hänsyn till känt planerat paketbelopp.
  Kända planer består vid senare köp; en äldre plans oklara momsgrund stoppas.
  Ingen automatisk gruppering över år eller mellan flera befintliga grupper.
- En uttrycklig uppgift om högst tre års ekonomisk livslängd sparas även under
  beloppsgränsen. Bekräftade korttidsinventarier ingår inte i senare
  mindre-värde-summor eller omklassificeringsbelopp. Förhandsvisningen anger
  tidigare kostnad som skulle omklassificeras, utan att godkänna allmän aktivering.
- Registerläsningen använder befintlig fullständighetskontroll med exakt antal,
  stabil sidordning, ägar-/årskontroll och kontroll mot dubbletter; gränsen 200
  får inte ge ett tyst ofullständigt paket i förhandsvisningen.

## Ny migrationsfil – EJ KÖRD

`20261020233000_kan62_rule_contract.sql` ersätter bara den privata
`book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)` och behåller dess
ACL. Ingen ändring av publik wrapper, KAN-54-profilskydd, KAN-75-årsgränslås,
tabellstruktur, RLS, borttagningslivscykel eller avskrivnings-RPC.

- Per användare/år serialiseras inventarieanskaffningarnas gruppändringar.
  Befintliga radlås, idempotens, betalningsroller och period-/årsspärrar behålls.
- Servern härleder beloppen och kräver samma gränsprövningsbelopp, tidigare
  delars ID:n och omklassificeringsbelopp som förhandsvisningen. Ändrat
  underlag kräver omladdning, inte tyst annan bokning. Exakta gamla
  idempotensomförsök returneras före det nya anropskontraktets kontroll.
- Tidigare delar knyts beständigt till gruppen även om de fortsatt är
  direktkostnadsförda. Ursprunglig journal och ursprungliga händelser ändras
  inte. Registermetadata får en tillagd `groupLinks`-historik med länk till
  det nya inköpet. Nytt beslut får audit-v3 och uttrycklig exklusivegrund.
- Äldre dokumenterad men ofullständig grupplänk stoppas tills samtliga delar
  valts uttryckligen. Ingen automatisk historikrekonstruktion/backfill.
- Befintlig omklassificeringsväg kvarstår men får inte flytta bekräftade
  korttidsinventarier. Ingen ny moms skapas av omklassificering.

## Bokföringens integrationsyta

| Yta | Påverkan / begränsning |
| --- | --- |
| Journal/RPC | Samma källor fixed_asset/fixed_asset_reclassification och konton 5410/1220/2641/betalningsroll. Nya anropskontroller, rättad gruppering och rätta belopp. |
| Moms/perioder/dashboard | Avdragsrätt, profilguard och periodspärrar bevaras. KAN-73:s rapportlucka är INTE löst och blockerar generell release med momsavdrag. |
| NE/resultat/balans | Befintlig journalbaserad R6/R10/B4-mappning används; beräkningsmotorerna ändras inte. Rätt direktkostnad påverkar resultat enligt befintlig väg. |
| Säkert uttag | KAN-97:s osäkra inventariekällor förblir blockerade; ingen ny klassificering eller automatisk acceptans införs. |
| Betalningar/fakturor | Endast redan betalda svenska köp via befintliga betalningsroller. Inga kundfordringar, obetalda leverantörsfakturor eller EU-varor införs. |
| Rättelser/SIE/årsslut | Generiska inventarierättelser är fortsatt spärrade. Ingen ny retur-/avskrivnings-/SIE-väg. KAN-76 kvarstår; avskrivningar/allmän aktivering ingår inte i acceptansen. |
| Ägarisolering/radering | Auth-härledd ägare, privata helpers och RLS bevaras. Samma tabeller/FK-ordning/delete-user-flöde; inga nya datadomäner eller eventtyper. |

## Lokal verifiering

- Befintliga inventariedomäntester och nya `test-fixed-asset-rule-contract.ts`:
  PASS. Gränser, avdrag/inget avdrag, alla momssatser, avrundning, år/datum,
  paketexpansion, beständiga planer, äldre osäker plan och kort livslängd.
- `test-fixed-asset-service.mjs`: PASS mot verklig service med syntetisk
  transport. 1 001 rader över två sidor, ofullständig/ägarmässig feldata,
  sparad plan, verifierad profil och nytt RPC-underlag. Inga nätverksanrop.
- `test-fixed-asset-panel.mjs`: PASS mot faktisk panel i lokal Chromium.
  28 000+7 000, exakt gräns, kort livslängd, välj B men inkludera A+B,
  omklassificeringsförhandsvisning och fel år. Bokningstransporten stoppar
  uttryckligen; detta bevisar inte databasbokning.
- Befintlig `npm run test:domain`: PASS efter att befintlig browserplats valts.
  Nytillagda service-/paneltester kördes separat grönt och ingår nu i skriptet.
- Lokal publik smoke: 2/2 PASS med syntetiska localhost-Supabaseinställningar.
  Inga inloggnings-/registrerings-/återställningsanrop skickades.
- Typkontroll utan incremental och riktad lint: PASS. DB-invariantkontroll:
  PASS. Inga dependencies/lockfiler ändrade. Inget produktionsbygge påstås.
- Installationen saknar `node_modules/next/dist/docs/`; officiell Next-guide
  för use-client lästes som fallback. Inga nya Next-API:er införs.

## Ej verifierat / nästa godkännande

**Ingen migrationsexekvering eller skrivande DB-testning är utförd**, inte
heller lokalt: uppdraget kräver ett nytt godkännande för detta steg.
SQL-filens syntax, verkliga RPC-resultat, RLS och samtidighet är därför inte
körverifierade. `supabase/tests/kan62_rule_contract_candidate.sql` är förberedd
för en särskilt godkänd syntetisk lokal databas, kräver localhost, namnprefix
`sololedger_kan62_` och sessionsflagga `sololedger.kan62_test_approved=yes`.
Den applicerar inga migrationer och slutar med ROLLBACK. Kör den inte mot
Staging/Production. Den täcker journalbelopp/balans, replay, successiva delar,
ursprunglig journal, planer, kortliv, år, fel profil/ägare, RLS och rättelsespärr.

Nästa steg är ledargranskning av hela kandidatdiffen. Därefter behövs separat
godkännande av en exakt isolerad lokal migrations-/SQL-testplan, inklusive
samtidiga anskaffningar och stängd momsperiod. Godkänn sedan separat eventuell
Staging-publicering. Production har INTE fått de två äldre KAN-62-migrationerna;
releaseurval och klient/RPC-kompatibilitet måste granskas före någon publicering.

Representativ acceptans före Staging respektive Production: verifiera svensk
betald anskaffning, journalens 5410/1220/2641/betalning, rapportmoms, NE/resultat,
dashboard/uttagsblockering, gruppspårning och rättelsespärr. Tre successiva delar
och två samtidiga försök ska inte tappa eller dubbelräkna någon del.
Avskrivningar, returer och årsskiftesgränsfall får inte anses accepterade av detta.

Jira är endast läst. Befintlig In Review-status är inte ny acceptans. Ingen
commit, push, deploy, Edge-publicering eller live DB-skrivning utförd.

## Exakt filinventering (12 ocommittade filer)

- PROJECT_STATE.md
- docs/reviews/KAN-62-RULE-CONTRACT.md
- package.json
- src/lib/fixedAssets.ts
- src/lib/accountingService.ts
- src/components/FixedAssetsPanel.tsx
- scripts/test-fixed-assets.ts
- scripts/test-fixed-asset-rule-contract.ts
- scripts/test-fixed-asset-service.mjs
- scripts/test-fixed-asset-panel.mjs
- supabase/migrations/20261020233000_kan62_rule_contract.sql
- supabase/tests/kan62_rule_contract_candidate.sql
