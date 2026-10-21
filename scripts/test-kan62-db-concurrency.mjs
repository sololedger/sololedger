// PREPARED ONLY. Real distinct psql sessions, no resets or cleanup.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { LocalSession, loadApprovedManifest, literal, json } from './kan62-local-db-guard.mjs'
import { readSQL, catalogSQL } from './run-kan62-local-db.mjs'
import { createTestRun, retainedOwnerSQL } from './kan62-local-test-run.mjs'

export function payload(deduction='none', changes={}) {
  return {idempotency_key:randomUUID(),date:'2026-03-01',description:'KAN62 synthetic concurrent purchase',
    supplier_country:'SE',gross_amount:12500,vat_rate:25,vat_deduction_entitlement:deduction,
    payment_account_role:'business_payment_account',booking_contract_version:'kan62-rule-contract-v1',
    connection_assessment:'standalone',connected_asset_ids:[],expected_prior_asset_ids:[],
    expected_threshold_basis_amount:10000,expected_reclassification_amount:0,...changes}
}
export async function waitBlocked(observer,waiter,blocker,timeout=6000) {
  assert(Number.isInteger(waiter.pid)&&waiter.pid>0&&Number.isInteger(blocker.pid)&&blocker.pid>0)
  assert.notEqual(waiter.pid,blocker.pid,'Must observe distinct PostgreSQL backends')
  const deadline=Date.now()+timeout
  while(Date.now()<deadline) {
    const [state]=await observer.run(`SELECT json_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})),
      'waitType',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${waiter.pid}),
      'waitEvent',(SELECT wait_event FROM pg_stat_activity WHERE pid=${waiter.pid}),
      'waiter',${waiter.pid},'blocker',${blocker.pid});`)
    if(state.blocked) {
      assert.equal(state.waitType,'Lock'); assert.equal(state.waitEvent,'advisory'); return state
    }
    await new Promise(resolve=>setTimeout(resolve,40))
  }
  throw Error('KAN62 no verified advisory wait between distinct backends')
}
const bookSQL=p=>'public.book_fixed_asset_acquisition_atomic('+json(p)+')'
const value=reply=>{assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.value.success,true);return reply.value}
const denied=(reply,code,pattern)=>{assert.equal(reply.ok,false);assert.equal(reply.code,code);assert.match(reply.message,pattern)}

