# SoloLedger Project State

Updated 2026-10-17: KAN-88 implemented and verified locally. Local checkpoint authorized; no hosted migration, push, deploy, Jira mutation or real invoice classification authorized.

## Produktmål och faktisk leveransstatus

- Jessikas fungerande årsflöde är första prioritet. Permanenta produktmål och arbetsprinciper finns i AGENTS.md, Produktmål / Arbets- och prioriteringsprinciper. Hänvisa till dem vid handoff.
- Senast verifierad/av Pontus accepterad Production: KAN-85/64/67/68 Done, release `2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340`. KAN-88 är ännu bara lokalt och inte levererat till användare.
- KAN-88 har nu uttryckligt implementationsbeslut: vanlig svensk 3010-försäljning med belagt småföretagarundantag ska till NE R2. Ingen generell NE/K1-omgranskning eller ommappning av 3010.
- Nästa steg: ledarbeslut om avgränsad Staging-publicering/migration. Jessikas två verkliga fakturor kräver ett separat godkännande och verifierat historiskt underlag innan klassificering.

## Arbetskopia och Git

- Använd endast befintlig `C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user`.
- Aktiv branch: `codex/KAN-88-ne-sales-classification`, skapad från lokala dokumentationscheckpointen `656580a23b4abd2dc776a6ff46878627afcd73ad`. Lokal KAN-88-checkpoint: använd `git log -1` för exakt SHA efter commit.
- Bevarad kontobytes-handoff `8ebad907cb144da97ccc87a9a79131570b16fb49` finns i historiken, efter Production `2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340`. Båda äldre lokala dokumentationscommits följer med denna branch; ingen push har gjorts.
- Desktop-repot/common Git är en äldre smutsig staging-arbetskopia. Använd inte dess källkod eller PROJECT_STATE som aktuell handoff. Inga andra arbetskopior har ändrats eller städats.
- Checkpoint omfattar endast KAN-88-kod, ny migrationsfil, riktade tester och dokumentation. Ingen lockfil, auth-/miljöfil eller genererad fil ska ingå. Kontrollera status före nästa känsliga steg.

## KAN-88: implementation och evidens

- Detaljer, ändrade filer, integrationsyta, tester, begränsningar och Staging-checklista: [docs/reviews/KAN-88-local-ne-classification.md](docs/reviews/KAN-88-local-ne-classification.md).
- Ny **oapplicerad** migrationsfil: `supabase/migrations/20261017122027_kan88_ne_sales_classification.sql`. Separata beständiga NE-beslut per 3010-journalrad; ändrar inga historiska journaler/konton. Grund, underlag och ägare sparas.
- Nya manuella bokningar kräver uttrycklig bekräftelse av vanlig svensk försäljning/undantag på angivet datum; servern kontrollerar profil, journal och moms. Relevanta fakturor använder sparat fakturaunderlag. Rättelser/ångring ärver originalets klassificering. Profilbyte flyttar inte gamla beslut.
- Endast `getNEData` omfördelar R1/R2 med lika stort motbelopp. Resultatmotor, totalresultat, övriga NE-rutor, moms, balans och dashboard ändras inte. Osäkra 3010-rader utan moms och saknad migration visas med tydlig preliminärvarning.
- `review_ne_legacy_sale` är en förberedd, ägarsäker enpostsväg med granskat underlag. Sparar bara NE-information, även för KAN-51:s historiska fakturalänk. Ingen massuppdatering, inget nytt VER/journal/transaktion. Nekar låst år, dubblett, import, rättelsekedja och motstridig moms. Ingen ny gransknings-UI ingår.
- Jessikas två verkliga fakturor har inte lästs eller ändrats. Två syntetiska redan bokförda fakturor (inklusive historisk manuell länk) verifierades: alla transaktioner/journaler/fakturor/länkar/verifikationsnummer identiska före/efter; R1 −2000 / R2 +2000, alla andra NE-/resultat-/balansfält identiska.
- Ny tabell har RLS egen läsning, nekade direkta klientskrivningar och privata helpers. Ordinarie atomär användarradering samt Edge dry-run/restkontroll och UI-räknare är uppdaterade och lokalt testade.
- Live DB-definitioner lästes skrivskyddat före RPC-ändring. Två ersatta definitioner jämförda: endast avsedda NE-tillägg. Inga hosted Supabase-skrivningar.
- Lokal rollback-DB/RPC + riktig NE-konsument/rendering PASS; domänsvit, submit-bekräftelse, admin-delete, DB-invariants, typecheck PASS. Alla säkra regressionsdelar PASS; public smoke 2/2 med webpack och syntetisk processlokal konfiguration. Build med webpack PASS med syntetisk byggkonfiguration.
- Fokuserad lint PASS. Huvudvyns 13 lintfel + 1 varning verifierat identiska med HEAD; full lint inte grön. Ingen ny bred lintstädning. Tidigare Turbopack/worktree-begränsning kringgås med dokumenterad webpack-väg. Inga miljöfiler ändrade.
- Hosted/write E2E, Staging och Production är inte verifierade för denna ändring. Klassificeringsmetadata ingår inte i enbart SIE-export. Redan klassificerade beslut kan inte skrivas över; mer komplicerad historik kräver separat beslut.

