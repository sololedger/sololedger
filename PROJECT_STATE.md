# SoloLedger Project State

Uppdaterad 2026-10-19. **KAN-104 lokalt rättad och verifierad ovanpå KAN-78. Production BLOCKED tills Pontus granskat och exakt gemensam release godkänts.**

## Aktiv kandidat och nästa säkra steg

- Arbetskopia **audit-packages/KAN-104-source**, gren **codex/KAN-104-profile-context**. Lokal checkpoint: `fix(KAN-104): bind profiles and writes to verified auth context` (exakt SHA med `git log -1`; state ingår i commiten).
- Bas **67d314a95f9f964aa2adabce81e3cf799366eb3f**, ren KAN-78-kandidat ovanpå **0db6fe8** och aktuell GitHub-main **e7f1442921338bc3983a96ae75a4aaeca4bc8bcd**, återverifierad direkt under uppdraget.
- Inga commits från pausad Desktop-staging/KAN-62/65 integrerade. Endast profilspärr i befintlig inventariepanel/tjänst, ingen inventarieutveckling.
- **Nästa steg: Pontus ledargranskar lokal diff/rapport och godkänner i så fall separat gemensam Preview-publicering.** Testa där profilrace, B-namnsparning, B-köp/journal/moms/NE/dashboard och KAN-78-återupptagning. Ingen ny publicering är godkänd.
- Gemensam framtida release ska innehålla exakt main e7f1442 + KAN-78 0db6fe8/67d314a + KAN-104-checkpointen. Använd inte gamla staginggrenens inventariekedja som integrationsbas.
- Origin i denna klon är den **lokala KAN-78-source-kopian**, inte GitHub. Ingen push här eller till dess origin. Inga main/staging-grenar flyttade.

## KAN-104 – rotorsak och rättning

- `useAuth` saknade ägar-/sekvenskontroll och behöll gammal profil under byte. Sena ordinarie/bakgrunds-/retry-svar kunde vinna; DB-fel ignorerades. Profilformuläret skickade även gamla momsinställningar när endast namn ändrades.
- Gammal hostad kandidat omreproducerad 1280/390: B fick A:s quarter/full och en namnsparning följdes av 250 i stället för 0 kr ingående moms på köp 1 250 kr. Ingen Production-incident eller serverbehörighetsöverträdelse bekräftad.
- Ny ägarbunden profilgeneration invalidieras synkront vid auth-event, omladdning, logout och cleanup. Profilen töms under laddning; missing/error/ofullständig/fel ägare stoppar UI och skrivningar.
- Profilformulär och Home-utkast nollställs vid rätt kontextbyte. Sparning kräver verifierad session, pinnad Authorization och exakt ägarrad. Sparad profil läses om; utkast blir inte betrodd profilstate.
- Standard-/periodiserad bokning, VAT V2, profilberoende fakturaunderlag och inventarieanskaffning får samma sessions-/generationsspärr. Befintliga bokföringsregler, payloads, källor och idempotens bevaras.
- Live Staging-RPC/profil-RLS/grants/constraints granskade läsande. Databasen använder auth.uid() och sparad ägarprofil. **Ingen migration behövs för den verifierade felvägen; ingen schema-/RPC-definition ändrad.**
- Full rotorsak, integrationskarta, exakt fil-/funktionslista och testmatris: **docs/reviews/KAN-104-profile-context.md**.

## Verifiering och testmiljö

