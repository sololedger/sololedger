# KAN-128 – lokal checkpoint och Staging-plan

2026-11-01. Pontus har godkänt lokal checkpoint enbart för KAN-128 och läsande
Staging-förberedelse. Ingen push, hosted migration, dataändring eller deployment
är godkänd i detta steg. Planen nedan är inte ett kör-GO.

## Kandidat och isolering

Gren: `codex/KAN-128-attachment-history`.
Förälder: `2ada7d0660e65f0b2d139a40cea32c78c3a01f85`.
Commitmeddelande: `feat(KAN-128): protect accounting attachments and preserve history`.
**C** nedan betyder den lokala commit som innehåller just denna fil och de övriga
18 filerna i listan; exakt SHA rapporteras efter commit i lokalt kvitto och STATE.

Checkpointens exakta 19 filer:

1. `package.json`
2. `scripts/check-db-regression-invariants.mjs`
3. `scripts/check-kan124-product-integrity.mjs`
4. `scripts/test-admin-delete-dry-run.ts`
5. `scripts/test-supplier-year-end-panel.mjs`
6. `scripts/test-kan128-attachment-ui.mjs`
7. `scripts/test-kan128-local-db.mjs`
8. `src/app/page.tsx`
9. `src/components/AccountingAttachmentHistory.tsx`
10. `src/components/CustomerInvoicesPanel.tsx`
11. `src/components/SupplierYearEndPanel.tsx`
12. `src/components/TransactionForm.tsx`
13. `src/components/TransactionTable.tsx`
14. `src/lib/adminDeleteDryRun.ts`
15. `supabase/functions/delete-user/index.ts`
16. `supabase/migrations/20261101213818_kan128_attachment_history.sql`
17. `tests/fixtures/kan128-live-contract.json`
18. `docs/reviews/KAN-128-LOCAL-IMPLEMENTATION-20261101.md`
19. `docs/reviews/KAN-128-CHECKPOINT-STAGING-PLAN-20261101.md`

`PROJECT_STATE.md` och `PROJECT_ARCHIVE.md` innehåller även tidigare arbete och
utesluts helt ur index/commit. STATE uppdateras lokalt; ingen del av äldre KAN-126-
verktyg, övriga 316 otrackade filer, env/auth, ignored evidens eller genererade filer
tas med. Ingen ny worktree, reset, clean, checkout eller lokal branchsynk görs.

A4/KAN-129: dator-/mobilvillkoret `!isNeutralized` är oförändrat. KAN-127: Edge-
funktionens enda diff är den nya tabellen i TABLES-räknaren. Stripe → Storage →
atomisk DB → restkontroll → Storage → Auth-ordningen är oförändrad.
`accountingService`, resultat-/NE-/moms-/SIE-motorer och gamla migrationer är
oförändrade mot föräldern. Ny SQL styr referenser/historik och utökar raderings-
wrappen; inga ekonomiska bokningsregler eller transaktionskällor tillkommer.

## Kontrollresultat inför checkpoint

- 44 lokala syntetiska DB-prov omkörda PASS, med rollback och identiska tidigare
  data-/Auth-/funktions-/ACL-avtryck. Två anslutningars årslåsgrind ingår.
- 22 offline-UI-prov omkörda PASS, dator/mobil. Typecheck, adminräknare,
  DB-invarianter och integritetskontrollens negativa prov PASS.
- De tre tidigare lokala publika smoke-proven och övriga regressionsdelar återanvänds
  från implementationsrapporten; ingen obruten full regressionskörning påstås.
- Ny migration SHA-256:
  `4b50eb38fbe7eef380760486e4468707cc0e8dd93b615477ad679e9db8bab9a2`.
  Utgångslägets delete_user_data_atomic MD5, utan CR:
  `f5f30e0a29e2d5f927d016890fc3f1f9`.
- Kandidatens 10 fångade funktionsberoenden matchar Stagings lästa definitioner.
  Den befintliga delete-delegaten och årslås-/datumhjälparna finns och matchar.

## Färsk läsande Staging-kontroll

