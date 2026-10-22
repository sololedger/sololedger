# KAN-99 – konkret plan för guidad årsavslutning

Etapp A har efter separat godkännande implementerats lokalt. Se KAN-99-ETAPP-A-LOCAL-PASS.md. Resterande text är beslutsunderlaget före implementation.

**För beslut: börja med etapp A nedan. Ingen implementation godkänd eller gjord.**
2026-10-22. Jira KAN-99: Story, High, To Do, otilldelad; Pontus har valt detta planuppdrag.
KAN-98: Production PASS och Done, verifierat i Jira. Produktbas/main/staging:
**53b9c828eed71d0be17043e4aaf7b95d99d0ad35**, ren lokal produktkopia.
Tidigare `KAN-99-readonly-year-end-2026.md` återanvänds; dess saknade leverantörsflöde är nu löst.
Jessikas verkliga underlag/profil har inte lästs. Detta är hennes avsedda normalresa,
inte ett intyg att hennes bokföring är komplett eller att hon saknar ytterligare skattefrågor.

## Resan: ”Förbered och avsluta 2026”

Visas i ordning nedan, med vald ägare/år hela vägen. Varje steg har instruktioner i vyn,
”Öppna …” och ”Tillbaka till årsavslutet”. Mobilens meny/Mer innehåller samma vyer.
En manuell bekräftelse är aldrig systemverifiering. Fel/okänt/laddning visas uttryckligen.
Den 22 oktober pågår fortfarande 2026: guiden ska säga **Förberedelser – året är inte slut**.

### 1. Samla underlagen och jämför banken

**Varför/hur:** undvik saknade eller dubbla poster. Välj 2026, öppna **Profil** och kontrollera
verksamhetens moms-/avdragsfakta mot registreringen. Hämta bankkontoutdrag till 31/12 när året är slut.
Öppna **Bokföring**, banksaldot och transaktionshistoriken. Matcha varje bankhändelse med datum,
belopp och verifikation; skilj egna insättningar/uttag från försäljning/kostnad. Jämför slutsaldot
för faktiskt företagskonto med bokfört saldo; red ut IB om det redan skiljer vid årets början.
Bankkortet visar konto **1930**; andra konton måste granskas i kontounderlaget, inte antas ingå i kortet.
**System/egen kontroll:** systemet visar bokföringen, inte bankens facit eller saknade kvitton.
**Fel/klart:** spåra saknad/dubbel/feldaterad post, använd befintlig bokning/rättelse efter underlagskontroll;
osäker motpost → stopp. Klart när banken stämmer och varje differens/underlag är utrett av användaren.

### 2. Kundfakturor som var obetalda 31 december

**Varför/hur:** kontantmetoden behöver ändå kundfordringar vid bokslut. Öppna **Fakturor** för 2026,
jämför samtliga egna fakturor med bankbetalningar till 31/12. För en verkligt obetald faktura,
använd befintlig bokslutsfunktion för kundfordran; kontrollera verifikationen och NE:s fordran.
En januaribetalning registreras på samma faktura med verkligt betalningsdatum, inte som ny försäljning.
**System/egen kontroll:** systemet validerar kända fakturor/momsfakta/bokning, inte fakturor utanför registret.
**Fel/klart:** osäker moms eller tidigare bokning → red ut i fakturavyn, bokför inte dubbelt.
Klart när varje extern faktura är jämförd och nödvändiga kundfordringar bokförda.

### 3. Leverantörsfakturor som var obetalda 31 december

**Varför/hur:** årets kostnad/skuld ska inte försvinna bara för att betalningen kommer nästa år.
Öppna **Bokslutsskulder**, välj 2026 och följ KAN-98: jämför mottagna fakturor med banken,
kontrollera leveransår, belopp, avdragsrätt och bilaga; registrera bara styrkt, helt obetald svensk
vanlig kostnad i SEK. Följ ”Visa i Bokföring”; kontrollera kostnad, eventuell moms och skuld.
Betala sedan via samma skuld på verkligt datum 2027, inte genom en ny kostnadsbokning.
**System/egen kontroll:** atomisk bokning/replay/koppling kontrolleras; fullständighet måste intygas av användaren.
**Fel/klart:** använd guidens rättelseväg; utland/Adobe, delbetalning, kredit eller inventarie → stopp för
särskild bedömning. Klart när alla underlag är avstämda och alla tillämpliga bokslutsskulder bokförda.

