# KAN-112 – lokala visuella bevis 2026-10-26

Alla bilder visar verkliga Home/Layout/YearEndGuide i Playwright med syntetisk
Auth/data och blockerade externa anrop. Inga riktiga användaruppgifter används.

- `before-1440.png`, `before-390.png`: färsk körning av föregående guide före
  implementation, source identisk med publicerad 6673030 (HEAD 16e47ff hade bara docs).
  Initial översikt, 0 bekräftelser, år 2026, företagsnamn Syntetiska A.
- `after-overview-1440.png`, `after-overview-390.png`: samma initiala scenario efter
  layoutändringen. Använd dessa för direkt före-/efterjämförelse.
- `after-1440.png`, `after-390.png`: arbetsyta med Bank vald, syntetisk bekräftelse
  och ändrat syntetiskt underlag. Visar skillnad mellan valt huvudkort och egen bock.
- `instruction-1440.png`, `instruction-390.png`: direkt screenshot av den valda
  instruktionsartikeln i samma scenario, utan efterföljande bildredigering.
- `visual-results.json`: fokuserade browserresultat vid 1440/1024/768/390/320 px.

Övriga fem bredders bilder och bilder med 200 % textstorlek finns lokalt under
`coverage/kan112-modern/`. Full säker regression: samma katalogs `regression.log`.
Alla fem bredder kontrollerar att ingen horisontell dokument-scroll uppstår.
200 % avser dubblerad rottextstorlek i browsern, inte manuellt OS-/browserzoom.
Flikåterkomst testas via befintliga automatiserade Auth/visibility-tester;
fysiska OS-flikbyten är tidigare manuellt accepterade av Pontus, inte omkörda här.
