import type { NextConfig } from "next";
import { execFileSync } from 'node:child_process'

// Build-owned identifier only; never accepted from an HTTP request. The SHA is
// public metadata, not a credential. Vercel supplies the exact deployed commit.
function buildRevision() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try { return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim() }
  catch { return '' } // Saving fails closed if the build has no reliable identity.
}

const nextConfig: NextConfig = {
  env: { SOLOLEDGER_BUILD_REVISION: buildRevision() },
};

export default nextConfig;
