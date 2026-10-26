# KAN-112 – scrollrättning publicerad till Staging

2026-10-26. **PASS för Pontus manuella acceptans.**

## Exakt publicerat

- Produktcommit `a02e3e30403e56969a55fbc4156213e04a829164`.
- Vercel `dpl_GRTbB87v2xSZQBFf7vHnb7USNkV6`, READY, Preview/staging.
- Ordinarie adress: https://sololedger-git-staging-sololedger1.vercel.app
- Deployment: https://sololedger-k0dql0qle-sololedger1.vercel.app
- Projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`.
- Supabase Staging `fzxqiqenqjzhlyxxpvhg`.
- GitHub staging fast-forward från 934ce9b till exakt a02e3e3; bara staging pushad.
- GitHub main oförändrad `6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`.

## Förkontroll och alias

AGENTS, PROJECT_STATE och KAN-112-SCROLL-FIX-LOCAL-20261026 lästa.
Ren L-arbetskopia på `codex/KAN-112-year-end-checklist`, docs-HEAD
`1d6b33bb5a3ce1db69797a8c704b2f287baef6ec`. Produkt/test/schema/lockfil
identiska med kandidaten. Senare docs-HEAD publicerades inte.

Produktcommitens exakt två filer: `src/components/YearEndGuide.tsx` och
`scripts/test-year-end-guide.mjs`. Jämfört med tidigare Staging ingår dessa samt
tre KAN-112-dokumentationsfiler, ingen annan produktändring. Rootens orelaterade
dirty filer bevarade och aldrig använda som produktpushkälla.

Staging-schema, ACL/RLS/funktionshashar och migrationsledger identiska med senaste
verifierade KAN-112-läge. Versionerna 20261026092741 och 20261026110015 kvar.
Read-only Session Pooler/TLS och sessionskontinuitet verifierade. Ingen migration,
DB-/RPC-/Auth-/Edge-/ekonomisk ändring behövdes eller utfördes.

READY, exakt SHA, branch, Preview, projekt och team verifierade. Ordinarie alias
låg kvar på `dpl_EGHhDGsXoZE3XXgsWDqD9F7ZxZhW`/934ce9b och korrigerades inom
stående aliasbehörighet till nya deploymenten/a02e3e3. Alla andra alias, inklusive
Production, och envmetadata oförändrade. Riktig browsertrafik använde Staging-ref.

## Hosted omtest

Verklig hosted app/Auth/RPC, verifierade syntetiska A/B. Ägar-/originspärr i
browsertrafiken. Bara syntetiska A:s bankkontroll 2025 fick skrivas av testet.

| Kontroll | Resultat |
| --- | --- |
| Dator 1440: växla Resultat/Moms i båda riktningar, olika instruktionshöjder | PASS |
| Befintlig scrollY 339, 383, 464 och 569 exakt oförändrad vid respektive val | PASS |
| Dator: huvuddel vid scrollY 0, Space, rubrikfokus utan scrollanrop | PASS |
| Mobil 390: rubrik inom skärm, scrollY 1410 → 1410, noll scrollanrop | PASS |
| Mobil: rubrik utanför skärm, Enter ger en nearest-scroll 837 → 1088 | PASS |
| Rubrikfokus, ett instruktionsinnehåll, alla elva punkter, ingen horisontell scroll/pageerror | PASS |
| Navigation ger noll bekräftelseskrivningar | PASS |
| Markera/avmarkera, spara, omladda, ursprunglig bankflagga återställd | PASS |
| Omkontrollvarning, egen grön bock/kryss och exakt tidigare bekräftelsedatum bevarade | PASS |
| Sparfel/pending synliga vid huvuddel-/punktbyte, retry med samma kommando | PASS |
| Fördröjt verkligt sparsvar överlever navigation utan extra skrivning | PASS |
| Retur Profil/Fakturor/Skulder/Inventarier/Moms/NE: rätt år/huvuddel/punkt/fokus/scroll | PASS |
| Ändrat destinationsår återställs, två visibility-återkomster per bredd utan falskt läsfel | PASS |
| B kan inte läsa A:s checklistor | PASS |

Desktopbild inspekterad. Inga produktändringar efter godkännandet. Tidigare lokal
fembreddsverifiering/typecheck/lint och säkra regressionens delade gröna körningar
gäller exakt samma kandidat. Ingen ny full lokal regression eller ekonomisk DB-E2E
behövdes för publiceringen av denna redan verifierade fokus-/scrolländring.

## Databevarande och avstämd avvikelse

Direkt efter publicering, före omtest: alla data/checklistor, schema och ledger
exakt oförändrade. Efter omtest: alla andra publika tabeller/schema/ledger identiska.
De ursprungliga 14 checklistraderna finns kvar. Bara syntetiska A:s bankkontroll
har ändrad revision/datum efter avsiktliga testsparningar; ursprunglig kryssflagga
återställd. Övriga 13 ursprungliga rader exakt identiska inklusive varningsfixture.

Slutkontrollen hittade dessutom en ny momskontroll 2026 utanför testkohorten
(14 → 15 rader) och blockerade tillfälligt databevarandebedömningen. Alla skrivande
tester stoppades. Pontus bekräftade direkt i chatten att detta var avsiktlig samtidig
manuell testning. Sista läsande jämförelsen accepterade bara exakt den observerade
radens identitet och hash; inga andra nytillkomna/ändrade/raderade rader accepterades.
Den manuella raden är bevarad. Ingen reparation, radering eller återställning av
manuella data utfördes. **Avvikelsen är därmed förklarad; slutbedömning PASS.**

## Bevis och nästa steg

Root/audit-packages/KAN-112-scroll-staging-20261026/: preflight, före/efter-catalogue,
data och checklist-hashar, deployment, alias-before/after/correction,
after-release-preservation, scroll-1440/390 JSON/bilder, browser-results,
preservation-diagnostic/comparison, manual-change-confirmation och final-verification.
Inga credentials eller verkliga känsliga användaruppgifter i rapport/Git.

Jira KAN-112 återläst To Do/otilldelad, inga mutationer/Done. KAN-113/KAN-114 orörda.
Testbrowserar avslutade; syntetiska konton/fixtures bevarade. Retention genomgången:
aktiv KAN-112 och relevanta äldre rapporter behålls. Rapport/STATE checkpointas
endast lokalt, ingen ytterligare push. Ingen Production-, migration- eller Edge-åtgärd.

Nästa steg: Pontus manuell acceptans på ordinarie Staging. Stanna här och invänta
nästa beslut; ingen Production-publicering godkänd.
