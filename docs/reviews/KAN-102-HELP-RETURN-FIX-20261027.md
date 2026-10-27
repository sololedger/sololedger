# KAN-102 – lokal rättning av kvarvarande återgångslänk

2026-10-27. Lokal verifiering PASS; ingen ny commit eller publicering.

## Bas och avgränsning

- Produktkopia: audit-packages/KAN-100-app-release-20261024.
- Gren codex/KAN-102-help-center, oförändrad HEAD
  1b363d10b31b923ee0554f0ab52414a54b6b3eae.
- KAN-117-dokumentation, tidigare rapporter, handofffiler och skiss bevarade.
- Ingen commit/staging av filer, push, merge, deployment, DB- eller Jira-åtgärd.
- Endast hjälpbesökets UI-navigation ändras. Ingen ekonomisk beräkning, RPC,
  datamodell eller bokföringsskrivning påverkas. En ny bokförings-/DB-kontroll
  behövs därför inte för denna rättning.

## Reproduktion och grundorsak

Det utökade testet kör verkliga Home, Layout, FAQ, useAuth och hjälpnavigation,
med syntetisk Auth-transport och blockerade externa anrop/bokföringsskrivningar.
Mot oförändrad produktkod från 1b363d1: öppna frågan Skattekonto, öppna Moms,
välj Profil i huvudmenyn och ladda om. Länken fanns både efter menyvalet och
efter omladdning. Testet blev rött med `ordinary menu must end FAQ return mode`.

Sanerat reproduktionskvitto: coverage/kan102-help-return-fix/red/return-menu-1440.json.
URL var https://kan102.test/ utan help-parameter, men historikfältet
soloLedgerHelpDestination var fortfarande moms trots menyvalet Profil.

Tre delar samverkade:

1. Menyhanteraren anropade leaveHelp bara från FAQ eller när URL hade help.
   När en FAQ-knapp redan hade öppnat en funktion var help borttagen.
2. leaveHelp släckte inte returnAvailable.
3. readLocation använde ett giltigt historikmål som tillräckligt bevis för
   återgångslänken. history.state överlever omladdning.

## Rättning

- Vanlig menynavigering avslutar också ett aktivt återgångsläge i en funktion.
- leaveHelp släcker länken och avslutar besöket i minnet.
- Ett historikmål får återställa en vy, men länken kräver dessutom ett levande
  hjälpbesök i aktuell HomeSession. Reload/direktlänk kan inte skapa det.
- Historikpostens soloLedgerHelpVisit måste matcha aktuell tillfällig
  besöksmarkering i minnet. Ett nytt besök kan därför inte aktivera länken på
  en gammal meny- eller funktionspost. Äldre publicerade historikposter utan
  markeringen kan fortfarande öppna rätt vy men inte skapa en återgångslänk.
- FAQ-knappen aktiverar besöket; återgång bevarar fråga, sökning och ämne.
  Bakåt/framåt inom besöket fungerar. Efter vanligt menyval kan historiken
  inte ensam återaktivera länken. Ägarbyte/utloggning rensar besöket.
- Grön länk, text och samtliga visuella klasser är oförändrade.
- Även huvudmenyns Hjälp & FAQ avslutar föregående besöksmarkering. Den gröna
  återgångsknappen bevarar besöket för vanlig bakåt/framåt-navigation.
- Auth-kod/fragment och Nexts historikfält bevaras. Ingen localStorage,
  sessionStorage, serverlagring eller nytt beroende införs.

## Exakt ändrade filer i detta uppdrag

1. src/app/page.tsx – låter vanligt menyval avsluta aktivt hjälpbesök.
2. src/hooks/useHelpNavigation.ts – besökets livslängd och släckning av länken.
3. scripts/test-help-center-browser.mjs – meny/reload/historik/kontobyte/
   utloggning och bevarat ämne; separat sökväg för testkvitton.
4. docs/HELP-CONTENT.md – dokumenterar återgångslägets livslängd.
5. PROJECT_STATE.md – aktuellt lokalt läge och nästa godkännandegräns.
6. docs/reviews/KAN-102-HELP-RETURN-FIX-20261027.md – denna rapport.

PROJECT_ARCHIVE.md och övriga redan ocommittade rapporter är äldre arbete,
inte ändringar från rättningen. Inget är staged.

## Verifiering

- Rött regressionstest före kodändringen: reproducerat på 1440 px.
- npm run test:help-center: PASS på 1440/390/320 px.
  Meny efter FAQ (även menyval Hjälp & FAQ), reload i funktion och efter meny,
  direktlänk, historik inklusive gamla poster efter ett nytt besök,
  återgång med fråga/sökning/ämne/fokus, samma kontos token-refresh,
  kontobyte, utloggning/ny login, frågelänk efter login och faktisk installerad
  Auth SDK med syntetisk lösenordsåterställning ingår.
- npm run typecheck: PASS.
- node scripts/check-help-center-lint.mjs: PASS utan nya diagnostikmeddelanden.
  Äldre lintfel i befintliga filer finns kvar; de har inte dolts eller ändrats.
- npm run test:regression: PASS, exit 0, inklusive tre publika lokala smokeprov.
  Syntetisk Supabase-adress, lokal smoke-server, inga riktiga inloggningar eller
  databasanrop. Slutlig utökad hjälphistorik verifierades separat på alla tre bredder.
- npm run test:auth-focus: PASS på 1280/390 efter sista produktkodändringen.
  Första separata starten i sandbox saknade Chromium i sandboxprofilen; samma
  test passerade med redan installerad Chromium i vanliga användarprofilen.
  Ingen installation eller testförsvagning behövdes.
- git diff --check för uppdragets produkt-/test-/innehållsfiler: PASS.
- Kvitton/bilder för slutlig rättning: coverage/kan102-help-return-fix/final.
  Full regression: coverage/kan102-help-return-fix/regression.log.
  Slutligt separat auth-kvitto: coverage/kan105-auth-focus-1793107128932.
  Tidigare red/green/regression-kvitton bevarade (lokala ignorerade filer).
- Produktionsbuild kördes inte om för denna lokala ändring av klientnavigation;
  typecheck, verklig React-navigation och lokal Next-smoke är verifierade.

## Nästa steg

Stanna efter lokal verifiering. Separat beslut krävs för checkpoint och ny
Staging-publicering. Staging kör fortfarande den tidigare godkända kandidaten;
rättningen måste senare provas där manuellt på riktig dator och mobil.
Verklig mejlleverans, fysisk mobil och hosted acceptans har inte provats i detta
lokala uppdrag. KAN-107 påbörjas inte.

Efter separat godkänd publicering: välj ämnet Moms & skattekonto, sök
skattekonto och öppna Moms från frågan. Den gröna länken ska återgå till samma
fråga/sökning/ämne. Öppna därefter Moms igen och välj Profil i huvudmenyn:
länken ska försvinna och förbli borta efter F5/Ctrl+Shift+R. Prova även menyn
Hjälp & FAQ och bakåt/framåt efter ett nytt FAQ-besök på dator och mobil.
