import {supabase} from './supabaseClient'
import {requireProfileContext,isCurrentProfileContext} from './profileContext'
import {parseChecklist,type ChecklistCommand} from './yearEndChecklist'

async function request(owner:string,year:number,command?:ChecklistCommand){
 const ticket=requireProfileContext()
 if(ticket.userId!==owner)throw Error('Inloggningen har ändrats. Läs om sidan.')
 const session=await supabase.auth.getSession()
 if(session.error||session.data.session?.user.id!==owner||!isCurrentProfileContext(ticket))throw Error('Inloggningen har ändrats. Läs om sidan.')
 const args=command?{p_year:year,p_key:command.key,p_confirmed:command.confirmed,p_expected_revision:command.revision,p_expected_basis:command.basis,p_request_id:command.requestId}:{p_year:year}
 let result
 try{result=await supabase.rpc(command?'save_year_end_checklist':'get_year_end_checklist',args).abortSignal(AbortSignal.timeout(25000))}
 catch{throw Error(command?'Sparandet kunde inte bekräftas. Försök igen med samma begäran eller läs om.':'Checklistan kunde inte hämtas.')}
 requireProfileContext(ticket)
 const current=await supabase.auth.getSession()
 if(current.error||current.data.session?.user.id!==owner||!isCurrentProfileContext(ticket))throw Error('Inloggningen har ändrats. Läs om sidan.')
 if(result.error)throw Error(['PT409','40001'].includes(result.error.code)?'Checklistan eller underlaget har ändrats. Läs om checklistan och kontrollera innan du bekräftar.':command?'Sparandet kunde inte bekräftas. Försök igen eller läs om.':'Checklistan kunde inte hämtas.')
 return parseChecklist(result.data,owner,year)
}
export const checklistPort=(owner:string,year:number)=>({load:()=>request(owner,year),save:(c:ChecklistCommand)=>request(owner,year,c)})
