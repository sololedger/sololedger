# KAN-112 – modern layout publicerad till Staging

2026-10-26. **PASS för Pontus manuella acceptans.**
Inga produktavvikelser observerade. Ingen Production-publicering godkänd.

## Exakta versioner och publicering

- Produktcommit: `934ce9becf31ac7d86f486632275ef9f32295d86`.
- Vercel: `dpl_EGHhDGsXoZE3XXgsWDqD9F7ZxZhW`, **READY**, Preview/staging.
- Staging: https://sololedger-git-staging-sololedger1.vercel.app
- Deployment: https://sololedger-dhiob3q7v-sololedger1.vercel.app
- Projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`.
- Supabase Staging `fzxqiqenqjzhlyxxpvhg`.
- Endast GitHub `staging` pushad, från 6673030 till exakt 934ce9b, fast-forward.
- GitHub `main` kvar `6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`.
- Ingen ny databas-, RPC-, Edge- eller miljöändring. Ingen Jira-mutation/Done.

## Förkontroll och scope

AGENTS/STATE och lokal granskningsrapport lästa. Ren L-arbetskopia på
`codex/KAN-112-year-end-checklist`, HEAD `6ce0537378de76d000faa0cd5dd789821ce56f73`.
Dess produkt/test/schema/lockfil identiska med kandidaten. Dokumentationscheckpoint
6ce0537 publicerades inte. Kandidatens tolv filer matchade godkänd fillista.
Jämförelse mot tidigare Staging visar exakt en produktkällfil YearEndGuide.tsx
och dess test som ändrad produkt/testkod; övriga tillägg är dokumentation/bildbevis.
Rootens orelaterade ändringar bevarade, aldrig använda som produktpushkälla.

Live schema/ACL/RLS/funktionshashar och hela migrationsledger jämfördes med senaste
verifierade KAN-112-läge. KAN-112-versionerna 20261026092741 och 20261026110015
kvar, ingen ny migration. Etablerad Session Pooler, TLS och sessionskontinuitet
verifierade i READ ONLY-läsning; checklist-RPC-definitioner lästa. Ingen migration,
Supabase-konfiguration eller Edge-publicering behövdes eller utfördes.

READY-deploymentens exakta SHA, branch, Preview, projekt och team verifierades.
Ordinarie Staging-alias låg kvar på `dpl_A1o8HmvWaxv9BqZJHRn3T97jVFtN`/6673030.
Det korrigerades inom stående aliasbehörighet till nya deploymenten/934ce9b.
Alla andra alias, inklusive Production, och miljövariablernas metadata oförändrade.
Faktisk browsertrafik använde rätt Staging-ref och den nya layouten.

## Riktad hosted smoke

Verifierade syntetiska A/B, befintliga kohortmarkörer kontrollerade. Verklig
Staging-app, Auth och checklist-RPC:er. REST-anrop begränsade till rätt ägare
och annan Supabase-origin nekad. Bara A:s bankkontroll för 2025 fick skrivas.

| Kontroll | Resultat |
| --- | --- |
| Dator 1440 och mobil 390, ingen horisontell scroll/pageerror | PASS |
| Fyra huvudkort, valt kort utan färdigbock, samma yttre bredd som Fakturor | PASS |
| Alla elva kontrollpunkter, endast en instruktion åt gången | PASS |
| Navigation i guiden skickar inga bekräftelseskrivningar | PASS |
| Sparade bekräftelser, markera/avmarkera, omladdning och nytt årsval | PASS |
| Simulerat HTTP503 vid sparning, synligt fel efter byte till annan huvuddel/punkt | PASS |
| Retry från annan punkt skickar samma oförändrade bankkommando | PASS |
| Verklig sparning når DB, fördröjt HTTP-svar hålls medan huvuddel/punkt byts | PASS |
| Pending fortsatt synlig i viewport, ingen extra skrivning från navigation | PASS |
| Befintlig omkontrollvarning, egen grön bock, bevarat kryss och exakt originaldatum | PASS |
| Retur från Profil, Fakturor, Bokslutsskulder, Inventarier, Moms och NE | PASS |
| Ändrat destinationsår: retur till 2025 och rätt huvudkort/punkt/rubrikscroll/fokus | PASS |
| Två visibility-/fokusåterkomster via verklig SDK utan falsk röd varning | PASS |
| B kan inte läsa A:s checklistor | PASS |

Omkontrolltestet återanvände befintlig syntetisk kundfakturavarning utan att
ändra den. Hela dess rad/datum jämfördes exakt före/efter. Bankflaggan återställd
efter varje testbredd; revision/datum på denna enda rad speglar faktiska testsparningar.
Desktop- och mobilbilder inspekterade. Inga produktändringar behövdes efter godkännandet.

Kort lokal regression efter publicering: `npm run test:year-end-checklist` och
`npm run test:e2e:safety` PASS. Detta inkluderar faktisk Auth/klient/store/guide,
StrictMode, replay, nätfel, ägarbyte och 35 min simulerad inaktivitet.
Hela säkra regressionen och fem visuella bredder var redan PASS före publicering
för exakt samma produktcommit och kördes inte om i sin helhet här.
Visibility-händelser drivs automatiskt; inga nya manuella OS-flikbyten utfördes.
Pontus har redan accepterat dessa för den funktionella grunden.

## Databevarande och begränsningar

Direkt efter publicering, före tester: **schema, migrationsledger, alla publika
datakontrollsummor och samtliga checklistor exakt oförändrade**.

Efter smoke: 14 checklistrader före och 14 efter. Endast syntetiska A:s bankkontroll
2025 ändrad enligt testscope, med ursprunglig bekräftelseflagga återställd.
Alla övriga 13 checklistrader och andra publika data oförändrade. Schema, ACL,
RLS och migrationsledger identiska. Inga ekonomiska transaktioner, momsperioder,
profiler, fakturor, årslås eller deklarationer ändrades.

Inga blockerande produkt- eller verktygsavvikelser. Alias behövde korrigeras
enligt ovan. Inga credentials eller verkliga känsliga data i rapport/Git.
KAN-112 återläst To Do/otilldelad, inte Done; KAN-113 och KAN-114 orörda.

## Bevis och nästa steg

Root/audit-packages/KAN-112-modern-staging-20261026 innehåller preflight,
before/after-catalogue, before/after-data, before/after-checklists, before-definitions,
deployment, alias-before/after/correction, after-release-preservation,
synthetic-before, browser-results, final-verification och desktop-/mobilbilder.
Lokala före-/efterbilder och implementation: docs/testing/kan112-modern-layout/
och docs/reviews/KAN-112-MODERN-LAYOUT-LOCAL-20261026.md.

Testbrowserar avslutade, syntetiska konton och fixtures bevarade. Retention
genomgången: aktiv KAN-112 behålls; tidigare rapporter är jämförelseunderlag.
Denna rapport och STATE checkpointas endast lokalt, ingen ytterligare push.

**Nästa steg:** Pontus manuella acceptans på ordinarie Staging-adress, Årsavslut
2025: granska arbetsytan på dator/mobil, välj kontrollpunkter och prova retur från
NE/Moms. Stoppa här efter verifieringen. Ingen Production-publicering är godkänd.
