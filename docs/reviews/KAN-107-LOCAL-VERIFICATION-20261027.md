# KAN-107 – kompletterad lokal verifiering före Staging

2026-10-27. Pontus uppdrag: undersök auth-smokehindret, kör om utan försvagade prov och stanna för nytt beslut. Ingen commit, push, deployment, databas- eller Jira-ändring.

## Kandidat och bevarande

- Produktkälla: `audit-packages/KAN-100-app-release-20261024` (L), gren `codex/KAN-107-withdrawal-guidance`, HEAD `e4f35502724c83c6e8493fadb61dc8a09035e3d1`.
- KAN-107:s tidigare ocommittade produktkod och prov används oförändrade. Root är fortsatt äldre dokument-/verktygskopia, inte produktpushkälla.
- AGENTS/STATE, ursprunglig kraschlogg, teststartare, auth-proven, Next/Turbopack-dokumentation och relevant installerad verktygskod lästa. Jira KAN-107 återläst To Do/Task/Medium/otilldelad, utan mutation.
- Tidigare rapporter och prototyper bevarade. Äldre publika auth-felunderlag kopierade till `coverage/kan107-earlier-auth-evidence-20261027` före den nya sammanhängande sviten. Hela befintliga `test-results/` kopierades dessutom till `coverage/kan107-pre-smoke-test-results-20261027` före svitens publika Playwright-steg.

## Grundorsak: vad som är fastställt

Det tidigare felet inträffade i **utvecklingsserverns PostCSS-hjälpprocess**, före att inloggningssidan kunde renderas. Turbopack rapporterade för `src/app/globals.css`: `node process exited before we could connect to it with exit code: 0`. Processens stdout/stderr var tomma. Auth-proven hittade då verktygets felruta i stället för login; testerna gjorde rätt som misslyckades.

Installerad Turbopack-kod använder en lokal socket till Node-hjälpprocessen och avslutar processen med kod 0 när socketen stängs. Det stämmer med ett avbrutet process-/kommunikationsliv, men **bevisar inte varför just den gamla anslutningen stängdes**. Loggen saknar uppgift som kan fastställa exempelvis resursbrist, säkerhetsprogram eller exakt processavslutare. Dessa utlösare ska därför inte påstås vara verifierade.

`globals.css`, PostCSS-konfiguration, Next-konfiguration, beroenden/lockfil, auth-produktkod, auth-smokeproven och deras startare har ingen KAN-107-diff. Ett tidigare godkänt produktbygge använde samma Next/Tailwind. Nu passerar alla tre auth-proven med **oförändrad KAN-107-kod**, samma Turbopack och samma befintliga prov/startare. Varningen om två lockfiler finns kvar även vid PASS; den är inte belagd som kraschorsak.

Bedömning: resultaten talar starkt för ett **övergående lokalt verktygs-/körmiljöfel**. Något fel i KAN-107:s produktlogik har inte påvisats. Den exakta historiska utlösaren är inte reproducerad. Inget underlag motiverar att ändra produktkod, byta bundler, uppgradera beroenden eller radera cache/andra filer.

## Åtgärd och representativ miljö

Ny, separat lokal Next-process på `127.0.0.1:3107`, via oförändrad `npm run test:e2e:smoke`. Next 16.2.6/Turbopack, Node 24.15.0, Tailwind/PostCSS 4.3.0 och Playwright 1.63.0. Därefter hela `npm run test:regression` i följd. Inget parallellt produktbygge/devserver startades under omkörningarna. Ingen ändring av timeout, selector, assertion, säkerhetskontroll eller devkonfiguration.

Processlokal syntetisk konfiguration pekar Supabase-klienten mot `http://127.0.0.1:9` med uttryckligen falska testnycklar. Ingen miljöfil lästes med hemligheter, skapades eller ändrades. Installerad Chromium används genom processlokal `PLAYWRIGHT_BROWSERS_PATH`. Körningen fick åtkomst som behövs för lokala underprocesser och offentliga typsnitt, utan publicering.

Representativiteten gäller **riktig Next/Turbopack-rendering av den aktuella appens publika auth-vyer**, inklusive FAQ-frågelänk genom reload och byte mellan login/registrering/återställning. Ingen auth-vy ersattes med en mock. Proven skickar inte login-, registrerings- eller återställningsformulär. Detta verifierar inte verklig inloggning eller e-postleverans mot Supabase. Övriga domän/UI-prov använder sina befintliga syntetiska transporter.

## Resultat

| Kontroll | Resultat och evidens |
|---|---|
| Tre publika auth-smoke, separat | **PASS, 3/3**, exit 0. `coverage/kan107-auth-verification-20261027.log`, HTML-rapport under motsvarande katalog. |
| Sammanhängande säker regression | **PASS**, hela `npm run test:regression`, exit 0. Även auth **3/3 PASS** inne i sviten och efterföljande kategori-/bokningsprov PASS. `coverage/kan107-regression-verification-20261027.log`; HTML-rapport under `coverage/kan107-regression-verification-20261027/html`. |
| Oförändrad produkt och testdefinition | **PASS**, 155 produkt-/konfigurations-/auth-provfiler har samma SHA-256 före/efter slutkörningen. Inga produkt- eller provfiler redigerade. Manifest: `coverage/kan107-verification-source-manifest-20261027.json`. HEAD oförändrad, ingenting staged. |

De gamla FAIL-resultaten ligger kvar i tidigare loggar och rapport. Ett senare PASS raderar inte händelsen.

## Exakt ändrade filer i denna komplettering

1. Ny `docs/reviews/KAN-107-LOCAL-VERIFICATION-20261027.md` (denna rapport).
2. `docs/reviews/KAN-107-LOCAL-IMPLEMENTATION-20261027.md`: kompletterande hänvisning till utfallet, ursprungligt FAIL bevaras.
3. L:s `PROJECT_STATE.md`: aktuell verifieringsstatus och nästa säkra steg.
4. Rootens `PROJECT_STATE.md`: samma aktuella läsanvisning.

Inga produkt-, test-, beroende-, konfigurations- eller databasfiler ändras i denna komplettering. Lokala genererade provloggar, rapporter och tidigare evidenskopia ligger under `coverage/`; vanliga genererade Next-/testresultat skapas av verktygen. Inga manuella ingrepp i genererade filer, ingen rensning eller återställning av tidigare arbete.

## Kvarstående risk och nästa beslut

Den exakta utlösaren till den gamla verktygskraschen är okänd. Om den återkommer ska kraschlogg och processtidpunkt bevaras; den får inte döljas genom svagare prov. Ett godkänt lokalt resultat ersätter inte senare verifiering av en godkänd exakt Staging-kandidat och dess riktiga miljö.

Stanna efter verifieringen. Pontus fattar nytt beslut om eventuell lokal commit och därefter separat Staging-publicering. Ingen sådan åtgärd ingår här.
