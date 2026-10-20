# KAN-105 – flikbyte och auth-kontext

2026-10-20. Lokal kandidat på `codex/KAN-105-auth-focus`, bas Production `af412c0ea06219ea625f341f15d158a84ca6c0dc`. Inga commits, pushar, deploys eller Supabase-ändringar.

## Verifierad orsak

Installerade Supabase Auth-klientens hidden→visible-återhämtning kan skicka `SIGNED_IN` även för samma användare. `useAuth` nollställde då profilen före omläsningen. Home monterade ned ekonomivyn och modalen; ändrad subscription-kontext startade dessutom en ny bokföringsladdning. Det är en tillståndsåterställning, inte en faktisk sidnavigation.

Regressionstestet kör riktiga Home, auth-/bokföringshooks, Dashboard och uttagsmodal med syntetiska nätverksadaptrar. Installerade GoTrueClient driver verklig visibilitychange→SIGNED_IN. Testläge `--reproduce-before` läser den exakta Production-hooken via Git och reproducerar modalstängning/laddningsindikator på både 1280 och 390 px. Inga riktiga sessioner eller kunddata används; nätverk blockeras.

## Avgränsad rättning och säkerhet

Endast `src/hooks/useAuth.ts` ändrar produktbeteende: behåll tidigare verifierad profil vid SIGNED_IN/TOKEN_REFRESHED för samma ägare. Förnya fortfarande verifieringsgenerationen omedelbart och läs profilen igen. Profilberoende skrivningar blockeras tills den nya kontrollen lyckas. Befintliga RLS/RPC- och tokenkontroller är oförändrade.

Kontobyte, utloggning och andra auth-händelser nollställer fortfarande profilen direkt. Misslyckad, ofullständig eller felägd profilläsning spärrar vyn. Sena svar från gammal generation får inte återställa gammal data. Ändrade verifierade profilvärden fortsätter påverka respektive konsument normalt.

Ingen ändring av bokföring, moms, NE, årsavslut, uttagsberäkning, rapportklassificering, RPC, schema eller Edge. Därför behövs ingen ny bokföringstransaktion eller skrivande DB-E2E för denna UI/auth-livscykelrättning. Säkerheten verifieras genom riktade ägar-/skrivkontexttester och befintlig regression.

## Verifiering

- Före-reproduktion PASS: `coverage/kan105-auth-focus-1792526510360/`.
- Efter och säkerhetsfall PASS: `coverage/kan105-auth-focus-1792526747591/`, desktop och mobilbredd. Öppen modal och utkast 777 bevaras; ingen extra bokföringsladdning; upprepade SIGNED_IN, TOKEN_REFRESHED och 35 minuters bakgrund samma datum. Profilkontroll körs och skrivningar spärras under väntan. USER_UPDATED döljer under ny kontroll; A→B med sent A-fel, utloggning och nekad profilläsning döljer tidigare vy.
- Befintligt profilkontexttest PASS: A→B→A, sena svar, fel identitet/ofullständig profil, gamla skrivclosures, samtidiga laddningar, tokenbindning och unmount.
- Typkontroll PASS, riktad lint av samtliga fem ändrade/nya kod-/testfiler PASS (0 fel/varningar), optimerat `npm run build -- --webpack` PASS med syntetisk miljö.
- Säkra regressionens domän-, historik- och UI-delar PASS. Standardkommandot stoppades vid publikt smoke av Turbopacks Windows-sökvägsgräns; kommandot som helhet är inte PASS. Samma två befintliga publika smoketester kördes därefter direkt mot det färdiga lokala bygget och passerade efter tillåten localhost-åtkomst. De två återstående kategori-/standardbokningsbrowserdelarna PASS separat. Alla delmoment verifierade; ingen testassertion försvagad.
- Loggar: `coverage/kan105-checks/` (regression.log, targeted-final.log, typecheck-final.log, lint-result.json, build.log, smoke-local-access.log och remaining-ui.log).

## Acceptans och kvarvarande begränsningar

Ingen fjärrpreview publicerad. Lokal syntetisk testmiljö verifierad; fysisk mobil och verkligt inloggad Staging-acceptans återstår. Auth-serverns verkliga tokenrotation är inte ett onlinetest här; installerade SDK:s visibility-väg och hookens TOKEN_REFRESHED-hantering testas separat. Gammal data döljs när klienten får kännedom om identitets-/behörighetsförlust; ingen klient kan upptäcka en okänd serverändring före svar/händelse.

Pontus testar efter godkänd Staging-publicering: öppna Säkert uttag, välj buffert och skriv ett belopp, byt flik och återvänd (även efter längre väntan). Vyn/modalen/utkastet ska bestå. Logga ut eller byt konto i annan flik: gammal ekonomivy ska försvinna och får inte visas för nästa användare. Testa även mobil där möjligt.

Pontus har därefter godkänt avgränsad commit och Staging Preview i samma chatt. Publiceringskvittot för detta steg sparas i ../kan105-preview-20261020/. Pontus acceptans återstår; ingen Production-release utan nytt uttryckligt godkännande. Originalkällans befintliga dokumentändringar och 15 skyddade filer är bevarade; alla 15 kontrollsummor matchar.
