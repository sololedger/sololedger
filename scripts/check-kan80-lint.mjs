import { ESLint } from 'eslint'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const lint = new ESLint()
const files=['src/app/page.tsx','src/lib/accountingService.ts','src/lib/adminDeleteDryRun.ts','src/lib/standardBookingAttempt.ts']
const rows=[]
const inventory=messages=>messages.reduce((all,m)=>{const key=[m.ruleId,m.messageId??m.message.split('\n')[0],m.nodeType,m.severity].join(':');all[key]=(all[key]??0)+1;return all},{})
for(const file of files) {
 let before=''
 if(file!=='src/lib/standardBookingAttempt.ts')before=execFileSync('git',['show','af0378ae0935518346360e3492c38175e2c270d2:'+file],{encoding:'utf8',windowsHide:true})
 const [base]=await lint.lintText(before,{filePath:file}),[current]=await lint.lintText(readFileSync(file,'utf8'),{filePath:file})
 const a=inventory(base.messages),b=inventory(current.messages)
 for(const key in b)assert(b[key]<=(a[key]??0),'new lint diagnostic: '+file+' '+key)
 rows.push({file,baseErrors:base.errorCount,currentErrors:current.errorCount,baseWarnings:base.warningCount,currentWarnings:current.warningCount,newDiagnostics:0})
}
mkdirSync('test-results/kan80',{recursive:true});writeFileSync('test-results/kan80/lint-comparison.json',JSON.stringify(rows,null,2))
console.log('PASS changed-source lint: no new diagnostics against verified Production base',JSON.stringify(rows))
