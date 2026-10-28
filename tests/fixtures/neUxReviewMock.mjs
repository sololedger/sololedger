import {getNeReviewData as read,getNeReviewEntries as entries} from './neUxMocks'
async function gate(owner,kind){window.neReads??=[];window.neReads.push({owner,kind});if(!owner.startsWith(window.neFixture.owner+':'))throw Error('Ägaren har ändrats');if(window.neReviewDelay)await new Promise(resolve=>window.neReviewRelease=resolve);if(!owner.startsWith(window.neFixture.owner+':'))throw Error('Ägaren har ändrats')}
export async function getNeReviewData(owner,year){await gate(owner,'review');return read(owner,year)}
export async function getNeReviewEntries(owner,...args){await gate(owner,'entries');return entries(owner,...args)}
