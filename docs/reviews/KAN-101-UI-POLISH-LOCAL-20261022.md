# KAN-101 Etapp 1 – UI-putsning LOCAL PASS

2026-10-22. Pontus har manuellt accepterat tidigare Staging på KAN78 Company A/B:
normalfall, tabeller/journal, R15/R16 och avvikelsers varningar/spärrar.
Nu godkänd enbart lokal putsning. Gren `codex/KAN-101-ne-presentation`, direkt bas
`74c24b269d02009f835bbf5716725c34ebfbefb7`. Exakt ny checkpoint: Git.

## Ändring och avgränsning

- NEBilaga: ett kompakt block ”Kontrollera bank och balans” med två oberoende
  orsaker. Negativ bank visas med total och varje kontos signerade saldo;
  balansdifferensen med sitt oförändrade belopp. Ingen orsak antas förklara den andra.
- Samma negativa 19xx-konto dubbleras inte i generell kontovarning. Endast exakt
  matchande konto/saldo i negativbankslistan omfattas. Kontotäckningens fulla antal,
  status och individuella granskningsorsak kvarstår. Övriga kontovarningar kvarstår.
- Längre ned visas korta hänvisningar i stället för upprepade varningsrutor.
  Låsknappens disabled/aria-disabled/title och spärrvillkor är oförändrade.
  Separat extern spärr visas också vid knappen när bank/balans avviker.
- NEAccountTable: journalen direkt vid öppnat konto; standardförklaring, namnkälla
  och debet-minus-kredit under ”Visa beräkningsförklaring”. Granskningsorsaker för
  review-konton är direkt synliga. Kortare ingress utan förlust av journalrader.
- NEUnderlagReview: års-/kumulativa belopp, nettning samt B10:s tekniska förklaring
  kan öppnas separat. Bidrag, nollnetton, rättelser, historiska beslut och IB kvar.
- Huvudlayout/R15/R16/R17 oförändrade. Endast tre UI-komponenter, tre testskript,
  docs/bilder. Tom diff för src/lib/hooks/src/app/Supabase/package.json/lock.
  Beräkningar till och med yearCloseBlockReason oförändrade. Ingen ändrad kontrollgräns,
  kontokoppling, skatte-/årslåsregel, läs-/skrivtransport eller databas.
- Därför inget skrivande bokförings-E2E: integrationsytorna påverkas inte av denna presentation.
  Ingen live-DB-kontroll/inloggning/credentialläsning/DB-skrivning/migration/push/deploy.

## Verifiering mot slutlig kod

- `test-ne-b14-ui.mjs --compare-head`: 11 fall × låst/öppet ×1440/390/320 px PASS.
  Normal moms/skuld/fordran/tomt, bank+differens, enbart bank, enbart differens,
  exakt1 kr/1,01 kr och extern spärr ensam/tillsammans. R-/B-belopp och låsvillkor
  jämförda med accepterade74c24b2. Totalt/individuellt banksaldo och differens kontrollerade.
- `test-ne-review.mjs`: 16 grupper och tre browserbredder PASS. Oförändrad service
  och renderade belopp mot tidigare produktbas, rättelser/historik/IB/>1000 rader,
  journal/laddning/fel/ägare/år/sena svar. Nytt prov öppnar/stänger beräkningsförklaring
  medan journalen förblir synlig. Inga nätanrop, skrivningar, JS-fel eller överrullning.
- `test-ne-account-coverage.mjs`: 21 service/renderfall/8000 kontotillstånd och tre bredder PASS.
- NE-balans15 kontroller, equity26 fall + tre bredder, warnings10 fall,
  tax-adjustments18 fall/15994 klassificeringar, chart-review33 fall/åtta konflikter/tre bredder PASS.
- Typkontroll PASS; ESLint alla tre ändrade komponenter och tre testskript PASS (0 fel/varningar).
- Slutligt optimerat bygge PASS med syntetisk localhost:9-konfiguration; inga env-filer ändrade.
  Första försöket stoppades av Google Fonts-nätverk. Omkörning med nätåtkomst och
  slutlig omkörning efter sista styling PASS. Befintlig varning om flera lockfiler kvarstår.
- Whitespace PASS. Normal-/avvikelse-/kontodetaljbilder granskade på dator/mobil.
- Full repo-lint och full säker regression inte återkörda; fokuserad riskbaserad verifiering.
  Två tidiga testassertioner uppdaterade för borttagen varningsdubblett respektive
  extern spärr i redan låst vy. Belopps-/spärrjämförelser behölls, slutkörningar gröna.

Råloggar: ignorerade `coverage/kan101-polish/`. Utvalda syntetiska bilder:
`docs/testing/kan101-polish-local-20261022/`. Tidigare acceptansbevis bevarade.

## Stoppunkt

Redo som lokal kandidat för nytt Staging-beslut. Enligt senaste releasebevis är Staging
fortsatt74c24b2, inte putsningen; ingen ny remote-kontroll. Production orörd.
Jira återläst KAN-101 In Review/Pontus; ingen mutation eller Done.
R15/R16/individuella skatteuppgifter kräver egen bedömning. KAN-96/108/83/34 öppna,
KAN-100 inte byggd. Ingen full deklarationsacceptans. Nästa steg: uttryckligt
godkännande av exakt ny produktcommit för Staging.