## Extern status och nästa säkra steg

- Senast verifierad GitHub main/Production `2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340`, Production Supabase `wbaxmuvudpnkvuliicuy`. Lokal refs/heads/main är äldre och får inte antas vara Production. Ingen extern release-/refuppdatering gjord i KAN-88.
- Remote staging senast dokumenterad `5809094dd3ce808dba35986c65e772b842f0d0e1` med held KAN-62/65; inte godkänd releasebas. Staging Supabase `fzxqiqenqjzhlyxxpvhg`. Verifiera exakt bas vid separat publiceringsbeslut, utan att blanda in held arbete.
- KAN-88 senast läst To Do/unassigned; ingen Jira-ändring gjord. KAN-89 To Do, inte valt för implementation. KAN-85/64/67/68 Done enligt Pontus acceptans. Jira är kö/status, inte bevis för implementation/regler.
- Efter godkännande: granska/applicera bara den nya migrationsversionen via officiellt CLI-flöde, publicera motsvarande frontend + delete-user Edge, verifiera version/RLS och kör liten dedikerad Staging-checklista i granskningsrapporten. Ingen replay av historiska migrationer. Production och verklig historisk klassificering har separata godkännanden.
- Stanna nu för ledarbeslut. Ingen push, deploy, hosted DB-skrivning, Jira-ändring eller klassificering av Jessikas data är godkänd.

## Bevarande och äldre historik

- Bevara alla befintliga arbetskopior, smutsiga filer och ignorerat lokalt material. Ingen cleanup/reset/prune/archive/restore/ny worktree är godkänd; automatisk cleanup är inte verifierat avstängd.
- Tidigare 17 dokumenterade arbetskopior blev 16 efter Codex startup-cleanup av `kan63-staging-integration` omkring 13:12 svensk tid 2026-10-17. Branch/snapshot bevarar `30e82adf9d2868e0e1f1c028b433bc11aa9a7ff7`; ingen konkret förlust av unik kod belagd, ignorerade filer osäkra. Utredningen är avslutad; gör inte om den utan nytt skäl.
- Nio andra arbetskopior har dokumenterat dirty/untracked arbete. Desktop har bland annat audit-packages/ och lokal användarskriptfil; migrationsprep har ocommittade KAN-62-filer. Exakt inventering och metadatareceipt finns i PROJECT_ARCHIVE.md; ändra inte dessa arbetskopior.
- Ignorerade auth-/miljö-/pgpassfiler är inte Git-backup. Inga hemligheter eller privata fakturor har lästs/kopierats/hashats. Befintlig privat Staging-PDF får inte användas som testfixture.
- Tidigare accepterad UI-/livscykelevidens: docs/reviews/KAN-85-64-67-68-local-verification.md och PROJECT_ARCHIVE.md. Återanvänd befintlig NE/K1-historik enligt produktprinciperna. Aktiv KAN-88 hålls här och i sin granskningsrapport; ingen förtida arkivering eller ny generell revision.
