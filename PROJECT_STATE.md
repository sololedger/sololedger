# SoloLedger Project State

2026-10-26 – **KAN-112 modern layout PASS lokalt inför separat Staging-beslut.**
Funktionell grund manuellt accepterad av Pontus, inkl flikbyten/sparande/navigation.
Ingen ny push, publicering, migration eller Supabase-/Production-ändring.

## Aktuell arbetskopia och kandidat

- L = audit-packages/KAN-100-app-release-20261024.
- Gren codex/KAN-112-year-end-checklist. Origin är lokal KAN-62-kopia, inte GitHub.
- Ny produktcheckpoint 934ce9becf31ac7d86f486632275ef9f32295d86, endast lokal.
- Föregående docs-HEAD 16e47ff; efterföljande layout-rapport/STATE-checkpoint enligt git log.
- Root:s tidigare dirty docs/AGENTS/arkiv/verktyg bevarade; inte produktpushkälla.
- Endast KAN-112-navigeringsnotisen uppdateras i root:s redan dirty STATE.

## Godkänd och nu lokalt genomförd layout

- Samma yttre innehållsbredd som Fakturor; extra max-w-3xl och dubbel padding borttagna.
- Fyra kompakta huvudkort. Val visas med diskret kant/bakgrund, aldrig en färdigbock.
- Kontrollpunkter vänster/vald instruktion höger från 1024 px; staplat på mobil.
  Endast en instruktion åt gången, bekväm läsbredd och tillförlitlig returscroll.
- Diskret framsteg för egna bekräftelser och separat befintlig systemstatus.
- Befintliga bockar, omkontrollvarningar, bekräftelsekomponent och notice återanvänds.
- Sparfel/pending synliga i gemensam sticky notice även vid byte av huvuddel/punkt.
- Enda ändrade produktkällfil YearEndGuide.tsx. Store/klient/Auth/RPC och ekonomisk
  logik oförändrade. Befintligt navigationskontrakt bevarat; ingen ny global navigation.

## Verifierat lokalt

- Verklig Home/Layout/guide, syntetisk data och blockerade externa anrop.
- 1440/1024/768/390/320 px: alla elva instruktioner och länkar, ett aktivt innehåll,
  full layoutbredd, ingen horisontell scroll eller pageerror. Bilder inspekterade.
- Tangentbord Tab/Enter/Space, fokus/scroll, långt företagsnamn, 200 % rottextstorlek PASS.
- Ingen bekräftelse ändras av bara navigation. Autospara/avmarkera/omkontroll PASS.
- Fel och osäkert/pågående sparförsök synliga efter vybyte, samma bankförsök retryas,
  fördröjd sparning överlever byte, ingen extra skrivning/falsk bekräftelse PASS.
- Års-/ägarbyte, tidigare sparade svar, sex returlänkar inkl NE/Moms med ändrat
  destinationsår och korrekt återställt år/punkt/rubrikfokus/scroll PASS.
- Befintlig verklig Auth/klient/store-regression, StrictMode, fem visibility-cykler,
  35 min simulerad inaktivitet och replay PASS. Fysiska OS-byten inte omkörda här.
- npm run test:regression fullständig PASS/exit 0, inklusive publik smoke 2/2.
- test:year-end-guide, test:e2e:safety, typecheck efter dev, guide-lint utan nya fel,
  git diff --check PASS. Ändrad produktfil har 0 lintfel.
- Ingen ny hosted/DB-test eller optimerad build: avgränsad UI-ändring utan ändrad
  bokföring/moms/NE/RPC/RLS/Auth. Inga verkliga användaruppgifter eller fjärrskrivningar.

## Bilder, rapport och Jira

- docs/reviews/KAN-112-MODERN-LAYOUT-LOCAL-20261026.md: scope, exakt fillista, tester/luckor.
- docs/testing/kan112-modern-layout/: jämförbara före-/efteröversikter för 1440/390,
  valda instruktioner/arbetsyta och visual-results.json, alla syntetiska.
- coverage/kan112-modern/: fem bredders bilder, 200 %-bilder och regression.log.
- Tidigare funktions-/hosted bevis i KAN-112-UX-STAGING-ACCEPTANCE-20261026.md,
  KAN-112-UX-FOLLOWUP-20261026.md och root/audit-packages/KAN-112-ux-hosted-20261026/.
- KAN-114 skapat efter ny dubblettkontroll och uttryckligt godkännande: SoloLedger –
  enhetlig visuell modernisering av hela applikationen, Task/Medium/To Do/otilldelad.
  Återläst. Endast planering; ingen implementation. KAN-112 inte Done; KAN-113 separat.
- Retention genomgången: aktiv KAN-112 behålls, äldre rapporter bär tidigare evidens.

## Publicerad funktionell bas (oförändrad av detta lokala arbete)

- Senast verifierad Staging 667303026ecf41b75e31c3f69e292a1c1aabbfd0,
  dpl_A1o8HmvWaxv9BqZJHRn3T97jVFtN READY, Preview/staging på ordinarie alias.
- Supabase Staging fzxqiqenqjzhlyxxpvhg, KAN-112-migrationer 20261026092741 och
  20261026110015 enligt senaste hosted verifiering. Ingen ny DB-/Edge-åtgärd.
- Senast verifierad GitHub main 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e.
  Inga nya fjärrkontroller behövdes för UI-arbetet. Production orörd.

## Nästa säkra steg

- Pontus granskar före-/efterbilder och beslutar om exakt 934ce9b för Staging.
- Stanna efter lokal verifiering. Ingen push, deployment eller migration godkänd.
- Alla testbrowserar och lokala smoke-servern avslutade. Inga pågående tester.
