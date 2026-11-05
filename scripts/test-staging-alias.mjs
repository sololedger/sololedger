import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStagingAlias } from './verify-staging-alias.mjs';

const id = 'dpl_Approved';
const older = 'dpl_Older';
const sha = 'a'.repeat(40);
const host = 'sololedger-123456789-sololedger1.vercel.app';
const staging = 'sololedger-git-staging-sololedger1.vercel.app';
const production = 'sololedger.vercel.app';
const projectId = 'prj_chkSdedE06ppK2PlsqdtOhZfAKpT';
const teamId = 'team_0Mrj7LMvSEfpbV8y5juQ5IiL';
const repoId = 1244768485;
const db = 'https://fzxqiqenqjzhlyxxpvhg.supabase.co';
const deployment = {
  id, projectId, name: 'sololedger', team: { id: teamId, slug: 'sololedger1' },
  source: 'git', target: null, readyState: 'READY', url: host,
  gitSource: { type: 'github', repoId, ref: 'staging', sha },
  oidcTokenClaims: { environment: 'preview', owner: 'sololedger1', project: 'sololedger' },
  env: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
};

function fixture({ current = older, build = {}, configUrl = db, js = db,
  failWrite = false, wrongReadback = false, productionChanges = false,
  sharedDeployment = false, otherClient = false, race = false,
  extraAliases = 0, pagination = {} } = {}) {
  const writes = [];
  let aliasReads = 0;
  const client = {
    api(route) {
      const { pathname, searchParams } = new URL(route, 'https://api.vercel.com');
      assert.equal(searchParams.get('teamId'), teamId);
      switch (pathname) {
        case `/v13/deployments/${id}`: return { ...deployment, ...build };
        case `/v13/deployments/${older}`: return { ...deployment, id: older };
        case `/v9/projects/${projectId}`:
          return {
            id: projectId, accountId: teamId, link: { repoId, productionBranch: 'main' },
            env: [{ key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['preview'], id: 'env_url' }],
          };
        case `/v1/projects/${projectId}/env/env_url`:
          return { key: 'NEXT_PUBLIC_SUPABASE_URL', value: configUrl };
        case '/v4/aliases':
          assert.equal(searchParams.get('projectId'), projectId);
          if (race && ++aliasReads === 2) current = id;
          const productionTarget = productionChanges && writes.length ? 'dpl_Changed' : 'dpl_Prod';
          return {
            aliases: [
              { alias: staging, deploymentId: current },
              { alias: production, deploymentId: sharedDeployment ? current : productionTarget },
              ...Array.from({ length: extraAliases }, (_, index) =>
                ({ alias: `branch-${index}.vercel.app`, deploymentId: older })),
            ],
            pagination: { count: 2 + extraAliases, next: null, ...pagination },
          };
        case `/v4/aliases/${staging}`:
          return { alias: staging, projectId, deploymentId: current, redirect: null };
        default: assert.fail(`Unexpected route ${route}`);
      }
    },
    assign(target) {
      writes.push(target);
      if (failWrite) throw new Error('Synthetic transport failure');
      if (!wrongReadback) current = id;
    },
    readPage(origin, path) {
      assert.ok([host, staging].includes(origin));
      if (path === '/') return '<title>SoloLedger</title><script src="/_next/static/app.js"></script>';
      return otherClient && origin === staging ? `${js} different build` : js;
    },
  };
  return { writes, run: (approval = { id, sha }) => verifyStagingAlias(approval, client) };
}

test('Rätt alias verifieras utan omkoppling', async () => {
  const f = fixture({ current: id });
  assert.deepEqual(await f.run(), { changed: false, previous: id, deployment: id, sha, production: 'dpl_Prod' });
  assert.deepEqual(f.writes, []);
});

test('Äldre alias kopplas om en gång till exakt godkänd Preview', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { changed: true, previous: older, deployment: id, sha, production: 'dpl_Prod' });
  assert.deepEqual(f.writes, [host]);
  assert.equal((await f.run()).changed, false);
  assert.deepEqual(f.writes, [host]);
});