### 4. Kontrollera inventarier och årets avskrivning

**Varför/hur:** ett större inköp kan behöva finnas kvar som tillgång över flera år.
Öppna **Inventarier**, jämför årets inköp/kvitton med registret, läs varje granskningsorsak
och befintligt förslag för 2026. Genomför nödvändig årsavskrivning i befintligt flöde och kontrollera
dess journal samt kvarvarande värde i NE. Om inga tillgångar finns: kontrollera även årets större inköp.
**System/egen kontroll:** systemet granskar registrerade tillgångar/regler, inte att alla inköp registrerats.
**Fel/klart:** osäkert IB, utlands-/obetalda inköp, försäljning eller saknat regelunderlag → stopp,
ingen gissad avskrivning. Klart när registret stämmer och nödvändig avskrivning är bokförd/inget återstår.

### 5. Granska och avsluta momsen – inklusive Adobe

**Varför/hur:** momsfri försäljning betyder inte automatiskt att EU-tjänster saknar svensk moms.
Öppna **Bokföring**, hitta EU-tjänsteposterna i historiken och jämför Adobe-fakturornas säljare/land,
datum, valuta, beskattningsunderlag och fakturamoms. För NY styrkt EU-tjänst används befintlig EU-tjänsteväg;
en redan bokförd faktura ska granskas/rättas, inte registreras igen. Öppna **Moms**, välj rätt period,
beräkna rapporten och granska ”Inköp från andra EU-länder”/journalavstämningen.
**Villkorligt exempel:** styrkt EU-tjänst 228 SEK utan fakturamoms, 25 % omvänd moms och ingen
avdragsrätt → underlag ruta 21 = 228, utgående moms ruta 30 = 57, avdrag ruta 48 = 0 för just posten.
Avdragsrätt/land/valuta får inte bestämmas utifrån namnet Adobe. Obetald utlandsfaktura omfattas inte av KAN-98.
**System/egen kontroll:** rapporten beräknar bokförda momsfakta; användaren måste jämföra faktura/registrering.
**Fel/klart:** följ journalen till posten och befintlig rättelse; stäng inte vid differens/osäkra fakta.
Efter periodens slut: läs konsekvensen och välj **Stäng momsperiod**. Steget avser granskad/stängd moms,
inte inlämning eller betalning; kontrollera även att samtliga erforderliga perioder faktiskt finns.

### 6. Granska NE och gör ett sparat bokslutsunderlag

**Varför/hur:** balanserad bokföring räcker inte som färdig skattedeklaration. Öppna **NE-Bilaga**,
läs underlagsgranskningen, följ varningar till konton/journal och jämför resultat, bank, fordringar,
leverantörsskulder B15 och inventarier med steg 1–5. Utred osäker R1/R2-klassning och skattejusteringar.
För därefter granskade uppgifter till Skatteverkets förenklade årsbokslut om K1 är tillämpligt;
sammanställ, skriv under och spara bokslut och underlag. Befintlig NE-vy är inte en sådan komplett handling.
**System/egen kontroll:** journalbaserade värden/varningar finns; R15/R16=0 i adaptern bevisar inte
att justering saknas, R17 är inte hela NE. Personliga skatteval och uppgifter efter R17 kräver egen kontroll.
**Fel/klart:** osäker justering → utred med underlag/Skatteverket eller redovisningshjälp, gissa inte noll.
Klart när bokslutsunderlaget är granskat/signerat/sparat och kvarvarande deklarationsuppgifter är identifierade.

### 7. Lås bokföringsåret när underlaget verkligen är klart

