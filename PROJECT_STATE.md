# SoloLedger Project State

Uppdaterad 2026-10-20. Aktivt: KAN-105, lokalt implementerad och verifierad; Pontus acceptans återstår.

## Arbetskopia och bevarande

- Aktiv kodkopia: audit-packages/KAN-97-staging-integration-20261020/candidate, återanvänd vanlig klon, gren codex/KAN-105-auth-focus.
- HEAD/bas: af412c0ea06219ea625f341f15d158a84ca6c0dc (publicerad KAN-97). Inga nya commits eller pushar. Ingen upstream/remote ändrad för KAN-105.
- Originalkopia audit-packages/KAN-104-source har kvar befintliga PROJECT_STATE-/PROJECT_ARCHIVE-ändringar och 17 ospårade filer. Alla 15 skyddade filer kontrollsummematchar. Radera/städa inte kopior eller testbevis.
- Denna fil ersätter kandidatens inaktuella KAN-97-status. Historik finns i Git och originalkällans bevarade dokument/coverage.

## KAN-97 publicerad grund

- GitHub main af412c0ea06219ea625f341f15d158a84ca6c0dc; staging d57161756fec9999094b1e068db2a1e9cde22b2b har samma produktträd.
- Production Vercel dpl_ATTabx4y5HcxNEDnoXZgCpdJEXcA READY på sololedger.vercel.app, Supabase wbaxmuvudpnkvuliicuy. Ledger 52, protokoll 3, delete-user v14 ACTIVE/JWT. Tidigare verifierat KAN-97-underlag, inte nya KAN-105-DB-kontroller.
- Pontus anger nu KAN-97 färdig/publicerad. Ingen KAN-97/Jira-status ändrad av KAN-105-arbetet.

## KAN-105 kandidat

- Orsak: SDK:s återkomst till synlig flik skickar SIGNED_IN för samma ägare; tidigare profilnollställning monterade ned Home/ekonomivy/modal och startade bokföringsladdning.
- useAuth behåller samma ägares verifierade profil under SIGNED_IN/TOKEN_REFRESHED men förnyar skrivkontext och verifierar profilen. Skrivningar spärras under kontroll; identitetsbyte/utloggning/andra events/fel döljer som tidigare.
- Produktkod ändrad endast i src/hooks/useAuth.ts. Nya offline-regressioner och fixture, liten utökning av befintlig fixture; package.json kör dem i domän/regression. Architecture och docs/reviews/KAN-105-AUTH-FOCUS.md dokumenterar.
- PASS: verklig SDK-visibility-reproduktion före, fix/säkerhetsfall 1280/390 efter, profilkontext, typkontroll, riktad lint (0 fynd), optimerat webpack-bygge. Säkra regressionens samtliga delmoment PASS. Standardrunner avbröts för Windows/Turbopack-sökvägsfel vid smoke; samma smoke PASS separat mot färdigt bygge efter tillåten localhost-åtkomst. Ingen grön helkörning påstås.
- Bevis: coverage/kan105-checks och coverage/kan105-auth-focus-1792526510360 (före), -1792526747591 (efter).
- Ingen DB-/Edge-/affärsskrivning, migration, commit, push eller deployment. Ingen fjärrpreview ännu. Jira KAN-105 är In Review, tilldelad Pontus; kommentar 11671 innehåller verifiering och acceptanssteg. Inte Done.

## Nästa steg

- Läs docs/reviews/KAN-105-AUTH-FOCUS.md och faktisk git diff/status.
- Pontus har nu uttryckligen godkänt avgränsad KAN-105-commit och Vercel Staging Preview. Publicera exakt denna kandidat med Preview-miljö, utan Production-push/deploy eller DB-ändring. Publiceringskvitto/commit/deployment finns efteråt i ../kan105-preview-20261020/. Därefter Pontus flikbyte/modal/kontobyte på verklig Staging och mobil där möjligt.
- Production-release kräver nytt godkännande. Inga orelaterade filer eller originalkällans dokumentändringar får följa med av misstag.
