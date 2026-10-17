// Runs the actual page handlers with explicit offline boundaries. No network.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as attempts from '../src/lib/standardBookingAttempt.ts'
import { parseStandardBookingAmount } from '../src/lib/standardBookingAmount.ts'
import { newBookingCategoryError } from '../src/lib/bookingCategoryVisibility.ts'
const source=readFileSync('src/app/page.tsx','utf8')
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const names=['handleAddTransaction','runStandardBooking','finishStandardBooking']
const nodes=[]
function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))nodes.push(node.getText(tree));ts.forEachChild(node,visit)}
visit(tree)
if(nodes.length!==names.length)throw Error('Actual page handlers missing')
const code=ts.transpileModule(nodes.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText
export function bindPageHandlers(context) {
 Object.assign(context,attempts,{parseStandardBookingAmount,newBookingCategoryError})
 vm.createContext(context)
 vm.runInContext(code,context)
 return context
}
export function createBookingStorage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
export function createBookingLocks(){const active=new Set();return {request:async(key,options,fn)=>{if(active.has(key))return fn(null);active.add(key);try{return await fn({name:key})}finally{active.delete(key)}}}}
