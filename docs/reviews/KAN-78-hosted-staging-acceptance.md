# KAN-78 – hostad Staging-acceptans

2026-10-19. **Production BLOCKED av separat KAN-104. KAN-78:s riktade hostade tester PASS.**

Kandidat: `67d314a95f9f964aa2adabce81e3cf799366eb3f`, branch
`codex/KAN-78-accounting-load-safety`.
Preview: https://sololedger-ljwep3c07-sololedger1.vercel.app,
deployment `dpl_7wY63AeD4koLkazXdDLGPA2zneix`, Ready / Preview.
Detta uppdrag har inte publicerat eller ändrat kandidaten.

## Säker miljö och testkonton

Projektägaren godkände i detta uppdrag skapande av syntetiska användare och relevanta
data-/bokföringsskrivningar i **fzxqiqenqjzhlyxxpvhg**, inte migrationer/schemaändringar
eller andra miljöer. Projektet verifierades live som `sololedger-staging`,
ACTIVE_HEALTHY. Preview-identiteten/Ready-statusen verifierades före testerna.

Testklienterna accepterar enbart `https://fzxqiqenqjzhlyxxpvhg.supabase.co`.
Inför varje skrivsekvens kontrolleras URL och verifierad användare; browserns
skrivgräns kontrollerar dessutom att autentiseringens ägare är ett av just dessa
två nya konton. Bara granskade boknings-/moms-RPC:er och den ägarbundna
profilsparningen tillåts. Ingen Vercel-/Supabase-konfiguration ändrades.

| Konto | Syntetisk e-post | ID / inställningar |
| --- | --- | --- |
| A | sololedger-kan78-a-1792413762589@example.invalid | `535a8629-d554-4467-b1bb-85d4002b0738`, Company A, kvartal, full normal avdragsrätt |
| B | sololedger-kan78-b-1792413762589@example.invalid | `3974c719-c171-4ec0-add6-0b3ad1fe9fde`, Company B, månad, ingen normal avdragsrätt |

Kontona skapades bekräftade via befintlig Auth Admin-funktion, utan utskick.
Slumpade lösenord finns endast i Git-ignorerad testlagring, inte i rapporter/loggar.
Inga riktiga kunder, betalningar, bilagor eller användaruppgifter användes.

## A. Bokningsåterupptagning – PASS

Den riktiga Home/TransactionForm i den publicerade Preview-versionen skickade en
vanlig programvarubokning på **1 250 kr, 25 % moms, 2026-01-20** för A.
Playwright lät den riktiga RPC:n utföras och verifierade success-kvittot, men
avbröt svaret till UI efter COMMIT. Det var en verklig bokning, inte ett mockat kvitto.
Försöket sparades av produkten i ägarbunden localStorage.

- Transaktion: `e5875e00-9e18-43cc-8b5f-ee0a1d3c07bf`.
- Idempotensnyckel: `14d61dc1-928b-4e4c-ae93-d5f9c79802eb`.
- Ett riktigt ekonomiskt läsanrop ersattes säkert med HTTP 503 i browsern.
  Återuppta var tillgänglig medan dashboardens ekonomiska barn var dolda.
- Utloggning A / inloggning B: A:s försök/beskrivning och ekonomidata visades inte.
  B:s direkta RLS-läsningar av A:s transaktioner och journalrader gav inga rader.
  Tillbaka som A återkom samma sparade försök.
- Återupptagning vid pågående ekonomiskt läsfel gav `idempotent_replay=true`,
  samma transaktions-ID, exakt samma payload och nyckel. Kvittot var begripligt;
  rapportbelopp förblev dolda tills rapportåterförsöket lyckades.
- Verifierat på **desktop 1280 och mobil 390**. Mobilprovet använde samma riktiga
  sparade försök och kvitto i en separat browserkontext, inte en andra ursprungsbokning.
