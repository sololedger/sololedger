# Inventarie-UX och profilutkast – LOCAL PASS

Avstämt 2026-10-21. Lokal komplettering till godkänd gemensam KAN-62/65/73/76. Ingen extern ändring eller ny inventarieregel ingår.

## Kandidat och bevarad grund

- Gren **codex/inventory-ux-profile-drafts**, kodcheckpoint **261147ccd71d57ea9e989da4d5185c30f912a2d1**. Efterföljande docscheckpoint innehåller denna rapport, aktuell PROJECT_STATE och den lilla arkitekturbeskrivningen.
- Bas **ad0f54c3fee016bc53ac841d7ebd1646cf4a36da** bevarad på `codex/KAN-62-65-73-76-inventory`, liksom äldre `89afeef`. Alla tidigare arbetskopior, testdata och bevis bevarade.
- Ledaren har accepterat inventariegrundens LOCAL/STAGING PASS och manuell acceptans för normala direktavdrag, aktivering och kollektiv avskrivning. Detta är en separat lokal UX-kandidat, ännu inte Staging-publicerad.

## Ändrat och berörd integration

- **FixedAssetsPanel:** befintlig förhandsbedömning visar verkliga domänvärden för betalning, moms, direkt resultatkostnad respektive aktivering. Privat betalning visar egen insättning och ingen bankminskning. Ej avdragsgill moms visas som del av kostnad/tillgång. Delvis avdrag förklaras som fortsatt ej stödd avdragsberäkning; det befintliga valet utan avdrag beskrivs korrekt.
- Kollektiv årsavskrivning visar serverns belopp som minskning av resultat och inventarievärde, utan ny betalning/moms. Ingen alternativ restvärdes- eller årsberäkning tillagd. Paketomklassningens separata resultat-/värdeeffekt beskrivs med redan beräknat omklassningsbelopp.
- Blockerad bedömning visar orsak och spärrad Bokför-knapp; den befintliga submit-/servervalideringen behålls. Redan fastställt årsunderlag döljer inte säkra direktavdrag/kortliv. Oklart samband, utland och saknat betalningskonto ger ingen grön bokföringskonsekvens.
- Kontextuell hjälp för direkt kostnad/aktivering, paket inom samma år, ekonomisk livslängd, treårsregel, aktuellt halvt PBB/regelår, kollektiv K1 och årslängdsbekräftelse. Klick/tangentbord/Escape, mobil placering inom skärmen, inga nya köpmodaler.
- **Registerknappen:** `Avsluta` heter nu `Inte längre i bruk`. Knapphjälp, registerhjälp och kvitto förklarar att bara registerstatus ändras. Samma befintliga retire-anrop används; ingen försäljning, kredit eller rättelse implementerad. Aktiverade tillgångar förblir spärrade.
- **ProfileSettings/HomeSession:** osparade företags-, moms-, betalningskonto- och lösenordsfält hålls bara i aktuell användares minne. Intern navigation/profil-refresh får inte förstöra utkastet. Banner visar osparat; respektive aktiv sparåtgärd krävs. Profilutkast används aldrig som bokföringspolicy. Separat sparning rensar bara rätt fält och bevarar nyare ändringar under pågående sparning. Utloggning/kontobyte rensar minnet.
- **OverviewCards:** återbetalning visas som `Moms att få tillbaka` med positivt belopp; skuld som `Moms att betala`; noll som `Moms i balans`, neutralt även i modal. Samma presentationshjälpare används i kort och modal. Underlag för kontroll behåller tidigare spärrade visning.
- Journaler, metadata, transaktionskällor, momsaggregation/-avslut/-deklaration, resultat/NE/balans, fakturor/betalningar, SIE, avskrivnings-RPC, RLS, rättelser och årslås ändras inte. Sparad profil och sparade betalningsroller är fortsatt enda beslutsunderlag. Inga SQL-, datamodells-/persistens-, dependencies-, package-lock- eller miljöändringar.

## Ändrade kod-/testfiler

- `src/app/page.tsx`
- `src/components/FixedAssetsPanel.tsx`, `OverviewCards.tsx`, `ProfileSettings.tsx`
- `src/lib/profileSettingsDraft.ts`, `vatNetPresentation.ts` (nya, minne/presentation)
- `scripts/test-profile-draft-domain.ts`, `test-profile-drafts.mjs`, `test-vat-net-presentation.mjs` (nya)
- `scripts/test-fixed-asset-panel.mjs`, `test-fixed-assets.ts`, `tests/fixtures/profileDraftHarness.tsx` (ny fixture)
- `package.json`: nya regressioner ingår i domänsviten; fokuserat `npm run test:inventory:ux`.

## Verifierat

