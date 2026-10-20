# KAN-88 – lokal NE-klassificering, 2026-10-17

## Beslut och status

Pontus har godkänt lokal implementation, syntetiska tester och lokal checkpoint. Omfattningen är vanlig svensk 3010-försäljning med belagt småföretagarundantag. Det beslutade NE-utfallet är R2. Vanlig momspliktig försäljning behåller R1. Avsaknad av debiterad moms är inte ensam grund för R2. Denna implementation gör ingen ny allmän regel-/NE/K1-granskning.

Arbetskopia: `C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user`; branch `codex/KAN-88-ne-sales-classification`, bas `656580a23b4abd2dc776a6ff46878627afcd73ad`.

**Endast lokalt.** Migrationsfilen är inte applicerad på Staging eller Production. Ingen push, deploy, Jira-ändring eller verklig dataklassificering har utförts. Produktmål och prioriteringar: AGENTS.md, Produktmål / Arbets- och prioriteringsprinciper.

## Ändringar

- `supabase/migrations/20261017122027_kan88_ne_sales_classification.sql`: ny separat tabell `ne_sales_classifications`. En oföränderlig applikationsklassificering per journalrad, kopplad till ägare, transaktion, R1/R2, grund, tid, beslutsfattare och underlag. Ingen automatisk backfill. Journal-/transaktionskonton behålls.
- `book_transaction_atomic` får ett privat anrop efter sin befintliga journalvalidering. Bekräftad vanlig svensk småföretagsförsäljning på 3010 + matchande profil + 0 % + inga motstridiga momsrader ger R2. Positiv svensk moms och momspliktig profil ger R1. Otillräckliga fakta ger inget sparat beslut. Klienten bekräftar uttryckligen att undantaget gäller försäljningen på angivet datum, före filuppladdning/bokning.
- Fakturatrigger vid ny `payment_same_year` / `year_end_receivable` använder fakturans sparade momsbehandling och fångade profilunderlag, SE/SEK och matchande 3010-journal. Senare profilbyte används inte vid NE-visning. Settlement skapar ingen ny intäkt och ingen R2-flytt.
- Rättelse-/ångertrigger ärver den ursprungliga klassificeringen endast vid en unik, ägarsäker spegelrad på 3010. Den signerade NE-flytten följer rättelsens bokföringsår. Tvetydiga matchningar gissas inte.
- `get_ne_sales_summary(year)` läser årssaldon och klassificering i samma SQL-snapshot. Summeringsdefinitionen följer befintlig `get_period_account_balances`. Bara NE-adaptern flyttar belopp: R1 minus / R2 plus samma belopp. Resultatmotorn, R11–R17 och kumulativ B10-logik är oförändrade.
- `neSalesClassification.ts`, `accountingService.ts`, `page.tsx`, `NEBilaga.tsx`: adapter, indata och tydlig varning om 3010-rader utan moms saknar klassificeringsunderlag. Beloppen ingår fortfarande i resultatet; R1/R2 anges som preliminära. Saknad migrations-RPC ger gammal kontomappning med varning, inte ett verifierat resultat. Andra läsfel döljs inte som godkänt underlag.
- Raderingslivscykel: explicit metadata-radering/räknare i `delete_user_data_atomic`, motsvarande Edge dry-run/restkontroll och UI-räknare. FK-cascade finns som kompletterande relation. Inga andra raderingsregler ändras.
- Paketets domäntester inkluderar NE-adaptern; `test:kan88:db` kör den isolerade lokala rollback-verifieringen. Övriga teständringar gäller submit-bekräftelse, raderingskontrakt och senaste migrationsdefinition.

## Äldre försäljning och Jessikas två fakturor

`review_ne_legacy_sale(journal_entry_id, ne_row, evidence_note)` är en förberedd, ägarsäker RPC för **en uttryckligt granskad befintlig 3010-intäktsrad åt gången**. Den behöver en konkret underlagsanteckning. Fakturakoppling, fakturadatum, momsbehandling och sparat profilunderlag bevaras även i klassificeringens evidens när fakturan är länkad. En nuvarande profil används inte som historiskt bevis.

RPC:n skriver endast i `ne_sales_classifications`. Den skapar/ändrar inga `transactions`, `journal_entries`, `customer_invoices`, `customer_invoice_bookings` eller verifikationsnummer. Den stöder både kundfakturabokning och KAN-51:s `historical_payment_same_year` till en redan bokförd manuell verifikation. Ingen ny fakturalänk krävs när den redan finns.

Jessikas faktiska två poster har inte lästs, klassificerats eller ändrats. Efter separat godkännande måste exakt ägare, faktura/bokningskoppling, 3010-rad, år och underlag för småföretagarundantag vid försäljningen verifieras. Därefter kan en granskad klassificeringsrad per relevant intäktsrad sparas och NE före/efter jämföras. Ingen ny bokföring eller korrigeringsverifikation ska skapas för detta.

Avgränsningar: inga massuppdateringar, inga redan låsta år, importer, redan klassificerade rader eller original med befintlig rättelsekedja; motstridig bokförd moms nekas för R2. Dessa fall kräver separat beslut. Ingen ny gransknings-UI byggs här; den förberedda vägen är en uttryckligt godkänd, avgränsad RPC-operation. Sparade beslut kan inte skrivas över via klienten. SIE-formatet utökas inte: klassificeringsmetadata följer inte med enbart en SIE-export.

## Integrationsyta och säkerhet