Projekt `sololedger-staging`, ref `fzxqiqenqjzhlyxxpvhg`. Den etablerade Session
Poolern `aws-1-eu-central-1.pooler.supabase.com:5432`, användare
`postgres.fzxqiqenqjzhlyxxpvhg`, databas `postgres`, verifierad certifikatkedja och
TLSv1.3 till klienten. Samma backend-PID genom hela skrivskyddade lästransaktionen.
Poolerns interna backend visar ssl=false; detta är separat från den verifierade
TLS-anslutningen klient → pooler och användes inte för att sänka TLS-kravet.

- 72 migrationer, senast `20261031204304`. Repo innehåller 73; exakt EN väntande:
  `20261101213818_kan128_attachment_history.sql`. Ingen remote version saknas i repo.
- Inga KAN-128-objekt installerade. Privat attachments-bucket, aktiv RLS,
  10 MiB per fil och JPEG/PNG/WebP/PDF. 39 Storage-metadataobjekt.
- Policyhantering för postgres genom supautils.policy_grants och laddad
  session-preload verifierad. Inget ägarbyte eller rollgrant behövs.
- Raderingskontexten saknar authenticated-skrivrätt. Befintliga Storage-policies
  och ny SQL:s exakta raderingsförbild är lästa. Ingen faktisk DDL testad där.
- GitHub kontrollerad via `https://github.com/sololedger/sololedger.git`, inte
  produktkopians lokala origin: main=staging=föräldern ovan.
- Deployerad Staging `delete-user`: ACTIVE, version9, verify_jwt=true. Detta
  gatewaykrav ska bevaras; ingen --no-verify-jwt, annan funktion eller inställning.

### Stoppvillkor före installation: äldre referenser

| Domän | Referenser | Saknat Storage-objekt | Annan prefix än ägarmapp |
| --- | ---: | ---: | ---: |
| Transaktioner | 166 | 68 | 65 |
| Kundfakturor | 52 | 34 | 28 |
| Bokslutsskulder | 7 | 0 | 0 |

102 är **antal referenser**, inte bevisat antal förlorade filer. Prefixavvikelserna
är relativa andra sökvägar, inte URL:er, och ingår i saknade objekt. Även 3+6
referenser med eget prefix saknar objekt. Enkla testmarkörer förklarar inte
avvikelserna tillräckligt; kontona får inte antas vara syntetiska eller raderas.
Ingen faktisk dataförlust eller orsak är påvisad. Inga filbytes har lästs.

**Staging-publicering rekommenderas inte ännu.** Nästa läsande genomgång ska
knyta just avvikelserna till dokumenterade fixtures/berörda flöden och bedöma
kompatibilitet. Ingen rensning, omskrivning, backfill-reparation eller påhittad
bilagehistorik ingår. Om verkligt underlag eller nödvändig källa saknas: STOP för
Pontus beslut. Detta hindrar inte en isolerad lokal checkpoint.

## Installationsordning efter avklarat stoppvillkor och separat GO

1. Verifiera C, förälder, hela 19-filsdiffen och att GitHub staging fortfarande
   pekar på föräldern/kan fast-forwardas till C. Main lämnas oförändrad. Använd
   befintlig produktkopia, inte gammal origin eller en managed worktree.
2. Upprepa läsande projekt-/TLS-/ledger-/förbild-/bucket-/RLS-/policy-/grantkontroll.
   Motsvarande originalreferens- och objektinventering sparas före installation.
   Bara verifierade syntetiska testkonton och nya unika filnamn används i acceptans.
3. Exportera de 73 migrationsfilerna från **C:s Git-blobs** till en ny isolerad
   CLI-arbetsmapp; ingen env, auth, seed, roles eller vaultkonfiguration följer med.
   Ingen omlänkning av den befintliga arbetskopian. Kontrollera alla versioner och
   kandidatens råa bytes/hash. CLI 2.122.0 och flags har kontrollerats via --help.