test('En verifierat komplett lista med 99 alias går igenom', async () => {
  const f = fixture({ current: id, extraAliases: 97 });
  assert.equal((await f.run()).changed, false);
  assert.deepEqual(f.writes, []);
});

for (const [name, options, error] of [
  ['Fel branch', { build: { gitSource: { ...deployment.gitSource, ref: 'main' } } }, /staging-gren/],
  ['Fel projekt', { build: { projectId: 'prj_Wrong' } }, /projekt/],
  ['Fel team', { build: { team: { id: 'team_Wrong', slug: 'wrong' } } }, /team/],
  ['Inte READY', { build: { readyState: 'BUILDING' } }, /inte READY/],
  ['Fel commit', { build: { gitSource: { ...deployment.gitSource, sha: 'b'.repeat(40) } } }, /commit/],
  ['Production-deployment', { build: { target: 'production' } }, /vanlig Preview/],
  ['Okänd miljö', { build: { target: undefined } }, /vanlig Preview/],
  ['Custom Environment som objekt', { build: { customEnvironment: { id: 'env_Custom' } } }, /vanlig Preview/],
  ['Custom Environment som ID', { build: { customEnvironmentId: 'env_Custom' } }, /vanlig Preview/],
  ['Preview-target med Production-klassning', { build: { oidcTokenClaims: { ...deployment.oidcTokenClaims, environment: 'production' } } }, /vanlig Preview/],
  ['Deploymentens miljöklassning saknas', { build: { oidcTokenClaims: undefined } }, /vanlig Preview/],
  ['Deploymentens Supabase-variabler saknas', { build: { env: [] } }, /Supabase-variabler/],
  ['Production-URL i Preview-konfiguration', { configUrl: 'https://wbaxmuvudpnkvuliicuy.supabase.co' }, /Preview-konfigurationen/],
  ['Staging saknas i klienten', { js: 'no-db' }, /levererad JavaScript/],
  ['Production finns också i klienten', { js: db + ' https://wbaxmuvudpnkvuliicuy.supabase.co' }, /levererad JavaScript/],
  ['En annan Supabase-miljö finns också i klienten', { js: db + ' https://other.supabase.co' }, /levererad JavaScript/],
  ['Stagingnamnet är del av en annan domän', { js: db + '.example.org' }, /levererad JavaScript/],
  ['Aliaslistan har en nästa sida', { pagination: { next: 123 } }, /aliaslista är ofullständig/],
  ['Aliaslistan saknar slutmarkering', { pagination: { next: undefined } }, /aliaslista är ofullständig/],
  ['Aliaslistan har avvikande antal', { pagination: { count: 3 } }, /aliaslista är ofullständig/],
  ['Aliaslistan når 100 poster trots null-markör', { extraAliases: 98 }, /gränsen på 100/],
  ['Production och Staging delar deployment', { sharedDeployment: true }, /separata deployments/],
  ['Kopplingen ändras före skrivning', { race: true }, /ändrades under kontrollen/],
]) {
  test(name, async () => {
    const f = fixture(options);
    await assert.rejects(f.run(), error);
    assert.deepEqual(f.writes, []);
  });
}

for (const [name, options, error] of [
  ['Omkoppling misslyckas', { failWrite: true }, /Läs av faktisk koppling/],
  ['Efterkontroll visar fel deployment', { wrongReadback: true }, /fel Staging-deployment/],
  ['Efterkontroll upptäcker ändrat Production-alias', { productionChanges: true }, /andra alias/],
  ['Efterkontroll upptäcker annan levererad klient', { otherClient: true }, /andra JavaScript-filer/],
]) {
  test(name, async () => {
    const f = fixture(options);
    await assert.rejects(f.run(), error);
    assert.deepEqual(f.writes, [host]);
  });
}

test('Ofullständigt godkännande stoppas före Vercel-anrop', async () => {
  await assert.rejects(verifyStagingAlias({ id, sha: 'aaaaaaa' }, {
    api() { assert.fail('Unexpected Vercel call'); },
  }), /full Git-commit/);
});
