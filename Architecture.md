# SoloLedger — Arkitekturöversikt

## `src/app/`
**`page.tsx`** — Huvudsidan. Orkestrerar tabs, formulär, modals och UI-state. Konsumerar hooks, renderar allt.

**`layout.tsx`** — Next.js root layout. Wrapprar hela appen (HTML-skal, fonts, metadata).

**`globals.css`** — Global CSS.

---

## `src/app/components/`
| Fil | Ansvar |
|---|---|
| `FAQ.tsx` | FAQ-sektionen |
| `Kontoplan.tsx` | Vyn för att hantera kontoplanen (lägga till/ta bort konton) |
| `Layout.tsx` | Sidhuvud, navigation, logout-knapp — skalet runt innehållet |
| `Momsrapport.tsx` | Beräknar och visar momsrapport |
| `NEBilaga.tsx` | NE-bilagan (skattedeklaration för enskild firma) |
| `OverviewCards.tsx` | Summakorten högst upp på dashboard |
| `Paywall.tsx` | Modal/banner för uppgradering |
| `ProfileSettings.tsx` | Profilinställningar, byta lösenord etc |
| `SubscribeButton.tsx` | Knapp för att starta prenumeration |
| `SubscriptionGuard.tsx` | Blockerar features baserat på subscription_type |
| `TransactionForm.tsx` | Formuläret för att lägga till/redigera transaktioner |
| `TransactionTable.tsx` | Tabellen med alla transaktioner |

---

## `src/hooks/`
| Fil | Ansvar |
|---|---|
| `useAuth.ts` | Äger auth-livscykeln: user, profile, login, logout, onAuthStateChange |
| `useAccountingData.ts` | Äger all bokföringsdata: transactions, balances, neData, journalMap, kontoplan, laddning, årslås |

---

## `src/lib/`
| Fil | Vill du ändra... | Kolla här |
|---|---|---|
| `accountingService.ts` | Hur bokföring, verifikationer, journalposter skapas/raderas | ✅ |
| `calculations.ts` | Hur siffror beräknas (balans, resultat, moms, NE-värden) | ✅ |
| `setupDefaultAccounts.ts` | Vilka konton nya användare får från start | ✅ |
| `sieExport.ts` | Hur SIE-filen genereras vid export | ✅ |
| `subscriptionLimits.ts` | Regler för vad gratis/trial/paid får göra | ✅ |
| `supabaseClient.ts` | Supabase-anslutningen (URL, anon key) | ✅ |

---

## Tumregel för var saker hör hemma

| Fråga | Plats |
|---|---|
| Hur ser det ut? | `components/` |
| Hur laddas/ägs data? | `hooks/` |
| Hur räknas/bearbetas det? | `lib/` |
| Vad visas och när? | `page.tsx` |