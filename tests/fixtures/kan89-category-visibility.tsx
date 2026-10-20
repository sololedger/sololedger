// @ts-nocheck -- synthetic browser transport controlled by the offline test runner
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import Kontoplan from '../../src/components/Kontoplan'
import TransactionForm from '../../src/components/TransactionForm'
import { profileToCompanyVatProfile } from '../../src/lib/vatProfileAdapter'

const accounts = [
  {id:'programvaror',name:'Programvaror',debit_account:'5420',credit_account:'1930',default_vat_rate:25,comment:'',user_id:'user-a',hidden_from_new_booking:false},
  {id:'own',name:'Egen kategori',debit_account:'6991',credit_account:'1930',default_vat_rate:0,comment:'',user_id:'user-a',hidden_from_new_booking:false},
  {id:'egen_insättning',name:'Äldre insättning',debit_account:'1930',credit_account:'2018',default_vat_rate:0,comment:'',user_id:'user-a',hidden_from_new_booking:false},
]
let failUpdate=false
// Transport is synthetic; the actual application components and event handlers run.
window.__kan89Db={auth:{getUser:async()=>({data:{user:{id:'user-a'}}})},from(table:string){
 let filters:Record<string,unknown>={},payload:Record<string,unknown>|null=null
 const q={select(){return q},eq(k:string,v:unknown){filters[k]=v;return q},update(p:Record<string,unknown>){payload=p;return q},
 order:async()=>({data:table==='favorites'?[{id:'fav-a',name:'Sparad favorit',type:'programvaror',amount:1250,vat_rate:25}]:accounts.filter(a=>a.user_id===filters.user_id).map(a=>({...a})),error:null}),
 single:async()=>{if(failUpdate)return {data:null,error:{message:'fixture failure'}};const row=accounts.find(a=>a.id===filters.id&&a.user_id===filters.user_id);if(!row)return {data:null,error:{message:'missing'}};Object.assign(row,payload);return {data:{...row},error:null}}}
 return q
}}
const profile=profileToCompanyVatProfile({vat_status:'registered',domestic_sales_vat_treatment:'taxable',foreign_purchase_reporting:'required',default_deduction_entitlement:'full',vat_period_type:'quarter',vat_management_from:'2026-01-01'})
function App(){
 const [all,setAll]=useState(accounts.map(a=>({...a})))
 const [ready,setReady]=useState(true)
 const [editing,setEditing]=useState(false)
 const [form,setForm]=useState({date:'2026-10-01',description:'Synthetic booking',amount:'1250',type:'',vatRate:25,inputVatDeduction:'profile_default' as const,file:null})
 window.kan89={setReady,select:(type:string)=>setForm(f=>({...f,type})),edit:(v:boolean)=>setEditing(v),failUpdate:(v:boolean)=>{failUpdate=v},submits:window.kan89?.submits??0}
 return <><Kontoplan onAccountCreated={()=>setAll(accounts.map(a=>({...a})))}/><TransactionForm
 formData={form} setFormData={setForm} kontoplan={all} kontoplanReady={ready}
 isYearLocked={false} editingId={editing?'historical':null} editingBooked={editing}
 uploading={false} periodisera={false} setPeriodisera={()=>{}} periodMonth="2027-01" setPeriodMonth={()=>{}}
 onSubmit={e=>{e.preventDefault();window.kan89.submits++}} onVatV2Submit={async()=>{throw Error('not in scope')}}
 onCancelEdit={()=>{setEditing(false);setForm(f=>({...f,type:''}))}} userId="user-a"
 vatStatus="registered" domesticSalesVatTreatment="taxable" companyVatProfileResult={profile}
 lastSubmitted={null} onSaveFavorite={async()=>{}} onDismissFavorite={()=>{}}
 paymentAccountRoles={[]} paymentAccountRolesLoading={false} paymentAccountRolesLoaded={true}
 paymentAccountRolesError={null} onRefreshPaymentAccountRoles={async()=>{}}
 onOpenPaymentAccountSettings={()=>{}} onOpenCustomerInvoices={()=>{}} onOpenFixedAssets={()=>{}} /></>
}
createRoot(document.getElementById('root')!).render(<App/>);
