# SoloLedger

## 🚀 Projektstatus

Detta är en Next.js + Supabase SaaS-applikation.

### ✅ Stripe Subscription (TEST – klart)

Prenumerationsflödet är implementerat och verifierat i testmiljö.

#### Funktionalitet:
- ✅ Stripe Checkout (subscription + 14 dagars trial)
- ✅ Webhook tar emot events från Stripe
- ✅ Supabase `profiles` uppdateras korrekt:
  - `subscription_type` (free / trial / paid)
  - `stripe_customer_id`
  - `stripe_subscription_id`
  - `subscription_end`
- ✅ Auth via Supabase fungerar
- ✅ SubscriptionGuard blockerar/släpper access korrekt

#### Testmiljö:
Användes via:
/test-sub

#### Stripe:
- Körs i testläge (`sk_test`, `pk_test`)

---

## ⚠️ Att göra (nästa steg)

- [ ] Skapa `/dashboard` (success/cancel UI)
- [ ] Integrera SubscriptionGuard i riktiga appen
- [ ] Flytta från test → produktionsflöde
- [ ] Implementera Stripe Customer Portal

---

## 🛠️ Starta projektet

```bash
npm run dev

Öppna:
http://localhost:3000


⚠️ Viktigt
.env.local innehåller API-nycklar och ska inte committas.

💡 Notering
Stripe-integration är testad end-to-end och redo att integreras i huvudapplikationen.

---

# ✅ Sen gör du bara:

```bash
git add README.md
git commit -m "docs: add Stripe subscription documentation"