4. Följ den beprövade DB-URL/PGPASSFILE-vägen med lösenordsfri TLS-URL i processminne,
   känd Staging-host/användare, skyddad befintlig pgpass och verifierad CA.
   Kör först följande **efter separat GO**, med maskerad anslutningslogg:

   ```powershell
   npx --yes supabase@2.122.0 db push --skip-vault --dry-run --output-format json --db-url $stageDbUrl --workdir $stageCliDir
   ```

   Kräv exakt kandidatfilen, roles=[], seeds=[] och dryRun=true. Ingen --include-all,
   --include-roles, --include-seed, history repair eller återspelning av gamla SQL.
5. Endast vid rätt plan körs samma kommando utan --dry-run, med --yes. Verifiera
   sedan exakt version `20261101213818`, antal72→73, alla nya grants/policies/FK/
   triggers/RPC-definitioner, observerad referenshistorik och oförändrade gamla
   källreferenser/Storage-metadata. SQL-fel/timeout: inga blinda omförsök.
6. Publicera endast delete-user från en ren export av C, med uttryckligt Staging-ref:

   ```powershell
   npx --yes supabase@2.122.0 functions deploy delete-user --project-ref fzxqiqenqjzhlyxxpvhg --workdir $cleanCandidateDir
   ```

   verify_jwt ska fortsatt vara true; version/code/räknare verifieras efteråt.
   Ingen --prune eller deployment av andra funktioner. Om nytt lokalt config behövs
   ska det bara återspegla detta verifierade JWT-kontrakt, utan hemligheter.
