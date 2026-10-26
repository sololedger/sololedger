export const CHECK_KEYS = ['documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year'] as const
export type CheckKey = typeof CHECK_KEYS[number]
export type ChecklistRow = { check_key: CheckKey; confirmed: boolean; confirmed_at: string | null; revision: number; basis_fingerprint: string | null; confirmation_version: number; basis_version: number }
export type ChecklistData = { owner: string; year: number; basis_version: number; basis: Record<CheckKey,string>|null; checks: ChecklistRow[]; system: {locked: boolean; periods: {start:string;end:string;status:string}[]; declaration_versions:number} }
export type ChecklistCommand = {key:CheckKey; confirmed:boolean; revision:number; basis:string|null; requestId:string}
export function parseChecklist(value: unknown, owner:string, year:number): ChecklistData {
 const d=value as ChecklistData
 if(!d || d.owner!==owner || d.year!==year || d.basis_version!==1 ||
  (d.basis!==null&&(!d.basis||!CHECK_KEYS.every(k=>typeof d.basis![k]==='string'&&/^[a-f0-9]{32}$/.test(d.basis![k])))) ||
  !Array.isArray(d.checks)||d.checks.length>11||new Set(d.checks.map(r=>r.check_key)).size!==d.checks.length||
  !d.checks.every(r=>CHECK_KEYS.includes(r.check_key)&&typeof r.confirmed==='boolean'&&Number.isSafeInteger(r.revision)&&r.revision>0&&r.basis_version===1&&r.confirmation_version===1&&(!r.confirmed||(typeof r.confirmed_at==='string'&&Number.isFinite(Date.parse(r.confirmed_at))&&(r.basis_fingerprint===null||/^[a-f0-9]{32}$/.test(r.basis_fingerprint))))) ||
  typeof d.system?.locked!=='boolean'||!Number.isSafeInteger(d.system.declaration_versions)||d.system.declaration_versions<0||!Array.isArray(d.system.periods)||!d.system.periods.every(p=>typeof p.start==='string'&&typeof p.end==='string'&&typeof p.status==='string')) throw Error('Checklistans svar kunde inte verifieras. Läs om.')
 return d
}
export const needsReview=(d:ChecklistData,k:CheckKey)=>{const r=d.checks.find(r=>r.check_key===k);return d.basis!==null&&!!r?.confirmed&&r.basis_fingerprint!==d.basis[k]}

export type ChecklistPort={load:()=>Promise<ChecklistData>;save:(command:ChecklistCommand)=>Promise<ChecklistData>}
type State={data:ChecklistData|null;busy:boolean;error:string;pending:ChecklistCommand|null;notice:string}
// One store per owner/year mount. No browser persistence, shared cache or accounting writes.
export class ChecklistStore {
 state:State={data:null,busy:true,error:'',pending:null,notice:''}
 listeners=new Set<()=>void>(); generation=0; disposed=false
 constructor(public port:ChecklistPort,public newId=()=>crypto.randomUUID()){}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}}
 snapshot=()=>this.state
 start(){this.disposed=false;return this.load()}
 emit(p:Partial<State>){if(this.disposed)return;this.state={...this.state,...p};this.listeners.forEach(fn=>fn())}
 async load(){if(this.disposed)return;const generation=++this.generation;this.emit({busy:true,error:'',notice:''});try{const data=await this.port.load();if(generation===this.generation)this.emit({data,busy:false,pending:null})}catch{if(generation===this.generation)this.emit({data:null,busy:false,error:'Checklistan kunde inte hämtas. Dina sparade svar har inte raderats.'})}}
 async set(key:CheckKey,confirmed:boolean){if(this.state.busy||this.state.pending||!this.state.data||this.disposed)return;const d=this.state.data;await this.send({key,confirmed,revision:d.checks.find(r=>r.check_key===key)?.revision??0,basis:d.basis?.[key]??null,requestId:this.newId()})}
 async retry(){if(!this.state.busy&&this.state.pending)await this.send(this.state.pending)}
 async send(command:ChecklistCommand){const generation=++this.generation;this.emit({busy:true,pending:command,error:'',notice:'Sparar…'});try{const data=await this.port.save(command);if(generation===this.generation)this.emit({data,busy:false,pending:null,notice:'Sparat'})}catch(error){if(generation===this.generation)this.emit({busy:false,notice:'',error:error instanceof Error?error.message:'Ändringen kunde inte bekräftas. Försök igen eller läs om.'})}}
 dispose(){this.disposed=true;++this.generation;this.listeners.clear()}
}
