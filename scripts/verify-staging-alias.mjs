import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEAM = 'sololedger1';
const TEAM_ID = 'team_0Mrj7LMvSEfpbV8y5juQ5IiL';
const PROJECT_ID = 'prj_chkSdedE06ppK2PlsqdtOhZfAKpT';
const REPO_ID = 1244768485;
const STAGING_ALIAS = 'sololedger-git-staging-sololedger1.vercel.app';
const PRODUCTION_ALIAS = 'sololedger.vercel.app';
const STAGING_DB = 'fzxqiqenqjzhlyxxpvhg.supabase.co';
const PRODUCTION_DB = 'wbaxmuvudpnkvuliicuy.supabase.co';
const ALIAS_LIMIT = 100;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;
const COMMIT = /^[0-9a-f]{40}$/;

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function checkStagingDeployment(deployment, id) {
  requireCheck(deployment?.id === id && deployment.projectId === PROJECT_ID
    && deployment.name === 'sololedger' && deployment.team?.id === TEAM_ID
    && deployment.team?.slug === TEAM, 'Fel projekt, team eller deployment-ID.');
  requireCheck(deployment.source === 'git' && deployment.gitSource?.type === 'github'
    && deployment.gitSource.repoId === REPO_ID && deployment.gitSource.ref === 'staging',
  'Deploymenten kommer inte från rätt GitHub-repo och staging-gren.');
  requireCheck((deployment.target === null || deployment.target === 'preview')
    && deployment.customEnvironmentId == null && deployment.customEnvironment == null
    && deployment.oidcTokenClaims?.environment === 'preview'
    && deployment.oidcTokenClaims.owner === TEAM && deployment.oidcTokenClaims.project === 'sololedger',
  'Deploymentens miljö kunde inte verifieras som vanlig Preview.');
}

async function verifyClient(host, readPage) {
  const html = await readPage(host, '/');
  requireCheck(/<title>[^<]*SoloLedger/.test(html), 'Kunde inte läsa levererad SoloLedger-sida.');
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[\w./~-]+\.js)"/g)]
    .map(match => match[1]))].sort();
  requireCheck(assets.length > 0 && assets.every(path => !path.split('/').includes('..')),
    'Kunde inte identifiera levererad JavaScript.');
  const files = await Promise.all(assets.map(path => readPage(host, path)));
  const supabaseUrls = files.flatMap(file => [...file.matchAll(/https?:\/\/[a-z0-9.:%@-]+/gi)]
    .map(match => match[0]).filter(url => /\.supabase\.co\b/i.test(url)));
  requireCheck(supabaseUrls.length > 0
    && files.every(file => file.trim() && !file.toLowerCase().includes(PRODUCTION_DB))
    && supabaseUrls.every(url => url === `https://${STAGING_DB}`),
  'Staging-databasen kunde inte verifieras i levererad JavaScript.');
  return { assets, files };
}

