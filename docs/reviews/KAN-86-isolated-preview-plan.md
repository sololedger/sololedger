# KAN-86 — isolerad Staging Preview, förberedd 2026-10-16

**PASS: kodisolering och befintligt huvudtestfall. STOPP: publicering inväntar separat godkännande. Ingen Preview har skapats.**

Exekveringstillägg 2026-10-16: Pontus har därefter uttryckligen godkänt exakt denna tiofilscommit och separat Preview-publicering mot Staging, utan push/merge. Den fristående Previewns effektiva bygg-/runtime-URL och publika nyckel har kontrollerats mot Staging före publicering. Befintlig servernyckel är skyddad och konfigurerad; dess värde har inte verifierats eller ändrats. Ursprunglig plan/status nedan bevaras som beslutsunderlag. Commit-/deployresultat registreras efter exekvering, ingen Production-release.

Pontus har godkänt lokal implementation/tester för detta förberedelsesteg, inte commit, push, merge, deploy eller Production. Alla kontroller i detta steg är läsande; ingen bred testomgång eller databas-/Storage-skrivning har körts.

## Verifierat utgångsläge

- Arbetskopia: C:/Users/Familjedator/.codex/worktrees/kan86-shared-attachments/sololedger_multi_user, gren codex/KAN-86-shared-attachments, HEAD 8692f0566feab0978976143d51fd5d1ed91daa19. Inget staged och ingen ny commit.
- GitHub main är fortfarande exakt 8692f0566feab0978976143d51fd5d1ed91daa19. GitHub staging är 5809094dd3ce808dba35986c65e772b842f0d0e1. KAN-86-grenen finns ännu inte på remote.
- Vanliga staging innehåller äldre KAN-62/65, inklusive ändringar i TransactionTable och dess filter. Den kan inte vara bas för en Preview som ska innehålla endast Production + KAN-86. Ingen staging-merge eller grenåterställning föreslås.
- Canonical Desktop-checkout ligger kvar på lokal staging 11d8306 med ändrad PROJECT_STATE.md samt befintliga ospårade audit-packages/ och scripts/create-kan63-staging-user.mjs. Dessa och alla andra arbetskopior lämnas utanför leveransen.
- Produkt-/testfilerna är oförändrade sedan föregående godkända implementation. package-lock.json, AGENTS.md, bokföring/RPC/laddare/rapporter/export och supabase/ har ingen KAN-86-diff. git diff --check PASS. Tidigare godkända tester återanvänds; inga nya tester körda.

## Exakt föreslagen leverans efter nytt godkännande

1. Skapa en lokal KAN-86-commit **C** ovanpå exakt 8692f05, endast med de tio uttryckligt listade filerna nedan. Föreslagen text: `feat(KAN-86): group transaction history by shared attachment`. Verifiera filmanifest, kodfingeravtryck och C:s enda förälder innan nästa steg. Om basen eller produktbytes ändras: stoppa för ny kontroll.
2. Skapa en ren lokal källkopia från C, utan ospårade/ignorerade filer, .env, auth, audit-packages eller andra arbetsfiler. Källkopian innehåller Production-basen + KAN-86, inga ärvda Staging-produktändringar. Ingen cherry-pick/merge med staging behövs.
3. Publicera denna källkopia som en **separat Vercel Preview** i befintligt SoloLedger-projekt, via uttryckligt Preview-mål. Ingen Git-push behövs; main, staging och befintlig Staging-alias flyttas inte. Detta är en separat isolerad Preview, inte en uppdatering av den permanenta staging-grenen.
4. Före bygg/publicering måste den isolerade Previewns faktiska konfiguration verifieras mot **Supabase Staging fzxqiqenqjzhlyxxpvhg** för både browser/server, utan secretutdata. En befintlig staging-grens konfigurering bevisar inte bindningen för en fristående Preview. Krävs nya credentials, miljöinställningar eller ändrat Deployment Protection: stoppa för separat beslut; skapa ingen miljö/projekt/bypass automatiskt. Ingen Production-credential får användas.
5. Efter separat deploy-godkännande: bygg endast denna kandidat, kontrollera Ready/Preview/C och Staging-bindning, och lämna den unika Preview-URL:en till Pontus. Befintligt Vercel-skydd behålls. Ingen ny bred testomgång eller dataskapande ingår. Ingen Production-release följer av acceptansen.

**Commitmanifest, exakt tio filer:**

1. src/components/TransactionTable.tsx
2. src/components/AttachmentTransactionGroup.tsx
3. src/lib/transactionAttachmentGroups.ts
4. scripts/test-transaction-attachment-groups.ts
5. scripts/test-transaction-attachment-ui.mjs
6. package.json
7. Architecture.md
8. PROJECT_STATE.md (endast denna arbetskopias version)
9. docs/reviews/KAN-86-local-verification.md
10. docs/reviews/KAN-86-isolated-preview-plan.md

Produkt-/testfingeravtryck (SHA256, lästa i detta steg):

