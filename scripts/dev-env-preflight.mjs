import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

const PRODUCTION_SUPABASE_REF = 'wbaxmuvudpnkvuliicuy'
const ALLOWED_LOCAL_DEV_SUPABASE_REF = 'fzxqiqenqjzhlyxxpvhg'

export function getSupabaseRefFromUrl(url) {
  const match = String(url ?? '').match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i)
  return match?.[1] ?? null
}

export function validateLocalDevEnvironment(env = process.env) {
  const target = env.SOLOLEDGER_LOCAL_DEV_TARGET
  const urlRef = getSupabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const errors = []

  if (target !== 'staging') {
    errors.push('SOLOLEDGER_LOCAL_DEV_TARGET must be "staging".')
  }

  if (!urlRef) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL.')
  }

  if (urlRef === PRODUCTION_SUPABASE_REF) {
    errors.push('Refusing to start local dev against Production Supabase.')
  }

  if (urlRef && urlRef !== ALLOWED_LOCAL_DEV_SUPABASE_REF) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL does not point at the allowlisted staging ref.')
  }

  return {
    ok: errors.length === 0,
    errors,
    stagingRef: ALLOWED_LOCAL_DEV_SUPABASE_REF,
    productionRef: PRODUCTION_SUPABASE_REF,
    urlRef,
  }
}

export function loadNextDevelopmentEnv(projectDir = process.cwd()) {
  return loadEnvConfig(projectDir, true, undefined, true)
}

export function assertLocalDevEnvironment(env = process.env) {
  const result = validateLocalDevEnvironment(env)

  if (!result.ok) {
    throw new Error(
      [
        'Local dev preflight failed before Next.js startup.',
        ...result.errors.map(error => `- ${error}`),
        'Use the local git-ignored staging env file before running npm run dev.',
      ].join('\n')
    )
  }

  return result
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  loadNextDevelopmentEnv()
  const result = assertLocalDevEnvironment()
  console.log(`Local dev Supabase target verified: staging (${result.stagingRef}).`)
}
