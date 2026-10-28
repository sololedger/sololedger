// Synthetic in-memory transport for the real archive UI. Never imported by app code.
import {emptyDeclarationCommand} from '../../src/lib/declarationArchiveView'
import {parseDeclarationCommand} from '../../src/lib/declarationArchive'
import {exportDeclarationHtml} from '../../src/lib/declarationArchiveExport.server'
import {fixture} from './neUxMocks'
const copies=new Map(),replays=new Map()
let nextId=100
const id=n=>`10900000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context=()=>window.neFixture
const fail=message=>Object.assign(new Error(message),{uncertain:false})
function verify(owner){if(owner!==context().owner)throw fail('Inloggningen har ändrats.')}
function source(owner,year,current=false){return {id:current?null:id(10),income_year:year,captured_at:'2026-04-01T12:00:00Z',calculation_version:'ne-existing-v1',app_revision:'f2dbd6074697fafa4c5833a4c2e7b53615c3d405',source_fingerprint:'a'.repeat(64),company:{name:`${current?'Nuvarande':'Historiskt'} företag ${owner}`,org_nr:null},locked:current?context().locked:true,report:fixture(current?context().scene:'no-review',year).report,risk:{assessment:context().scene==='import'?'limited':'not_assessed',reasons:context().scene==='import'?['import_marker']:[],verification:'not_verified'}}}
function versions(owner){if(!copies.has(owner)){const c=emptyDeclarationCommand(2025),s=source(owner,2025),v={id:id(1),income_year:2025,revision_no:1,previous_revision_id:null,source_snapshot_id:s.id,submission_source_snapshot_id:null,recorded_at:'2026-04-01T12:00:00Z',change_kind:'initial',reason:'',submission_status:'not_recorded',manual:c.manual,submission:c.submission,source:s,submitted_source:null};const submitted={...c.submission,status:'submitted_by_user',date:'2026-04-20',kind:'original',fields:[{field:'R47',amount:'105000.00'}],source_snapshot_id:s.id,receipt_reference:'Syntetisk kvittens'};copies.set(owner,[{...structuredClone(v),id:id(2),revision_no:2,previous_revision_id:v.id,recorded_at:'2026-04-20T12:00:00Z',change_kind:'documentation_correction',reason:'Dokumenterad inlämning',submission:submitted,submission_status:'submitted_by_user',submission_source_snapshot_id:s.id,submitted_source:s},v])}return copies.get(owner)}
async function gate(kind,owner){verify(owner);window.neReads??=[];window.neReads.push({kind,owner});if(window.neFault==='index'&&kind==='index')throw fail('Historiken kunde inte hämtas.');if(window.neDelay===kind)await new Promise(resolve=>{window.neRelease=resolve});verify(owner)}
export async function loadDeclarationIndex(owner){await gate('index',owner);return structuredClone(versions(owner)).map(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!['source','submitted_source','manual','submission'].includes(key))))}
export async function loadDeclarationVersion(owner,key){await gate('version',owner);const v=versions(owner).find(v=>v.id===key);if(!v)throw fail('Versionen är inte tillgänglig för dig.');return structuredClone(v)}
export async function loadDeclarationPreview(owner,year){await gate('preview',owner);return source(owner,year,true)}
export async function loadDeclarationExport(owner,key){return exportDeclarationHtml(await loadDeclarationVersion(owner,key))}
export async function submitDeclarationVersion(owner,key,payload){verify(owner);const command=parseDeclarationCommand(payload);window.neWrites??=[];window.neWrites.push({owner,key,command:structuredClone(command)});if(window.neFault==='conflict')throw fail('Underlaget eller historiken har ändrats. Läs in senaste versionen innan du fortsätter.');if(window.neFault==='auth')throw fail('Inloggningen har ändrats.');const replayKey=owner+key;if(replays.has(replayKey)){if(replays.get(replayKey).body!==JSON.stringify(command))throw fail('Begäransnyckeln har redan använts.');return {...replays.get(replayKey).receipt,status:'replayed'}}
 const list=versions(owner),latest=list.find(v=>v.income_year===command.income_year);if(command.expected_previous_id!==(latest?.id??null))throw fail('Historiken har ändrats.');const capture=command.source.mode==='capture',s=capture?{...source(owner,command.income_year,true),id:id(++nextId)}:latest?.source??null
 const v={id:id(++nextId),income_year:command.income_year,revision_no:(latest?.revision_no??0)+1,previous_revision_id:latest?.id??null,source_snapshot_id:s?.id??null,submission_source_snapshot_id:command.submission.source_snapshot_id==='current'?s?.id:command.submission.source_snapshot_id,recorded_at:'2026-10-28T12:00:00Z',change_kind:command.change_kind,reason:command.reason,submission_status:command.submission.status,manual:structuredClone(command.manual),submission:structuredClone(command.submission),source:s,submitted_source:latest?.submitted_source??null}
 list.unshift(v);const receipt={id:v.id,revision_no:v.revision_no,status:'saved'};replays.set(replayKey,{body:JSON.stringify(command),receipt})
 if(window.neFault==='lost')throw Object.assign(new Error('Utfallet är okänt. Försök igen med samma sparbegäran.'),{uncertain:true})
 if(window.neFault==='saved-read-error')window.neFault='index'
 return receipt
}
window.neArchive={snapshot:owner=>structuredClone(versions(owner)),reset(){copies.clear();replays.clear();window.neWrites=[];window.neReads=[];window.neFault='';window.neDelay=''}}
