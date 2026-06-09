# SoloLedger

## 🚀 Projektstatus

Detta är en Next.js + Supabase SaaS-applikationsplattform för bokföring.

### ✅ Stripe- & Profilintegration (Klart & Verifierat)
Hela prenumerations- och profilflödet är fullt implementerat och verifierat i utvecklingsmiljön.

**Funktionalitet:**
* **Stripe Checkout:** Hanterar både premium-prenumerationer och 14 dagars testperioder (trial).
* **Stripe Webhooks:** Lyssnar på events från Stripe och synkar data till databasen i realtid.
* **Stripe Customer Portal:** Integrerad länk på profilsidan där användare säkert kan hantera kortuppgifter, se fakturahistorik eller avsluta prenumerationer.
* **Profilhantering:** Automatisk synkronisering av företagsuppgifter (Företagsnamn och Organisationsnummer) till och från Supabase som laddas blixtsnabbt vid F5 utan fördröjning.
* **Säkerhet & Access:** `SubscriptionGuard` skyddar premiumfunktioner och kontrollerar giltighetstider, transaktionsgränser för gratisplaner samt blockerar/släpper igenom användare baserat på aktiv status.

---

## 💾 Databasstruktur (`profiles`)

Din Supabase-tabell `profiles` innehåller nu följande kolumner för att hålla reda på användarnas abonnemang och företagsspecifik data:

| Kolumn | Typ | Beskrivning |
| :--- | :--- | :--- |
| `id` | `uuid` (Primary Key) | Matchar användarens unika ID från Supabase Auth. |
| `subscription_type` | `text` | Kan vara `free`, `trial`, `paid` eller `admin`. |
| `stripe_customer_id` | `text` | Unikt kund-ID genererat av Stripe. |
| `stripe_subscription_id`| `text` | ID för användarens aktiva prenumation i Stripe. |
| `subscription_end` | `timestamp` | Slutdatum för testperiod eller nästa förnyelsedatum. |
| `company_name` | `text` | Företagets namn (används i rapporter och SIE-export). |
| `org_nr` | `text` | Organisationsnummer (används i rapporter och SIE-export). |

---

## 🛠️ Starta projektet

Kör utvecklingsservern lokalt på din maskin:

```bash
npm run dev