- Permanent `test:profile-context` PASS: A→B, A→B→A, samma ägares samtidiga hämtningar/sena fel, logout/unmount, profilfel/ofullständig/fel ägare, namnsparning, korrekt B-avdrag, fel verifierad identitet, gammal skrivcallback/RPC och pinnad begärandeägare. Ingår i test:domain/regression.
- **npm run test:regression PASS, exit 0**: hela säker regression inklusive KAN-78 laddnings-/panelprov, historik/presentation, UI-rundor, publik smoke 2/2, kategoriskydd och standardbokning desktop/mobil med/utan ekonomiskt läsfel.
- **TypeScript PASS, optimerad webpack-build PASS, riktad lint för useAuth/nya filer PASS.** Full lint har äldre fel: 75/6 mot basens 82/7; inga ökade regel-/filantal. Ingen bred lintstädning.
- **Permanent riktig Staging-integration PASS 1280/390:** lokal app → verkliga cross-tab auth-event/fördröjda profilsvar → B namnsparning → verklig bokning. B behåller month/none; journal 5420 debet 1 250, 1930 kredit 1 250, ingen 2641. Årsbalans och NE-underlag har samma korrekta delta.
- Testbackend strikt **fzxqiqenqjzhlyxxpvhg**. Ingen deploy: appen testades lokalt, den gamla hostade Preview-kandidaten är fortfarande felaktig. Ny hostad klient behöver separat publiceringsgodkännande och omtest.
- Syntetiska A **535a8629-d554-4467-b1bb-85d4002b0738**, B **3974c719-c171-4ec0-add6-0b3ad1fe9fde** återanvändes efter datainspektion. Testprofilerna efterkontrollerat återställda. A 4/B 9 transaktioner efter prov; inga tidigare verifikationer raderade/omskrivna.
- Permanenta journalbevis desktop **d62c3878-17eb-4dfb-bf91-528cad680a79**, mobil **96594d70-df5c-484a-af32-fc5947c52931**. Två tidigare lokala B-prov och två nya före-rättning-bevis också bevarade. Ursprungsjournalerna 0ab10624/1f2b25b4 fortsatt auditerbara med 0/250 ingående moms.
- Staging-ledger efterkontrollerad **52 migrationer**, senast **20261019120000**. De två kända inventarieversionerna är orörda; ingen Production-ändring/inspektion av kunddata.

## Jira och bevis

- **KAN-104 In Review / Pontus Åkerhage**, tilldelning och transition utförda efter grön lokal verifiering. Inte Done. Slutkommentar kompletteras med checkpointens SHA.
- **KAN-78 In Review / Pontus**, inte ändrat i detta uppdrag. KAN-78:s rättningar och hostade acceptansbevis behålls i de tre granskningsrapporterna.
- Lokala råbevis utanför Git: **../KAN-104-before-result.json**, **../KAN-104-postcheck.json**, **../KAN-104-regression.log**, **../KAN-104-build-final.log**, **../KAN-104-lint-final.json**. Ignorerade **test-results/KAN-104-staging-result.json**, 1280/390-skärmbilder och övriga loggar dokumenteras i rapporten.
- Inga hemligheter/testlösenord i Git, state eller Jira. Permanenta Staging-testet kräver explicit ignorerad identitetsfil och lokal URL; inga automatiska konton, betalningar eller utskick.

## Retention och avgränsningar

- KAN-78-kopians ocommittade dokumentationsuppföljning identifierad och bevarad i original. Tre uppdaterade rapporter förs vidare; state ersätter aktivt handoffläge. Frysta KAN-78-samlingsbevis orörda.
- Äldre KAN-75/Production-/inventariehistorik finns redan i **PROJECT_ARCHIVE.md** och KAN-78-rapporterna; inte duplicerad här. Inget aktivt KAN-78/104-arbete arkiverat. **AGENTS.md och PROJECT_ARCHIVE.md oförändrade.**
- Desktop-rotkopian är fortsatt dess gamla staging/dokumentationsspår med tidigare AGENTS.md-ändring, untracked audit-packages och create-kan63-staging-user.mjs. Den är inte releasekandidat och har inte städats/resetats.
- Ingen push, deploy, migration, schemaändring eller Production-skrivning utförd. En uttryckligen godkänd **lokal** KAN-104-commit skapas efter denna avstämning; kontrollera dess faktiska SHA och status i slutrapporten.
- Kvarvarande gränser: ingen Production-incident fastställd/utredd i kunddata; eventuell historisk rättning kräver separat uppdrag. Gamla öppna klienter behöver omladdning efter framtida release. Samtidig redigering av samma profil i olika flikar saknar versionskonfliktpolicy; det är separat från verifierat ägar-/sekvensrace.