- Ytterligare direkta återspelningar med samma ägare/nyckel skapade inga nya rader.
  Efterkontroll: exakt **en transaktion, tre journalrader, debet minus kredit 0**.
  Journal: 5420 debet 1 000, 2641 debet 250, 1930 kredit 1 250.
- A har totalt fyra transaktioner och fyra beständiga bokningskvitton, inklusive
  momsfixturerna nedan. Antalet ökade inte vid återspelning.

## B. Momsrapport – PASS på desktop och mobil

Egna riktiga försäljningsposter skapades via den befintliga atomära boknings-RPC:n:
A 2 500 kr i januari 2025, 6 250 kr i januari 2026 och 3 750 kr i april 2026.
Momsperioder skapades med `ensure_vat_periods` för dessa syntetiska användare.
De nya perioderna är öppna; inga perioder stängdes eller deklarerades i detta prov.

| Hostat test | Resultat |
| --- | --- |
| 2026 kvartal 1: utgående 1 250, ingående 250, netto 1 000 kr | PASS 1280/390 |
| Byte till kvartal 2: föregående rapport döljs, utgående 750, ingående 0 kr | PASS 1280/390 |
| Byte till 2025 kvartal 1: föregående rapport döljs, utgående 500, ingående 0 kr | PASS 1280/390 |
| Omladdning och ny beräkning av rätt års/periods data | PASS 1280/390 |
| Injekterat HTTP 503 i rapportens transaktionsläsning | PASS 1280/390: rapport stoppad, inga rapportbelopp |
| Återställd läsning och Beräkna igen | PASS 1280/390: korrekt rapport återkommer |
| HTTP 503 vid periodläsning efter årsbyte | PASS 1280/390: svensk feltext, inga gamla rapportbelopp |
| Försök igen efter periodfel | PASS 1280/390 |

Fel injicerades i browserns transport, inte med DB-fel, schemaändringar eller
förändrade riktiga bokföringsposter. Testerna väntar tills Supabase-klientens
automatiska transportåterförsök är slut. Bokföringsreglernas enkla referensfall
stämmer med faktiska journaler och rapportfält; inga formler/skrivfunktioner är
ändrade av KAN-78. Detta är inte generell acceptans av alla moms-/årsbokslutsregler.

## C. Användarisolering och separat KAN-104

**Normalt fullständigt utloggnings-/inloggningsflöde: PASS.** Sparade försök och
ekonomiska rader följer rätt ägare. **Kontrollerat profilrace: FAIL / REPRODUCERAT**
på både 1280 och 390. Även det tidigare sena A-svaret reproducerades hostat.

Exakt reproduktion:

1. Logga in A i den riktiga Preview-appen och öppna Profil; Company A/kvartal/full.
2. Öppna samma origin i en andra flik. Ett testhjälpmedel med oförändrad Supabase-SDK
   gör riktiga `signInWithPassword`-anrop för A och sedan B. Appens egen `useAuth`
   får de riktiga session-/cross-tab-händelserna. Inga hooks eller profiler mockas.
3. Håll tillbaka riktiga Staging-profilsvar för huvudfliken, inklusive återförsök,
   för att styra svarsordningen. B:s verifierade e-post visas medan profilformuläret
   fortfarande visar **Company A, kvartal, full**, i stället för B/månad/ingen.
4. Släpp B-svaret: Company B visas. Släpp därefter det gamla A-svaret:
   **Company A ersätter åter B:s profil**, medan aktuell inloggning fortfarande är B.
   Båda sekvenserna är registrerade i resultatfilen för desktop och mobil.

Detta är en kontrollerad hostad reproduktion med syntetiska identiteter och
fördröjda riktiga svar, inte en påstådd spontan Production-incident. Normal
UI-utloggning laddar om sidan och passerade separat; flik-/sessionsevent utan
fullständig omladdning är den särskilda riskvägen.

### Observerad skriv- och bokföringspåverkan

