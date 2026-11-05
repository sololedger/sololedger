# Fast Staging-adress efter godkänd release

När en uttryckligen godkänd push till `staging` har gett en READY Git Preview i
Vercel, kör releasehjälparen som sista steg före acceptans via den fasta
[Staging-adressen](https://sololedger-git-staging-sololedger1.vercel.app/).
Ta deployment-ID från det godkända bygget och använd den fulla commit som
godkändes. Kör en Staging-release i taget.

```powershell
$env:SOLOLEDGER_VERCEL_CLI = '<absolut sökväg till installerad Vercel CLI:s dist/index.js>'
node scripts/verify-staging-alias.mjs <deployment-ID> <full-commit> --approved
```

Kör från produktkopians rot med Node.js och en Vercel CLI som är inloggad i
`sololedger1` och har behörighet att hantera Staging-aliaset. Använd en session
som redan har en giltig kortlivad `VERCEL_OIDC_TOKEN` för projektets skyddade
Preview. Hjälparen använder den endast för att läsa startsidan och dess
JavaScript via HTTPS. Den behöver tillgång till den publika
`NEXT_PUBLIC_SUPABASE_URL` i Vercel och läser aldrig ut servernycklar för kontroll.

`changed: false` betyder att kopplingen redan var korrekt. `changed: true`
betyder att det fasta aliaset flyttades och att efterkontrollen passerade.
Båda fallen verifierar samma JavaScript som i det godkända bygget och rätt
publik Staging-databas. Kontrollresultatet visar gammal och verifierad
deployment, commit och Production-deployment.

Vercel måste klassificera själva deploymenten som vanlig Preview i dess
OIDC-metadata. Hjälparen kontrollerar att deploymenten har de förväntade
Supabase-variablerna och att den byggda klienten har rätt Supabase-adress.
Servernycklarnas värden kan inte verifieras med dessa kontroller. En aliaslista
med nästa sida, saknad eller motstridig sidinformation, eller 100 poster
stoppar körningen.

Vid fel, avbryt releaseverifieringen. Om felet kom under omkoppling eller
efterkontroll kan Vercel redan ha tagit emot ändringen. Läs då först av den
faktiska kopplingen innan ett nytt försök övervägs. Vercels aliaskommando kan
inte villkora skrivningen på den gamla kopplingen. Hjälparen läser därför om
kopplingarna direkt före skrivning och jämför dem efteråt.

Lokala syntetiska tester körs med `node --test scripts/test-staging-alias.mjs`.
