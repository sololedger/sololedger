const PRODUCTION_SUPABASE_REF = 'wbaxmuvudpnkvuliicuy'
const ALLOWED_STAGING_SUPABASE_REF = 'fzxqiqenqjzhlyxxpvhg'
const E2E_EMAIL_PATTERN = /^sololedger-playwright-e2e@sololedger\.se$/i

export function getSupabaseRefFromUrl(url) {
  const match = String(url ?? '').match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i)
  return match?.[1] ?? null
}

export function validateWriteE2EEnvironment(env = process.env) {
  const target = env.SOLOLEDGER_E2E_TARGET
  const configuredRef = env.SOLOLEDGER_E2E_SUPABASE_REF
  const urlRef = getSupabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const email = env.SOLOLEDGER_E2E_EMAIL

  const errors = []

  if (target !== 'staging') {
    errors.push('SOLOLEDGER_E2E_TARGET must be "staging".')
  }

  if (!configuredRef) {
    errors.push('SOLOLEDGER_E2E_SUPABASE_REF is required.')
  }

  if (!urlRef) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL.')
  }

  if (configuredRef && configuredRef !== ALLOWED_STAGING_SUPABASE_REF) {
    errors.push('SOLOLEDGER_E2E_SUPABASE_REF is not the allowlisted staging ref.')
  }

  if (urlRef && urlRef !== ALLOWED_STAGING_SUPABASE_REF) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL does not point at the allowlisted staging ref.')
  }

  if (configuredRef === PRODUCTION_SUPABASE_REF || urlRef === PRODUCTION_SUPABASE_REF) {
    errors.push('Refusing to run write E2E against Production Supabase.')
  }

  if (configuredRef && urlRef && configuredRef !== urlRef) {
    errors.push('SOLOLEDGER_E2E_SUPABASE_REF and NEXT_PUBLIC_SUPABASE_URL disagree.')
  }

  if (!email || !E2E_EMAIL_PATTERN.test(email)) {
    errors.push('SOLOLEDGER_E2E_EMAIL must be the dedicated Playwright E2E user.')
  }

  if (!env.SOLOLEDGER_E2E_PASSWORD) {
    errors.push('SOLOLEDGER_E2E_PASSWORD is required for write E2E.')
  }

  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is required for write E2E.')
  }

  return {
    ok: errors.length === 0,
    errors,
    stagingRef: ALLOWED_STAGING_SUPABASE_REF,
    productionRef: PRODUCTION_SUPABASE_REF,
  }
}

export function assertWriteE2EEnvironment(env = process.env) {
  const result = validateWriteE2EEnvironment(env)

  if (!result.ok) {
    throw new Error(
      [
        'Write E2E preflight failed before browser startup.',
        ...result.errors.map(error => `- ${error}`),
      ].join('\n')
    )
  }

  return result
}