Under övergången ändrades **endast företagsnamnet** i B:s profilformulär till
`KAN78 B profile-save proof` och vanliga Spara ändringar klickades.
Den riktiga profiluppdateringen skrev till **B:s** rad, men skickade även med
A:s kvarliggande momsinställningar. DB-efterkontroll visade:

| B:s inställning | Före | Efter namnsparning |
| --- | --- | --- |
| Momsperiod | month | quarter |
| Normal avdragsrätt | none | full |

Två riktiga syntetiska köp om 1 250 kr med 25 % moms och
`input_vat_deduction_entitlement=profile_default` bekräftar följden:

- Före den oavsiktliga profilöverföringen: 5420 debet 1 250, 1930 kredit 1 250,
  **ingående moms 0 kr**, transaktion `0ab10624-d66f-4eef-ae94-d93f075c2084`.
- Efter den oavsiktliga profilöverföringen: 5420 debet 1 000, 2641 debet 250,
  1930 kredit 1 250, **ingående moms 250 kr**, transaktion
  `1f2b25b4-ffdc-444d-81d1-6e24fc0d11ee`.

Detta är alltså inte bara ett namnvisningsfel: fel profilsammanhang kan sparas och
ändra senare bokföring. RPC:n använde den då faktiskt sparade B-profilen;
ingen RLS-/serverbehörighetsöverträdelse eller skrivning till A:s rad påvisades.
Ingen automatisk bokning utfördes under profilbytet; provet krävde användarens
profilsparning och efterföljande bokning.

B:s profil **återställdes och efterkontrollerades** till Company B/månad/ingen.
De två syntetiska bevisverifikationerna behålls auditerbara, inte raderade eller
omskrivna. B har tre transaktioner totalt, inklusive sin särskiljande försäljning
på 8 750 kr. Endast de egna nya testkontona berördes.

## Testbevis, begränsningar och beslut

Lokala testhjälpmedel/resultat finns i arbetskopians syskonkatalog:

- `../KAN-78-hosted-support.mjs`, `../KAN-78-hosted-acceptance.mjs`.
- `../KAN-78-hosted-vat-result.json`, `../KAN-78-hosted-booking-mobile-result.json`.
- `../KAN-78-hosted-acceptance-first-session-result.json`: verklig första COMMIT.
- `../KAN-78-hosted-acceptance-result.json`: desktopåterupptagning/isolation PASS;
  dess senare infrastruktur-timeout i momsprovet ersätts av den slutliga separata
  momskörningen med alla assertioner PASS.
- `../KAN-78-hosted-auth-race.mjs`, `../KAN-78-hosted-auth-race-result.json`:
  faktiska profiler före/sent svar, sparningsbevis och journaler, inga hemligheter.

Testhjälpmedlen korrigerades för global utloggning som ogiltigförklarar separata
kontrollsessioner, asynkront kvittomeddelande, växling först när appen laddat,
oförändrat år som inte ska ge ett artificiellt change-event, transportåterförsök
och dubbla profilförfrågningar. Inga produktfiler eller assertioner försvagades.
Samma ursprungliga bokning/nyckel återanvändes efter testavbrotten.

Produktkod, `useAuth`, RPC:er, schema, migrationer och Preview är oförändrade.
Inga pushar, commits, merge/rebase eller deployer i detta uppdrag. Production och
Jessikas data har inte använts. Staging har fortfarande **52 migrationer**, med
de två kända inventarieversionerna `20261012123000` och `20261012153000` orörda.
Syntetiska konton/data behålls för ledarens granskning; ingen osäker rensning görs.

**Rekommendation: Production BLOCKED.** KAN-78:s riktade acceptans passerar, men
KAN-104 har nu observerad ekonomisk skrivpåverkan och behöver ett separat
implementationsuppdrag samt omtest av profilbyte, profilsparning och bokföring
innan release godkänns. KAN-104 implementeras eller ändras inte här.
KAN-78 behålls In Review / Pontus. Ingen Production-publicering är godkänd.