7. Publicera appen genom att flytta endast GitHubs staging till **C**, exempelvis
   explicit refspec `C:refs/heads/staging` mot rätt GitHub-URL, utan force/checkout
   eller flytt av lokala main/staging. Detta kräver separat push-/deployment-GO.
   Vercel Preview ska vara READY på C, projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`,
   team `team_0Mrj7LMvSEfpbV8y5juQ5IiL` och rätt Staging-Supabase. Verifiera ordinarie
   Staging-alias. Alla Production-alias ska vara oförändrade.

Appen publiceras sist eftersom den nya läsvyn/RPC:n behöver databasen. Ingen vanlig
kontoradering görs under mellanläget eller när komponenternas versioner är osäkra.

## Acceptans mot riktig Storage, endast verifierade syntetiska konton

| Prov | Förväntat och kontroll |
| --- | --- |
| Grundflöden | Ny egen PDF/bild, vanlig bokning, kundfaktura och bokslutsskuld fungerar med nya unika sökvägar. Giltiga äldre fixtures kan öppnas. |
| DELETE/UPDATE/upsert/move | Försök med vanlig användare och anon lämnar originalobjekt och bytes oförändrade. Kontrollera verklig kvarvaro/SHA-256, inte bara HTTP-status; DELETE kan ge tomt resultat utan fel. |
| Copy/ny uppladdning | Egen ny fil får skapas utan att ändra originalet. Främmande källa/mål nekas. En kopia blir inte bokföringsreferens utan godkänd koppling. |
| Byte/tillägg/nullning | Historiken anger användare/tid/källa; äldre bytes och referens bevaras. Direkt nollning/radering av referens stoppas; samma återförsök ger ingen dubbel historik. |
| Isolering | Konto B/anon kan inte läsa A:s historik, hämta signerad URL eller ändra A:s koppling. Inga service-nycklar i webbläsaren. |
| Rättelse | Originalrad/ref/historik finns kvar och filen kan läsas med ägd API-åtkomst. A4-knappfelet i vanlig dator-/mobilhistorik förväntas fortfarande kvarstå; det är inget A5-löfte om UI-fix. |
| Årslås/race | Låst år behåller läsåtkomst, nekar byte/tillägg/datumflytt även genom direkt RPC. Samtidigt lås och tillägg provas utan partiell historik. |
| Ekonomi/äldre flöden | Journal, moms, NE, bankbalans och betalnings-/rättelse-/SIE-flöden relevanta för fixture ska matcha före/efter rena bilageoperationer. Dator/mobil och gruppering av/på ingår. |
| Räknare/radering | Admin-dry-run räknar historia och alla gamla domäner. DB-atomens sena fel testas rollback-säkert, skilt från Storage-raderingen. Endast särskilt godkänt nytt disponibelt konto får slutligen raderas hela vägen. |

Nya årslås-/ekonomi-fixtures ska vara verkligt syntetiska och ligga i rätt avslutat
år för det befintliga kalender-/moms-/bokslutskontraktet. Gamla kvarvarande tester
eller vanliga Staging-konton får inte användas för negativa raderingsprov.

## Påverkan på befintliga flöden och KAN-127

Den vanliga uppladdaren skapar redan ett unikt nytt namn och använder inte upsert.
Riktad sökning hittar ingen vanlig klientradering/flytt av Storage-filer. Läsning
och normala nya uppladdningar får därför ingen avsedd beteendeförändring. Däremot
stoppas all vanlig orphan-städning, namnbyte/överskrivning och borttagning av en
källa med bevarad historik, även om källan är obokförd. Otillräckliga gamla
referenser kan stoppa äldre kopierande boknings-/betalningsvägar; därför spärren ovan.

Server/service_role kringgår Storage-RLS. **KAN-127 är kvar:** filer kan raderas
före en senare misslyckad DB-radering. A5:s historikåterställning återställer inte
Storage-bytes. Under acceptansen tillåts inga vanliga kontoraderingar. Slutprovet
kräver ett separat namngivet, disponibelt syntetiskt konto utan Stripe-prenumeration,
verifierad dry-run och säkrade syntetiska filbytes. Ingen Stripe-åtgärd ska ske.
Injicera inte ett sent DB-fel genom hela Edge-flödet; prova DB-rollback separat.
Ingen ändring av KAN-127-flödet eller ny automatisk backup behövs i denna kandidat.

## Stopp och återgång

- Fel projekt/SHA/TLS/ledger/förbild, oväntade beroenden, fel grants, okänd gammal
  referens eller påverkan på annan användare: STOP före nästa steg. Ingen fallback
  till Production, inga behörighetsgenvägar eller massrensningar.
- Om CLI misslyckas/timeoutar: läs ledger och faktisk katalog i ny lästransaktion.
  Fastställ vad som installerats innan beslut; anta inte att ingenting hände och
  kör inte migrationen igen bara för att kommandot misslyckades.
- Om DB-installationen lyckas men Edge/app/test misslyckas: behåll det skyddande
  DB-kontraktet/historiken, stoppa publicering och vanliga kontoraderingar. Appens
  tidigare version kan behållas; gamla säkra RPC-signaturer finns kvar. Att återgå
  med en deployment är en separat publiceringsåtgärd som måste vara godkänd.
- Ingen automatisk down-migration som släpper policies, raderar historik eller
  återöppnar filradering. En eventuell framåtriktad rättning granskas och får nytt GO.
- Efter verkliga verifieringar accepterar Pontus Staging. A4 och Production är
  fortsatt separata uppdrag/beslut. Supabase-status eller READY ensam är inte PASS.

## Beslut som återstår

Först förklara/avgränsa de 102 saknade äldre referenserna genom läsande underlag;
ingen datareparation är godkänd. Därefter behövs ett **uttryckligt GO för C på
Staging**: endast denna migrationsversion, delete-user-räknarens deployment med
oförändrad JWT-verifiering, staging-push/appdeployment, och specificerade syntetiska
Storage-/isolering-/låsnings-/raderingsprov enligt planen. Ingen Production-åtgärd.

Jira KAN-128 har lästs: Task/High/To Do, ingen assignee. KAN-129 och KAN-127 kvar
som separata ärenden. Inga Jira-mutationer utförs i checkpoint-steget.

Lokal läsevidens och scoped index-/commitkvitto:
`coverage/kan128-checkpoint-20261101/2026-11-01T22-19-52.271Z-273926ed-306f-41e7-8619-3ab4e0026bc5/`.
Historisk implementationsrapport behålls oförändrad. Denna plan kompletterar den.

**STOP efter lokal checkpoint och denna rapport.**
