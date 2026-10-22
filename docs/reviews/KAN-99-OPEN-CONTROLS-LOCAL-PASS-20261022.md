# KAN-99 Etapp A – öppna kontroller vid återgång, LOCAL PASS

2026-10-22. **Redo för separat Staging-publiceringsbeslut. Ingen publicering gjord.**
Produktkopia audit-packages/KAN-99-local, gren codex/KAN-99-year-end-guide.
Förälder **41ad08ffdcc81f3a293b990296cd7b82c423c4f4**. Ny kandidat är denna lokala checkpoints HEAD;
root PROJECT_STATE och uppföljningsrapporten får exakt SHA efter commit.
Pontus har manuellt bekräftat att den föregående kvarhängande returknappen är löst i Staging.

## Minimal rättelse

Guiden avmonterades vid målbesök och tappade därför de inbyggda details-elementens öppna läge.
**YearEndGuide.tsx** läser nu vilka kontroller som faktiskt är öppna när en guideknapp klickas,
även om ett native toggle-event ännu inte behandlats. Alla öppna kontroller ingår; inga flyttade rubriker eller accordion-regler.
**page.tsx** håller ögonblicksbilden i en tillfällig returbiljett och återställer den vid giltig återgång.
Biljetten förbrukas samtidigt. Vanliga sidbyten rensar både biljett och återställningsdata.
Befintlig unik kontext för ägare/år/accepterad profil och guidens remount-nyckel förhindrar återkomst efter A→B→A.
React-granskning: ref läses bara i klickhändelsen, ingen render-I/O/effect eller global tillståndslagring;
native details/summary, flera öppna kontroller och tangentbordsmekanik bevarade.

Endast två produktkomponenter och befintligt regressionstest ändrade. Ingen databas, RPC, lagring,
sparad checklistprogress eller bokförings-/moms-/NE-/låsmotor påverkas. DB-/bokförings-E2E därför inte relevant.
Läget är enbart minne för guidebesöket; ingen beständighet vid F5/logout och inget komplett-intyg.

## Verifiering

- Ny regression före rättelsen: återgång från Bokföring gav **[]** öppna kontroller, förväntat **[0]**.
- Efter rättelsen **12 browsergrupper PASS**, verklig Home/Layout/guide, syntetiska data/målpaneler, 1440/390px.
- Alla sju mål återställer öppet läge; Inventarier/NE med flera kontroller [0,3,5], därefter [3,5,7] PASS.
  Testet stänger en återställd kontroll och öppnar en annan innan nästa besök, så gammal snapshot inte återanvänds.
- Orelaterad omrendering bevarar native läge. Vanlig meny rensar återställning; tidigare returknappsfix PASS,
  inklusive samma sida i meny, annan sida, förbrukad retur och senare menybesök.
- År-/profil-/ägare A→B→A med aktivt återställt läge PASS; befintliga saknad profil/laddningsfel fortsätter PASS.
- 0 nätverksanrop, 0 skrivförsök, tom localStorage och 0 browserfel i isolerade guidetester.
- Typkontroll, optimerat lokalt Next16.2.6-bygge och riktad lint utan nya fel PASS.
  Guide/test 0 fel; Home/Layout samma äldre10+1 fel. Full lint/bred suite inte omkörd, tidigare begränsningar kvar.
- Befintliga standard-booking-page- och profile-context-regressioner PASS. Profilprovet behövde explicit
  befintlig Playwright-browserkatalog efter en initial startmiss; ingen installation/produktändring behövdes.
- Bygge använde enbart syntetiska processvärden; befintlig varning om flera lockfiler kvar. Ingen env-/dependencyändring.

Bevis: **docs/testing/kan99-open-controls-local-20261022/**. Resultat/lint finns som maskinläsbara filer;
typ/build och kompletterande regressioner är sammanfattningar av verifierade terminalutfall.
Den nya kandidatens hosted-/mänskliga acceptans återstår; tidigare Staging-smoke gäller endast41ad08f.

## Nästa steg

Nytt uttryckligt godkännande för exakt kandidat krävs före Staging-push/deploy. Därefter:
öppna flera kontroller, följ Profil/Inventarier/NE, återgå och verifiera samma öppna läge;
stäng/öppna en annan kontroll och upprepa. Vanlig meny ska fortfarande ta bort returknappen.
Prova år/ägare/profil och mobil utan att spara profil, initiera moms eller boka/låsa något.
KAN-99 kvar **In Review/Pontus**. Ingen Jira-mutation, push, deploy, migration eller live DB-skrivning.