**Varför/hur:** skydda färdig bokföring mot sena ändringar. Efter steg 1–6 och avslutat kalenderår:
öppna **NE-Bilaga → Lås räkenskapsår 2026**, läs konsekvensbekräftelsen och välj medvetet.
**System/egen kontroll:** befintlig server validerar balans, kända moms-/kund-/inventariehinder och lås;
den intygar inte bankavstämning, alla externa fakturor, skatteval eller att årsslutet har passerat.
**Fel/klart:** läs serverorsaken och återgå till berörd vy; ingen kringgång av moms-/inventariespärr.
Klart först när servern bekräftat låset. Visa ”Bokföringsår låst”, aldrig ”Allt deklarerat”.
För 2027 används fortsatt ordinarie kumulativ balans; skapa ingen extra IB- eller 8999/2019-bokning.

### 8. Lämna deklarationerna och följ betalning separat

**Hur/klart:** lämna momsdeklarationen hos Skatteverket, spara kvittot och använd därefter befintlig
deklarationsbekräftelse i **Moms** med rätt datum. Kontrollera skattekontots faktiska avräkning och
banköverföringen var för sig innan respektive befintlig händelse bokförs; en banköverföring är inte
i sig bevis att just denna moms är slutbetald. Lämna inkomstdeklaration/NE för 2026 under 2027 och spara kvitto.
**System/fel:** SoloLedger skickar inte dessa deklarationer och kan inte verifiera kvittot hos myndigheten.
Avvikelse i beslut/skattekonto → utred, ingen automatisk klarmarkering. Klart per enskild extern åtgärd,
med eget kvitto/avstämning; årets låsstatus ändras inte till följd av antagen deklarationsstatus.

## Första implementerbara etapp och fortsättning

Statusar hålls isär: **bokföringsår låst** = serverns årslås; **momsperiod stängd** = internt
momsavslut; **moms deklarerad** = användarens bekräftelse efter inskick; **moms avräknad/betald**
= kontrollerade skattekonto-/betalningshändelser; **inkomstdeklaration inskickad** = externt kvitto.
Ingen av dessa statusar innebär automatiskt någon av de andra.

**A – rekommenderas nu: liten läsande guide, låg–medelhög komplexitet.** Ny meny **Årsavslut**
med åtta utvecklingsbara instruktioner ovan, rätt år, tydlig pågående-årstext och knappar till befintliga vyer.
Återanvänd befintlig owner/selectedYear, laddningsgräns och känd årslåsstatus. Övriga steg märks
”Du behöver kontrollera”, utan gröna bockar, procentsiffra eller sammanfattningen ”redo att låsa”.
Instruktionerna visar vilken jämförelse användaren ska göra; inga nya beloppsberäkningar krävs i A.
Enbart guideöppning ska inte initiera data/RPC-skrivning. Befintliga åtgärder utförs i respektive vy;
Moms-vyn kan redan initiera momsperioder när den öppnas, vilket inte får kallas helt skrivfri navigation.

Konkreta kodpunkter efter godkännande: ny **src/components/YearEndGuide.tsx**, meny i **Layout.tsx**,
tab/återgång i **src/app/page.tsx**. Inga nya URL-rutter behövs; använd befintliga tab-ID
dashboard/fakturor/leverantorsskulder/inventarier/moms/ne/profil och behåll rätt år.
Guide-/navigationsstate får inte återanvändas mellan ägare/år. Ingen sparad checklistprogress,
ny tabell/migration, RPC, egen bokföringsmotor, PDF-export eller ny låsknapp ingår i A.

**B – separat beslut:** läsande, ägar-/årsbundna faktiska kontrollresultat och hinderlänkar från befintliga
tjänster: fakturor, inventariepreview, momsperioder och NE-granskning. Fullständig/samtida laddning,
fel/okänt och datum måste hanteras. Även ”inga registrerade” skiljs från ”alla externa underlag finns”.
Anpassa eventuell balansindikator till serverns 0,01 kr-gräns; återanvänd inte UI:s grövre låsspärr som facit.
Eventuella manuella attesteringar måste få separat design för ägare/år, ändrat underlag och lagring.
**C – separat beslut:** förbättrad slutlig låsbekräftelse, praktisk boksluts-/deklarationsutgång och
sammanhängande 2026→2027→2028-acceptans. Återanvänd befintlig closeYear/RPC, inga nya redovisningsregler.
Öppna kvarstående NE-/utlandsfrågor avgränsas före att hela årsavslutet utges som färdigt.