| Kontroll | Resultat / bevis i kandidatens ignorerade coverage/kan62-local-db/ |
| --- | --- |
| Hel domänsvit | **PASS**, `inventory-ux-domain-r02.log`. Inklusive tidigare ekonomiska regressioner och nya presentations-/utkastprov. Efter sista tillägget för lösenordsutkast återverifierades slutlig fokuserad UX, befintlig profil/Auth-svit, typer och bygg; den stora domänsviten upprepades inte igen utan ytterligare behov. |
| Slutlig fokuserad UX | **PASS**, `inventory-ux-focused-final-r02.log`: full/ingen/delvis avdragsrätt utan felaktigt avdrag, privat betalning, aktivering, osäkert/blockerat, mobil/keyboard-hjälp och registerstatus. |
| Profil/Auth | **PASS**, faktisk profilkomponent, useAuth och bokningsgräns med syntetisk transport: navigation, remount, refresh, sparad-only moms, aktiv sparning, betalningskontoutkast, separata lösenordsfält/sparning, konto A→B→A och logout. Befintliga tester för sena svar/fel och kontextbundna skrivningar är fortsatt gröna. Inget utkast i localStorage/sessionStorage. |
| Utkastsracer/oberoende sparningar | **PASS**, ren domän: nyare ändring under save bevaras, fel ägare kan inte rensa/återanvända föregående ägares data, betalningskonton rensas inte av profilsparning. |
| Momsens tecken | **PASS**, verkligt kort/modal: fordran/skuld/noll inklusive -0, neutral nollfärg, fortsatt kontrollspärr och signerad bokföringsdata oförändrad. |
| Typkontroll/standardbygge | **PASS**, separat tsc och slutligt Next 16.2.6/Turbopack-bygge, 8/8 statiska sidor, `inventory-ux-build-final-r01.log`. Endast syntetiska localhost-värden. |
| Lint | Nya/riktade rena filer **PASS utan varningar**. ProfileSettings har 9 befintliga fel mot 11 i grundkandidaten; page har oförändrade 10, inga nytillkomna regel-/feltyper. `inventory-ux-lint-final-r01.json`. Full repo-lint påstås inte grön. |
| Historik-/DB-avgränsning | **PASS**, offlinevakt verifierar samtliga 55 historiska/kandidat- och tre nya migrationshashar utan anslutning. Git-diff tom för SQL, accountingService, fixedAssets-domänen, calculations och momsaggregation/service. |
| Visuell kontroll | Desktop och 375px med verklig CSS granskade. Exempel från slutligt prov: `test-results/inventory-ux-1792585665323/`. Äldre bilder/loggar kvar. |

Tidigare lokala FAIL-försök från nya testselektorer, ändrade textassertioner, lokala edit-/radslutsfel och browsercache i sandbox är bevarade. Sista relevanta omkörningar PASS; ingen produktassertion kvarstår FAIL. Befintlig domänberäkning och serverunderlag har inte justerats för att få presentationstester gröna.

## Begränsningar och liten Staging-acceptans

- Utkast finns under intern navigation i samma inloggning, inte efter full omladdning/stängd app eller utloggning. Inga känsliga utkast serialiseras till browserlagring eller rapporter. Lösenordsuppdatering använder oförändrad befintlig Auth-åtgärd, inte vanlig profilsparning.
- Delvis momsavdrag, avyttring/kredit av aktiverad tillgång, automatisk avskrivningsrättelse och avvikande/osäkra år får inget nytt stöd. Tidigare inventarieavgränsningar kvarstår.
- Hosted verifiering av denna nya UI-kandidat återstår. SQL-/RLS-/samtidighetssviter kördes inte om: inga server-, domän-, rapport- eller migrationsändringar. Befintliga LOCAL/STAGING-bevis gäller den oförändrade ekonomiska grunden.
- Efter uttryckligt godkännande: publicera endast exakt slutlig UX-SHA till Staging, **ingen migration**, verifiera Preview och ordinarie alias. Behåll ad0f54c som föregående godkända release.
- Riktad acceptans: (1) direktkostnad/aktivering med full/ingen avdragsrätt och privat/företagsbetalning – jämför visade belopp mot journal/rapport; (2) paketomklassning och årsavskrivningens förklarade effekt, spärr efter fastställt år och registerstatus utan ekonomisk effekt; (3) ändra momsprofil/betalningskonto, navigera bort/tillbaka, kontrollera osparat och oförändrat bokföringsunderlag, spara aktivt och verifiera separat, byt konto/logga ut; (4) momsfordran/skuld/noll i kort/modal mot momsrapport; (5) mobil/keyboard-hjälp.

Ingen push, migrationsexekvering, deployment, Jira-mutation eller ändring av verkliga användardata har utförts i detta UX-uppdrag. Staging/Production har inte ändrats.
