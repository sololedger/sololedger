import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile } from './e2e-env.mjs'
import { assertWriteE2EEnvironment } from './e2e-preflight.mjs'

const envPath = process.env.SOLOLEDGER_E2E_ENV_FILE ?? '.env.e2e.local'
loadEnvFile(envPath)

const email = process.env.SOLOLEDGER_E2E_EMAIL
let password = process.env.SOLOLEDGER_E2E_PASSWORD

if (!password) {
  password = crypto.randomBytes(24).toString('base64url')
  fs.appendFileSync(envPath, `\nSOLOLEDGER_E2E_PASSWORD=${password}\n`)
  process.env.SOLOLEDGER_E2E_PASSWORD = password
}

assertWriteE2EEnvironment()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SOLOLEDGER_E2E_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

if (process.env.SOLOLEDGER_E2E_SUPABASE_SERVICE_ROLE_KEY) {
  const createResult = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      purpose: 'sololedger_playwright_e2e',
      automation: true,
    },
  })

  if (createResult.error && createResult.error.message !== 'A user with this email address has already been registered') {
    throw createResult.error
  }
} else {
  const signUpResult = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        purpose: 'sololedger_playwright_e2e',
        automation: true,
      },
    },
  })

  if (signUpResult.error && signUpResult.error.message !== 'User already registered') {
    throw signUpResult.error
  }
}

const signInResult = await supabase.auth.signInWithPassword({
  email,
  password,
})

if (signInResult.error) {
  throw signInResult.error
}

const userId = signInResult.data.user?.id
if (!userId) {
  throw new Error('Could not verify the staging E2E user id.')
}

if (process.env.SOLOLEDGER_E2E_SUPABASE_SERVICE_ROLE_KEY) {
  const profileResult = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        subscription_type: 'paid',
        role: 'user',
        company_name: 'SoloLedger Playwright E2E',
        org_nr: null,
        vat_status: 'unknown',
        vat_period_type: null,
        vat_management_from: null,
        domestic_sales_vat_treatment: 'unknown',
        foreign_purchase_reporting: 'unknown',
        default_deduction_entitlement: 'unknown',
      },
      { onConflict: 'id' }
    )

  if (profileResult.error) {
    throw profileResult.error
  }
}

await supabase.auth.signOut()

console.log('Staging E2E user is available and login was verified.')