## Acceptans och föreslagna prov

- A: nybörjare kan med syntetiskt exempel följa VARFÖR/HUR, hitta rätt vy och beskriva klart/fel
  utan muntlig hjälp. Dator/mobil; 2026 behålls genom navigation/återgång; ägar-/årsbyte återställer guidestate.
- A: laddning/fel ger inga gamla belopp/låsbesked; inget ”klart” utifrån noll poster/manuell bock.
  Guideöppning skickar inga boknings-/moms-/årslås-/attesteringsanrop. Befintliga vyers beteende bevaras.
- A: riktade komponent-/navigationstester och visuell kontroll räcker normalt, plus relevanta typer/lint.
  Ingen ny DB-svit. Förändras oväntat en bokföringsväg ska scope omprövas, inte smygutökas.
- B/C: fokuserad syntetisk 2026→2027→2028-kedja i separat godkänt testmål: kundfordran,
  KAN-98-skuld/betalning/rättelse, inventarie, EU 228/57/0, momsstatusar, NE, UB=IB och låsspärr.
  Återanvänd KAN-98 och flerårsbevis i gamla kartan. Verkligt momsavslut endast för avslutad testperiod;
  ingen framtidsspärr kringgås. Ingen Jessika-/Production-skrivning eller ny helsvit föreslås här.

## Verkliga hinder och avgränsningar

**Bekräftat:** 2026 är ännu inte slut; momsavslut för framtida period stoppas. En färdig sammanhållen
guide och komplett signerbart boksluts-/deklarationsflöde saknas; NE:s skatteunderlag är begränsat.
Det hindrar löfte om ett komplett årsavslut, men inte etapp A. Leverantörsnormalfallet är löst av KAN-98.
**Villkorligt, inte upptäckta fel på Jessikas konto:** saknade underlag/bankdifferens, osäkra moms-/NE-fakta,
obetalda Adobe-/utlandsfakturor, otillåtna inventariefall eller oklara ingående värden kräver utredning.
Adobe-momsregistrering/avdragsrätt får inte härledas av momsfri försäljning; läs faktiska fakta vid behov.
SIE-specialfall/KAN-96 och en ny skatte-/bokföringsmotor ingår inte. Ingen ny Jira skapad.

Produktkod avstämd på 53b9c82: Layout, page.handleLockYear/AccountingDataBoundary, CustomerInvoicesPanel,
SupplierYearEndPanel, FixedAssetsPanel, Momsrapport, NEBilaga och accountingService (R15/R16/R17).
Aktuella live-definitioner ändras inte; Production-releasebevisen från samma SHA återanvänds.
Skatterättsliga gränser kontrollerade mot [Skatteverket EU-tjänster](https://www.skatteverket.se/foretag/moms/kopavarorochtjanster/inkopfranandraeulander/kopatjansterfranandraeulander)
och [årsbokslut/deklaration](https://www.skatteverket.se/foretag/inkomstdeklaration/enskildnaringsverksamhet.4.133ff59513d6f9ee2ebf00.html).
Verifikation, momsperiod stängd, momsdeklaration bekräftad, moms avräknad/betald och inkomstdeklaration
inskickad förblir olika fakta. För 2027 års tjänst/blankett och datum krävs ny källkontroll då.

**Överlämning:** efter Pontus godkännande skapa liten KAN-99-produktgren från återverifierad 53b9c82,
bevara KAN-98-kopian och kopiera inte root-historiken. Läs denna plan + aktuellt STATE; inga nya stora
kartläggningar behövs för A. Läs relevanta Next-guider före kod enligt AGENTS. Planen är inte
implementationstillstånd. Inga tester, DB-skrivningar, deployer, pushar eller Jira-mutationer utfördes här.
