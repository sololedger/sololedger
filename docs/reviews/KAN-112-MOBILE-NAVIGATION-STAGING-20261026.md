# KAN-112 – mobilnavigation publicerad till Staging

2026-10-26. **PASS för manuell acceptans, med dokumenterad positionsobservation vid 320 px.**

## Exakt publicerat

- Produktcommit `1e4a32a44fde6173633c2deef92940cc682ced84`.
- Deployment `dpl_58afdvJM1RQ7hpSoiYnWAgGsw5Bh`, READY, Preview/staging.
- Staging: https://sololedger-git-staging-sololedger1.vercel.app
- Deployment: https://sololedger-ipkyteruv-sololedger1.vercel.app
- Vercel-projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`.
- Supabase Staging `fzxqiqenqjzhlyxxpvhg`.
- Endast GitHub staging pushad, fast-forward a02e3e3 → exakt 1e4a32a.
- GitHub main kvar `6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`.
- Ingen migration, Edge-, databas-/ekonomisk produktändring eller Jira-mutation.

## Förkontroll

AGENTS.md, PROJECT_STATE.md och lokal mobilrapport lästa. Ren L-arbetskopia på
`codex/KAN-112-year-end-checklist`, docs-HEAD `b57e16cda81a2e429c6b1eb138084bde91bc3c99`.
Produkt/test/schema/lockfil identiska med exakt godkänd kandidat. Docs-HEAD publicerades inte.

Produktcommitens två filer är YearEndGuide.tsx och test-year-end-guide.mjs.
Jämfört med tidigare Staging ingår dessa samt tre KAN-112-dokumentationsfiler,
ingen orelaterad produktkod eller dependency. Rootens dirty ändringar bevarade.

Live schema, ACL/RLS/funktionshashar och migrationsledger identiska med tidigare
verifierade KAN-112-läge, inklusive 20261026092741/20261026110015. READ ONLY/TLS
och sessionskontinuitet verifierade. Ingen migration eller Edge-ändring behövdes.

READY/SHA/branch/Preview/projekt/team verifierade. Ordinarie Staging-alias behövde
korrigeras från `dpl_GRTbB87v2xSZQBFf7vHnb7USNkV6`/a02e3e3 till nya deploymenten
enligt stående aliasbehörighet. Alla andra alias, särskilt Production, och envmetadata
oförändrade. Verklig browsertrafik använde förväntad Staging-ref.

## Hosted omtest

Befintlig syntetisk A verifierad mot kohortens purpose/marker. Verklig hosted
app/Auth/läs-RPC. Browsern spärrade alla appdataskrivningar och annan Supabase-origin.
Inga kryssrutor eller spara-/omkontrollknappar aktiverades; befintliga svar lästes.

| Kontroll | Resultat |
| --- | --- |
| 1440 × 1000: stabil scroll vid olika instruktioner och befintliga scrollpositioner | PASS |
| 390 × 844: alla fyra huvudkort → listbörjan, y=16 | PASS |
| 320 × 568: alla fyra huvudkort → listbörjan, y=16,25 | PASS vid begränsat omtest, se observation |
| Instruktionens början, y=23,5/23,75, rubrik/inledning direkt synliga utan övertäckning | PASS |
| Native smooth-scroll med mellanpositioner, en scroll per val | PASS |
| Snabba punktval ger ett sista uppdrag; redan rätt position ger ingen scroll | PASS |
| Till kontrollpunkterna med rätt listfokus/topp | PASS |
| Reduced-motion ger auto-scroll, Tab/Enter/Space och rubrikfokus | PASS |
| Moms/NE-retur med ändrat destinationsår: rätt år/huvuddel/punkt/fokus/scroll | PASS |
| Alla elva befintliga bekräftelser matchar serverdata, en instruktion åt gången | PASS |
| Befintlig omkontrollvarning, kryss och exakt bekräftelserad/datum bevarade | PASS |
| Inga appdataskrivningar, horisontell scroll eller pageerrors | PASS |

### Observation vid första 320-körningen

Första körningen passerade 1440/390 men stannade vid en strikt toppjusteringsassertion
på 320 px: avståndet från avsedd scrollmarginal var 20,25 px i stället för under 3 px.
Ett avgränsat 320-omtest av oförändrad kandidat passerade därefter samtliga kontroller,
inklusive alla fyra listor, snabba val, instruktion, retur, fokus och reduced-motion.

Orsaken till första avvikelsen är **inte fastställd**. Den ska inte beskrivas som
bevisat font-/miljöfel eller som rättad i produktkod. Resultatet är från första
1440/390-körningen plus det begränsade 320-omtestet, inte en sammanhängande körning
utan avvikelser. Inga toleranser eller produktfiler ändrades för att få omtestet grönt.
Kontrollera särskilt toppjusteringen vid 320 px på riktig mobil under manuell acceptans.

## Databevarande och avgränsning

Direkt efter publicering och efter samtliga testkörningar: **alla 15 checklistrader
och alla andra publika applikationsdata exakt identiska** med före-kontrollen.
Schema/ACL/RLS/funktioner/migrationsledger identiska. Ingen appdataskrivning genomförd.
Tidigare manuella och syntetiska data bevarade, ingen återställning/radering behövdes.

320-bilden inspekterad. Ingen ny produktändring efter godkännandet. Lokal fokuserad
regression/typecheck/lint var redan grön för exakt samma kandidat och upprepades inte.
Vercel-bygget READY. Ingen fysisk mobil/Safari eller ekonomisk DB-E2E körd här.
Jira KAN-112 återläst To Do/otilldelad, inga ändringar/Done. KAN-113/KAN-114 orörda.

## Bevis och nästa steg

Root/audit-packages/KAN-112-mobile-staging-20261026/: preflight, före/efter-catalogue,
data/checklist-hashar, deployment, alias-before/after/correction, after-release-preservation,
navigation-1440/390/320 JSON/bilder, browser-first-run-partial, browser-failure,
browser-320-retest, sammanställd browser-results och final-verification.
Inga credentials eller verkliga känsliga användaruppgifter i rapport/Git.

Browserar avslutade; konton, fixtures, worktrees och rootens orelaterade ändringar
bevarade. Retention genomgången: aktiv KAN-112 och relevanta tidigare rapporter behålls.
Rapport/STATE checkpointas bara lokalt, ingen ytterligare push. Nästa steg: Pontus
manuella mobilacceptans på ordinarie Staging, särskilt 320-observationen ovan.
Stanna här. Ingen Production-publicering, migration, Edge-publicering eller Jira Done.