export async function main() {
  const manifest=loadApprovedManifest('concurrency')
  const run=createTestRun('concurrency')
  const sessions=[],records=[],users=[]
  let admin,priorOwners,priorRows,priorCatalog
  let preservation={verified:false}
  async function client(uid,label) {
    const s=new LocalSession(manifest,process.env,label); sessions.push(s); await s.open()
    await s.run(`CREATE FUNCTION pg_temp.kan62_attempt(command text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $try$
      DECLARE result jsonb; BEGIN
        IF current_user<>'authenticated' THEN RAISE EXCEPTION 'KAN62 actual authenticated role required'; END IF;
        EXECUTE command INTO result; RETURN jsonb_build_object('ok',true,'value',result);
      EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $try$;
      DO $grant$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated',
        (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END $grant$;`)
    await s.asUser(uid)
    s.rpc=async expression=>(await s.run(`SELECT pg_temp.kan62_attempt(${literal('SELECT '+expression)});`))[0]
    return s
  }
  async function fixture(deduction='none',{period=false,deposit=false}={}) {
    const uid=randomUUID(); users.push(uid)
    await admin.run(`BEGIN; SELECT pg_temp.kan62_setup(${literal(uid)}::uuid,${literal(deduction)});
      ${period?`INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type) VALUES(${literal(uid)}::uuid,'2026-03-01','2026-03-31','month');`:''}
      COMMIT;`)
    const a=await client(uid,'first-'+users.length),b=await client(uid,'second-'+users.length)
    assert.notEqual(a.pid,b.pid)
    if(deposit) value(await a.rpc('public.book_transaction_atomic('+json({idempotency_key:randomUUID(),date:'2026-01-01',
      description:'KAN62 synthetic owner deposit',amount:100000,type:'kan62_deposit',vat_rate:0})+')'))
    const [row]=await admin.run(`SELECT json_build_object('period',(SELECT id FROM public.vat_periods WHERE user_id=${literal(uid)}::uuid LIMIT 1));`)
    return {uid,a,b,period:row.period}
  }
  async function snapshot(uid) {return (await admin.run(`SELECT pg_temp.kan62_snapshot(${literal(uid)}::uuid);`))[0]}
  async function journal(receipt,uid,cost,vat,capitalized=false) {
    await admin.run(`SELECT pg_temp.kan62_purchase(${json(receipt)},${literal(uid)}::uuid,${cost},${vat},${capitalized});`)
  }
  async function check(name,fn) {
    try {const details=await fn();records.push({name,status:'PASS',details});console.log('PASS '+name)}
    catch(error){records.push({name,status:'FAIL',error:error.stack});throw error}
  }
  try {
    admin=new LocalSession(manifest,process.env,'observer');sessions.push(admin);await admin.open()
    const [ownerInfo]=await admin.run('SELECT json_build_object(\'ids\',jsonb_agg(id ORDER BY id)) FROM auth.users;')
    priorOwners=ownerInfo.ids
    ;[priorRows]=await admin.run(retainedOwnerSQL(priorOwners))
    ;[priorCatalog]=await admin.run(catalogSQL)
    run.save('retained-before.json',{identity:manifest,owners:priorOwners,rows:priorRows,catalog:priorCatalog})
    await admin.run(readSQL('kan62_test_helpers.sql'))
    const [definition]=await admin.run(`SELECT json_build_object('body',pg_get_functiondef('public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)'::regprocedure));`)
    assert(definition.body.includes('kan62-rule-contract-v1'),'Install candidate before concurrency')
    for(const deduction of ['none','full']) {
      await check('two package purchases, stale loser, reload and third member: '+deduction,async()=>{
        const f=await fixture(deduction),cost=deduction==='none'?12500:10000,vat=12500-cost
        const a=value(await f.a.rpc(bookSQL(payload(deduction))));await journal(a,f.uid,cost,vat)
        const beforeA=await snapshot(f.uid)
        const p=payload(deduction,{connection_assessment:'connected',connected_asset_ids:[a.asset_id],expected_prior_asset_ids:[a.asset_id],
          expected_threshold_basis_amount:20000,useful_life_answer:'more_than_three_years_or_unknown'})
        await f.a.run('BEGIN;');const b=value(await f.a.rpc(bookSQL(p)))
        await f.b.run('BEGIN;');const pending=f.b.rpc(bookSQL({...p,idempotency_key:randomUUID()}));pending.catch(()=>{})
        const wait=await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;')
        denied(await pending,'23514',/bedömningsvärde har ändrats/)
        const winnerState=await snapshot(f.uid);await f.b.run('COMMIT;')
        assert.deepEqual(await snapshot(f.uid),winnerState,'stale loser no extra rows')
        const c=value(await f.b.rpc(bookSQL(payload(deduction,{connection_assessment:'connected',connected_asset_ids:[b.asset_id],
          expected_prior_asset_ids:[a.asset_id,b.asset_id],expected_threshold_basis_amount:30000,
          expected_reclassification_amount:2*cost,useful_life_answer:'more_than_three_years_or_unknown'}))))
        await journal(c,f.uid,cost,vat,true)
        await admin.run(`SELECT pg_temp.kan62_journal(${literal(c.reclassification_transaction_id)}::uuid,${literal(f.uid)}::uuid,
          'fixed_asset_reclassification',0,${json([['1220',2*cost,0],['5410',0,2*cost]])});`)
        const final=await snapshot(f.uid)
        assert.equal(final.fixed_assets.length,3);assert.equal(final.fixed_asset_acquisition_idempotency.length,3)
        assert.equal(final.transactions.length,4);assert.equal(final.fixed_asset_events.length,5)
        assert(final.fixed_assets.every(x=>x.acquisition_group_id===c.acquisition_group_id&&x.capitalized_amount===cost))
        for(const row of beforeA.journal_entries) assert.deepEqual(final.journal_entries.find(x=>x.id===row.id),row)
        for(const row of winnerState.journal_entries) assert.deepEqual(final.journal_entries.find(x=>x.id===row.id),row)
        return {wait,user:f.uid,assets:final.fixed_assets.map(x=>x.id)}
      })
    }
    for(const changed of [false,true]) await check('concurrent '+(changed?'conflicting payload':'identical replay'),async()=>{
      const f=await fixture(),p=payload();await f.a.run('BEGIN;')
      const first=value(await f.a.rpc(bookSQL(p)))
      await f.b.run('BEGIN;');const pending=f.b.rpc(bookSQL(changed?{...p,gross_amount:12501}:p));pending.catch(()=>{})
      const wait=await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;')
      const before=await snapshot(f.uid),reply=await pending
      if(changed)denied(reply,'23505',/Idempotency-nyckeln har redan använts/)
      else {const replay=value(reply);assert.equal(replay.idempotent_replay,true);assert.deepEqual({...replay,idempotent_replay:false},first)}
      await f.b.run('COMMIT;');assert.deepEqual(await snapshot(f.uid),before,'no extra row for replay/conflict')
      await journal(first,f.uid,12500,0)
      assert.equal(before.transactions.length,1);assert.equal(before.fixed_assets.length,1)
      assert.equal(before.fixed_asset_events.length,1);assert.equal(before.fixed_asset_acquisition_idempotency.length,1)
      return {wait,user:f.uid,transaction:first.transaction_id}
    })
    for(const first of ['close','purchase']) await check('actual year close race, '+first+' first',async()=>{
      const f=await fixture('none',{deposit:true}),p=payload('none',{gross_amount:1250,expected_threshold_basis_amount:1000})
      const holder=first==='close'?f.a:f.b,waiter=first==='close'?f.b:f.a
      const holderCall=first==='close'?'public.close_year_atomic(2026)':bookSQL(p)
      const waiterCall=first==='close'?bookSQL(p):'public.close_year_atomic(2026)'
      await holder.run('BEGIN;');const held=value(await holder.rpc(holderCall));await waiter.run('BEGIN;')
      const pending=waiter.rpc(waiterCall);pending.catch(()=>{});const wait=await waitBlocked(admin,waiter,holder)
      await holder.run('COMMIT;');const before=await snapshot(f.uid),reply=await pending
      if(first==='close')denied(reply,'23514',/Räkenskapsår 2026 är låst/);else value(reply)
      await waiter.run('COMMIT;');const final=await snapshot(f.uid)
      assert.equal(final.closed_years.length,1)
      assert.deepEqual(final.journal_entries,before.journal_entries,'year close no invented journal')
      if(first==='close')assert.deepEqual(final,before,'year rejection no rows');else await journal(held,f.uid,1250,0)
      return {wait,user:f.uid,closed:true}
    })
    for(const first of ['close','purchase']) await check('actual VAT close race, '+first+' first',async()=>{
      const f=await fixture('full',{period:true}),p=payload('full',{gross_amount:1250,expected_threshold_basis_amount:1000})
      const holder=first==='close'?f.a:f.b,waiter=first==='close'?f.b:f.a
      const close='public.close_vat_period_atomic('+literal(f.period)+'::uuid)'
      await holder.run('BEGIN;');const held=value(await holder.rpc(first==='close'?close:bookSQL(p)))
      await waiter.run('BEGIN;');const pending=waiter.rpc(first==='close'?bookSQL(p):close);pending.catch(()=>{})
      const wait=await waitBlocked(admin,waiter,holder);await holder.run('COMMIT;');const before=await snapshot(f.uid)
      const reply=await pending
      if(first==='close')denied(reply,'23514',/redan stängd eller deklarerad/)
      else {
        const closing=value(reply);assert.equal(closing.closing_amount,-250)
        await journal(held,f.uid,1000,250)
        // Closing is still uncommitted here: inspect after waiter commit below.
      }
      await waiter.run('COMMIT;');const final=await snapshot(f.uid)
      assert.equal(final.vat_periods[0].status,'closed')
      if(first==='close')assert.deepEqual(final,before,'VAT rejection no rows')
      else await admin.run(`SELECT pg_temp.kan62_journal(${literal(reply.value.closing_transaction_id)}::uuid,
        ${literal(f.uid)}::uuid,'vat_closing',NULL,${json([['2650',250,0],['2641',0,250]])},'2026-03-31');`)
      return {wait,user:f.uid,closingAmount:final.vat_periods[0].closing_amount}
    })
    await check('different owners do not share acquisition lock',async()=>{
      const f=await fixture(),other=await fixture();await f.a.run('BEGIN;')
      const a=value(await f.a.rpc(bookSQL(payload())))
      // First remains uncommitted while another owner's real call must finish.
      const b=value(await other.a.rpc(bookSQL(payload())))
      assert.notEqual(a.asset_id,b.asset_id);const independent=await snapshot(other.uid)
      assert(independent.fixed_assets.every(x=>x.user_id===other.uid));await f.a.run('COMMIT;')
      await journal(a,f.uid,12500,0);await journal(b,other.uid,12500,0)
      return {first:f.uid,other:other.uid,independentCommit:true}
    })
  } finally {
    // Closing our own connections rolls back pending transactions. Never delete fixtures.
    for(const s of sessions)await s.close()
    const verifier=new LocalSession(manifest,process.env,'retained-data-verifier')
    try {
      if(priorRows){
        await verifier.open()
        const [after]=await verifier.run(retainedOwnerSQL(priorOwners))
        const [catalog]=await verifier.run(catalogSQL)
        run.save('retained-after.json',{rows:after,catalog})
        assert.deepEqual(after,priorRows,'Existing test data must remain byte-for-byte equivalent')
        assert.deepEqual(catalog,priorCatalog,'No permanent security/schema changes from test execution')
        preservation={verified:true,users:priorOwners.length,catalogUnchanged:true}
      }
    } catch(error){preservation={verified:false,error:error.stack};throw error}
    finally {
      await verifier.close()
      run.save('session-logs.json',sessions.map(s=>({label:s.label,pid:s.pid,log:s.log,stderr:s.stderr})))
      run.save('concurrency-results.json',{run:run.id,identity:manifest,users,records,preservation,
        complete:records.length===9&&records.every(r=>r.status==='PASS')&&preservation.verified})
    }
  }
  assert.equal(records.length,9);assert(records.every(r=>r.status==='PASS'))
  console.log('PASS all 9 KAN62 concurrent cases; synthetic data preserved')
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await main()