export async function verifyStagingAlias({ id, sha }, { api, assign, readPage }) {
  requireCheck(DEPLOYMENT_ID.test(id) && COMMIT.test(sha),
    'Ange exakt godkänt deployment-ID och full Git-commit (40 tecken).');

  const getDeployment = deploymentId =>
    api(`/v13/deployments/${deploymentId}?teamId=${TEAM_ID}&withGitRepoInfo=true`);
  const approved = await getDeployment(id);
  checkStagingDeployment(approved, id);
  requireCheck(approved.readyState === 'READY', 'Godkänd deployment är inte READY.');
  requireCheck(approved.gitSource.sha === sha, 'Deploymentens commit matchar inte godkännandet.');
  requireCheck(Array.isArray(approved.env) && [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  ].every(key => approved.env.includes(key)), 'Deploymentens Supabase-variabler kunde inte verifieras.');
  requireCheck(/^sololedger-[a-z0-9]{9}-sololedger1\.vercel\.app$/.test(approved.url),
    'Deploymentens unika Preview-adress kunde inte verifieras.');

  const project = await api(`/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`);
  requireCheck(project?.id === PROJECT_ID && project.accountId === TEAM_ID
    && project.link?.repoId === REPO_ID && project.link?.productionBranch === 'main'
    && Array.isArray(project.env), 'Projektets Git- eller Preview-konfiguration kunde inte verifieras.');
  const urls = project.env.filter(row => row.key === 'NEXT_PUBLIC_SUPABASE_URL'
    && row.target?.includes('preview') && (!row.gitBranch || row.gitBranch === 'staging'));
  requireCheck(urls.length === 1 && /^[\w-]+$/.test(urls[0].id ?? ''),
    'Preview måste ha exakt en verifierbar Supabase-adress för staging.');
  const url = await api(`/v1/projects/${PROJECT_ID}/env/${urls[0].id}?teamId=${TEAM_ID}`);
  requireCheck(url?.key === 'NEXT_PUBLIC_SUPABASE_URL' && url.value === `https://${STAGING_DB}`,
    'Preview-konfigurationen pekar inte på Staging-databasen.');

  const client = await verifyClient(approved.url, readPage);
  async function readAliases() {
    const result = await api(`/v4/aliases?teamId=${TEAM_ID}&projectId=${PROJECT_ID}&limit=${ALIAS_LIMIT}`);
    requireCheck(Array.isArray(result?.aliases) && result.pagination?.next === null
      && result.pagination.count === result.aliases.length && result.aliases.length < ALIAS_LIMIT,
    'Projektets aliaslista är ofullständig eller når gränsen på 100 poster.');
    requireCheck(result.aliases.every(row => typeof row?.alias === 'string'
        && DEPLOYMENT_ID.test(row.deploymentId))
      && new Set(result.aliases.map(row => row.alias)).size === result.aliases.length,
    'Projektets aliaslista kunde inte verifieras.');
    const mapping = new Map(result.aliases.map(row => [row.alias, row.deploymentId]).sort());
    const alias = await api(`/v4/aliases/${STAGING_ALIAS}?teamId=${TEAM_ID}`);
    requireCheck(alias?.alias === STAGING_ALIAS && alias.projectId === PROJECT_ID
      && alias.redirect == null && DEPLOYMENT_ID.test(alias.deploymentId)
      && alias.deploymentId === mapping.get(STAGING_ALIAS) && mapping.has(PRODUCTION_ALIAS),
    'Nuvarande Staging- eller Production-koppling kunde inte verifieras.');
    return mapping;
  }

  const before = await readAliases();
  const previous = before.get(STAGING_ALIAS);
  const production = before.get(PRODUCTION_ALIAS);
  requireCheck(production !== id && production !== previous,
    'Production och Staging måste peka på separata deployments.');
  const changed = previous !== id;
  if (changed) {
    checkStagingDeployment(await getDeployment(previous), previous);
    const current = await readAliases();
    requireCheck(JSON.stringify([...current]) === JSON.stringify([...before]),
      'Aliaskopplingarna ändrades under kontrollen. Avbryter före omkoppling.');
    try {
      await assign(approved.url);
    } catch {
      throw new Error('Aliasomkopplingen kunde inte bekräftas. Läs av faktisk koppling innan nytt försök.');
    }
  }

  const after = await readAliases();
  before.set(STAGING_ALIAS, id);
  requireCheck(after.get(STAGING_ALIAS) === id, 'Efterkontrollen visar fel Staging-deployment.');
  requireCheck(JSON.stringify([...after]) === JSON.stringify([...before]),
    'Efterkontrollen visar att andra alias har ändrats.');
  const delivered = await verifyClient(STAGING_ALIAS, readPage);
  requireCheck(JSON.stringify(delivered.assets) === JSON.stringify(client.assets)
    && delivered.files.every((file, index) => file === client.files[index]),
    'Staging-aliaset levererar andra JavaScript-filer än den godkända deploymenten.');
  return { changed, previous, deployment: id, sha, production };
}

function liveVercel(cli, oidcToken) {
  requireCheck(cli && isAbsolute(cli), 'Ange absolut sökväg till Vercel CLI:s Node-fil i SOLOLEDGER_VERCEL_CLI.');
  requireCheck(oidcToken, 'Befintlig kortlivad VERCEL_OIDC_TOKEN krävs för skyddad Preview.');

  function run(args, action) {
    try {
      return execFileSync(process.execPath, [cli, ...args, '--scope', TEAM], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      });
    } catch {
      throw new Error(`Vercel CLI misslyckades vid ${action}. Kontrollera inloggning och behörighet.`);
    }
  }

  return {
    api(route) {
      const response = run(['api', route, '--method', 'GET'], route);
      try {
        return JSON.parse(response);
      } catch {
        throw new Error(`Vercel returnerade ogiltigt JSON för ${route}.`);
      }
    },
    assign(host) {
      run(['alias', 'set', host, STAGING_ALIAS], 'omkoppling av Staging-alias');
    },
    async readPage(host, path) {
      const url = new URL(path, `https://${host}`);
      requireCheck(url.origin === `https://${host}`, 'Otillåten adress för klientkontroll.');
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: { 'x-vercel-trusted-oidc-idp-token': oidcToken },
      });
      requireCheck(response.status === 200, `Kunde inte läsa klienten från ${host} (HTTP ${response.status}).`);
      return response.text();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [id, sha, approval, ...extra] = process.argv.slice(2);
    requireCheck(approval === '--approved' && extra.length === 0,
      'Använd node scripts/verify-staging-alias.mjs <deployment-ID> <full-commit> --approved.');
    const result = await verifyStagingAlias({ id, sha },
      liveVercel(process.env.SOLOLEDGER_VERCEL_CLI, process.env.VERCEL_OIDC_TOKEN));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Staging-alias: ${error.message}`);
    process.exitCode = 1;
  }
}
