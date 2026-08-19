# SoloLedger — Arkitekturöversikt

## src/app/

**page.tsx** — Huvudsidan. Orkestrerar tabs, formulär, modals och UI-state. Konsumerar hooks, renderar allt.

**layout.tsx** — Next.js root layout. Wrapprar hela appen (HTML-skal, fonts, metadata).

**globals.css** — Global CSS.

---

## src/app/components/

| Fil | Ansvar |
|---|---|
| AdminPanel.tsx | Adminvy: användarlista, torrkörning och radering av användare (endast för role = admin) |
| FAQ.tsx | FAQ-sektionen |
| FavoriteChips.tsx | Visar och hanterar sparade favorit-mönster för snabb-bokföring |
| Kontoplan.tsx | Hantering av kontoplan (lägga till/ta bort konton) |
| Layout.tsx | Sidhuvud, navigation, logout-knapp. Visar Admin-tab om isAdmin |
| Momsrapport.tsx | Beräknar och visar momsrapport |
| NEBilaga.tsx | NE-bilaga för enskild firma |
| OverviewCards.tsx | Dashboardens sammanfattningskort |
| Paywall.tsx | Modal/banner för uppgradering |
| ProfileSettings.tsx | Profilinställningar, lösenordsbyte m.m. |
| SubscribeButton.tsx | Knapp för att starta prenumeration |
| SubscriptionGuard.tsx | Blockerar funktioner beroende på subscription_type |
| TransactionForm.tsx | Formulär för skapande och redigering av transaktioner |
| TransactionTable.tsx | Lista över alla transaktioner |

---

## src/hooks/

| Fil | Ansvar |
|---|---|
| useAuth.ts | Äger auth-livscykeln: user, profile, login, logout, password recovery, PASSWORD_RECOVERY-hantering, updatePassword, auth notices, onAuthStateChange |
| useAccountingData.ts | Äger all bokföringsdata: transactions, balances, neData, journalMap, kontoplan, laddning, refreshData samt årslåsning |

---

## src/lib/

| Fil | Vill du ändra... | Kolla här |
|---|---|---|
| accountingService.ts | Hur bokföring, verifikationer och journalposter skapas/raderas | ✅ |
| calculations.ts | Hur moms, resultat, balans och NE-värden räknas ut | ✅ |
| setupDefaultAccounts.ts | Standardkonton för nya användare | ✅ |
| sieExport.ts | Hur SIE-filen genereras | ✅ |
| subscriptionLimits.ts | Regler för gratis/trial/paid | ✅ |
| supabaseClient.ts | Supabase-anslutning | ✅ |

---

## Supabase

### Tabeller
| Tabell | Innehåll |
|---|---|
| profiles | Användarprofil: subscription_type, role, email, company_name, org_nr |
| transactions | Bokförda transaktioner |
| journal_entries | Journalposter per transaktion |
| accounts | Kontoplan per användare |
| favorites | Sparade favorit-transaktioner/mönster per användare |
| closed_years | Låsta räkenskapsår |
| ver_nr_sequences | Verifikationsnummer-räknare |

### Storage
| Bucket | Innehåll |
|---|---|
| attachments | Bilagor per användare (userId/filnamn) |

### Edge Functions
| Funktion | Ansvar |
|---|---|
| delete-user | Raderar användare permanent inklusive storage, tabellrader och auth-konto |

### Triggers & Policies
- **on_auth_user_created** — Skapar profiles-rad automatiskt vid registrering.
- **profiles_self_access** — RLS: användare läser endast sin egen profil.
- **admin_read_all_profiles** — RLS: admins kan läsa alla profiler.

---

## Auth-flöde

### Login / Registrering
```text
page.tsx -> useAuth.ts -> Supabase Auth