| Fil | SHA256 |
|---|---|
| src/components/TransactionTable.tsx | 8e3cc138bd55f3513624d00bcaa68f23801b0aad279de638374d26cf0c8ae881 |
| src/components/AttachmentTransactionGroup.tsx | 8c59828587108f79860d195dcac54f9b2bd4a855224738bf0c0120ce089181ee |
| src/lib/transactionAttachmentGroups.ts | 9455758e24ce3661b337878abf209a6c29b38e178f803ad483d6a88f5c2ded92 |
| scripts/test-transaction-attachment-groups.ts | 1feeab0219592731541291b749bfc27a39e47563584b65527b544e6df98199f9 |
| scripts/test-transaction-attachment-ui.mjs | ccaba7526fe45fc05e9a16c28a01f87439c1007afc10084ef256ad2afe154420 |
| package.json | 286de38260582587962f29703d352eb0cb70b5374d01adab3b52df6332e0cb6a |

## Staging-testdata, kontrollerade skrivskyddat

Direct TLS till Staging verifierad med default_transaction_read_only=on. Ingen Production-DB/fil har öppnats eller kopierats i detta steg. Befintligt dedikerat konto identifierat via den etablerade testprofilen **SoloLedger Playwright E2E**. Använd dess befintliga lokala inloggningsuppgifter; lägg inga credentials i dokument/Jira/chatt.

- **Huvudfall 2026: VER-90, VER-91, VER-92.** Tre kundfaktureverifikationer delar exakt en lagrad PDF-referens, datum 2026-10-17–2026-12-31. Filmetadata: application/pdf, 55 657 byte. Objektet finns i testanvändarens egen mapp; attachments-bucket är privat och befintliga SELECT-policyer kräver egen användarmapp. Samtliga tre beskrivningar är testmärkta och saknar Adobe/Jessika/KAN-84-kontext. Inget filinnehåll har laddats ned; faktisk läsbarhet och autentiserad öppning återstår i acceptansen.
- **Reservfall 2027: VER-93–94.** Två medlemmar, båda 2027-01-15, med ett befintligt eget privat PDF-objekt. Välj inte de många gamla platshållarreferenser som saknar lagrad fil. Flera andra små KAN-46-test-PDF:er är endast 54 byte och är inte bra underlag för att bedöma PDF-läsbarhet.
- Vanliga bokningar finns: 43 vanliga manuella medlemmar år 2026 och två år 2027, före eventuell ytterligare användning av testkontot.
- Befintlig SIE-undo: **VER-182 år 2091**, en transaktion. Den gemensamma gruppfunktionen behöver inte ändra den. Årväljaren erbjuder bara föregående/aktuellt/nästa valda år; att nå 2091 från 2026 kräver 65 årssteg. Det är ingen praktisk kort manuell acceptansfixtur. Tidigare riktade syntetiska dator-/mobilprov av SIE-undo är PASS, men ny manuell Staging-SIE-acceptans nära aktuellt år är inte förberedd. Ingen ny SIE-import/undo eller testdata skrivs utan separat godkännande.
- Många historiska testreferenser saknar Storage-objekt. Det är testdatatäckning, inte ett konstaterat KAN-86-produktfel; ingen städning eller rättning görs.

## Pontus korta acceptans efter publicering

1. Öppna **den nya unika KAN-86-Preview-URL:en**, passera befintlig Vercel-inloggning och logga in med det dedikerade Staging-testkontot. Använd inte Production-adressen, Jessikas konto eller någon Production-PDF. Ingen bokföring/uppladdning behövs.
2. Välj 2026 och transaktionshistorik. Bekräfta att gruppering är avstängd vid första öppningen och att vanliga rader fungerar som tidigare. Rensa sökning/filter och välj Nyast först.
3. Aktivera Gruppera gemensamma underlag. Identifiera huvudfallet: **3 verifikationer, 2026-10-17–2026-12-31**. Expandera och bekräfta exakt VER-90/91/92, respektive verkligt datum/belopp, hela originalbeskrivningen och journalens konton/debet/kredit.
4. Öppna Visa gemensam bilaga från gruppen. Rätt testanvändare ska kunna läsa sin privata testfil. Om dokumentet inte är tydligt ofarligt testmaterial eller inte går att läsa: avbryt just bilagedelen och rapportera, återanvänd ingen Production-fil som ersättning.
5. Sök VER-90 eller ett konto, använd kategorifilter och sortera på belopp/VER. Grupperingen ska tydligt pausas och relevanta rader visas. Återställ datumordning/rensa filter, kontrollera Visa fler och samma grupp på mobilbredd. Ingen horisontell överrinning eller förlorad originalinformation.
6. Slå av gruppering och jämför vanliga rader. SIE-undo i Staging har ovanstående årbegränsning: dokumentera att den manuella delen återstår om 2091 inte besöks. Det lokala automatiserade SIE-provet ersätts inte med en ny oredovisad live-testuppsättning.

## Beslut som återstår

- Godkänn endast det ovan listade lokala commitsteget och den separata isolerade Preview-publiceringen om planen accepteras. Ingen push/merge behövs eller ingår.
- Om praktisk manuell SIE-undo nära 2026 krävs: välj separat mellan befintliga 2091-data och ett uttryckligt godkänt syntetiskt Staging-dataupplägg. Inga sådana skrivningar ingår i denna plan.
- Ny Preview-konfiguration/credential kräver separat beslut om den befintliga konfigurationen inte räcker. Den nya Previewns bindning och URL är inte verifierade innan den finns.