| Yta | Kontrollerad påverkan |
| --- | --- |
| Journal, konton, transaktionskällor | Samma konton/journalvalidering och källor. Ny metadata skapas atomiskt vid relevant bokning. Ingen ny source. |
| Moms, perioder, dashboard, uttagsutrymme | Ingen ändrad beräkningsväg. Oförändrade journaler/saldon; befintliga domän-/UI-tester passerar. |
| NE, resultat, balans | Endast R1/R2-fördelning ändras. Årssaldon och NE-justering läses tillsammans; övriga NE-fält jämförs före/efter i riktiga konsumenten. |
| Betalning, kundfordran, årsskifte | Samma-årsbetalning och årsslutsfordran använder intäktsåret; senare settlement/ånger flyttar ingen intäkt. |
| Rättelser/ångring | Ärver sparad grund, inklusive granskad äldre post; profilbyten påverkar inte gamla beslut. |
| SIE, andra konton/källor | Ingen automatisk R2-klassificering av SIE/export/omvänd moms/andra konton; befintlig mappning behålls. Osäkra 3010-rader utan moms varnas. |
| Användarisolering | RLS egen SELECT; inga direkta klientskrivningar. Privata helpers saknar authenticated/PUBLIC-exekvering. Publik gransknings-RPC kontrollerar auth.uid, ägare, post och underlag. |
| Radering | Metadata raderas före journal/transaktion, explicit räknare och Edge dry-run/restkontroll uppdaterade. Befintliga skydd/context behålls. |

Före ändring lästes live-definitioner, relevanta triggers, constraints, RLS/grants och fakturaflöden skrivskyddat. De två ersatta RPC-kropparna jämfördes mot de lästa live-definitionerna: bara avsett NE-anrop respektive metadata-radering/räknare tillkommer (tomrader normaliserade). Inga befintliga tillämpade migrationsfiler ändras.

## Lokal verifiering

- `npm run test:kan88:db` PASS. Fail-closed localhost/namngiven befintlig isolerad DB, syntetiska ägare, migration + tester i en transaktion, alltid rollback. Ingen persistent lokal DDL/testdata; före/efter-census och ursprunglig bokningsdefinition identiska.
- Databastest: bekräftat undantag R2, saknad bekräftelse nekad, momspliktig manuell bokning/faktura R1, annan nollmoms utan bevis flyttas inte och varnas, profilbyte, rättelse, samma-årsbetalning/ånger, årsslutsfordran + nästa års settlement/ånger, två äldre fakturor varav en KAN-51-länk, senare ånger av granskat beslut, låst år, rättad originalpost, dubblett, ägarisolering, faktisk authenticated-RLS och nekade direkta insert/update/delete/privata helperanrop, atomär radering/räknare/inga restposter.
- Exakt JSON-jämförelse före/efter klassificering av de två äldre testfakturorna: samtliga transaktioner, journalrader, fakturor, bokningskopplingar och verifikationssekvens identiska. Bara separat NE-metadata tillkommer.
- Verklig `getNEData` med lokala RPC-resultat: endast R1 −2000 / R2 +2000 i äldre-fakturatestet; alla övriga NE-/resultat-/balansfält identiska. Alla kontosaldon inklusive moms identiska. Renderad riktig NE-komponent: varning vid osäkerhet/saknad migration och ingen sådan varning när underlaget är komplett.
- `npm run test:domain` PASS; efter utökning av submit-testet kördes det ändrade testet separat och passerade. `test:admin-delete-dry-run`, `test:db-invariants`, typecheck PASS.
- Säkra regressionssvitens samtliga delar PASS, körda som delkommandon: domain, history-groups, history-presentation, history-ui, history-presentation-ui, ui-round, public-auth smoke (2/2). Ingen hosted/write E2E kördes.
- Public smoke använde webpack (redan dokumenterad Turbopack/worktree-begränsning). Första försöket saknade lokal Supabase-konfiguration; en avgränsad omkörning med syntetisk processlokal localhost-konfiguration passerade. Inga miljöfiler eller riktiga nycklar kopierades/lästes.
- `next build --webpack` PASS med syntetisk processlokal URL/anon/server-nyckel. Första försöket saknade servernyckel vid sidinsamling; en omkörning efter verifierad orsak passerade. Ingen API-postning eller deploy.
- Fokuserad lint PASS för nya filer, NE-komponent, adminadapter och testfiler. `accountingService.ts` har 0 lintmeddelanden. `page.tsx` har 13 fel + 1 varning som redan fanns i HEAD; regel/meddelande jämfördes med basversionen, inga nya. Full lint är alltså inte grön och äldre skuld har inte byggts om inom KAN-88.

## Nästa godkända steg / releasegräns

Lokal implementation och riktad verifiering är klara; **inte verifierad på Staging ännu**. Risknivån vid publicering är förhöjd eftersom detta rör deklarationsfördelning och DB/RPC:er, även om journal/resultat inte ändras.

Efter nytt uttryckligt ledargodkännande: verifiera exakt migrationsbas/definitioner på Staging; applicera enbart denna nya migrationsversion via etablerat officiellt CLI-flöde; publicera motsvarande frontend och delete-user Edge-ändring; kontrollera exakt version, RLS/grants och raderingsräknare. Återspela inte gammal migrationskedja och blanda inte in held Staging-arbete.

Liten Staging-checklista med dedikerad testanvändare: en undantagen manuell försäljning + en undantagen kundfaktura, journal/VAT/dashboard oförändrade enligt förväntan, NE R2, profilbyte, ånger/rättelse och årsskifte; granska en redan bokförd syntetisk faktura utan bokföringsändring; annan användare ser inget. Pontus kontrollerar svensk bekräftelsetext och preliminärvarning. Production och Jessikas verkliga historiska klassificering kräver egna uttryckliga beslut. Ingen Jira-statusändring ingår i denna leverans.
