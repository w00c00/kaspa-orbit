const {test}=require('node:test');const assert=require('node:assert/strict');const wasm=require('@kluster/kaspa-wasm');
const {planAddressTransfer}=require('../desktop/kcc20-plan.cjs');const {encodeOrdinaryOutput}=require('../desktop/kcc20-codec.cjs');
const {programHex}=require('./fixtures/kcc20-2433.json');
const owner='11'.repeat(32),recipient='22'.repeat(32),covenantId='aa'.repeat(32);
function setup(amounts){
 const cells=amounts.map((amount,index)=>({network:'testnet-10',covenantId,transactionId:'bb'.repeat(32),index,programHex:encodeOrdinaryOutput(programHex,{owner,identifierType:3,amount})}));
 const entries=cells.map(cell=>{const script=wasm.payToScriptHashScript(cell.programHex);const entry={outpoint:{transactionId:cell.transactionId,index:cell.index},covenantId,amount:50000000n,blockDaaScore:1n,isCoinbase:false,scriptPublicKey:{version:script.version,script:script.script}};script.free();return entry;});
 const service={network:'testnet-10',revision:0,withRpc:fn=>fn({getUtxosByAddresses:async()=>({entries})})};
 return {service,entries,args:{network:'testnet-10',covenantId,owner,recipient,amount:'1200',cells}};
}
test('KCC20 planning binds live token identity and conserves atomic balances',async()=>{
 const {service,args}=setup(['500','1000']);const plan=await planAddressTransfer(service,args);
 assert.equal(plan.inputAmount,'1500');assert.equal(plan.changeAmount,'300');assert.equal(plan.outputs[0].owner,recipient);assert.equal(plan.outputs[1].owner,owner);assert.equal(plan.readyToSign,false);assert.equal(plan.requiresOwnerCospend,true);
 assert.equal(plan.outputs.reduce((n,o)=>n+BigInt(o.amount),0n),1500n);
});
test('KCC20 planner rejects counterfeit identity, duplicate cells, stale cells and insufficient input limit',async()=>{
 let s=setup(['1500']);s.entries[0].covenantId='cc'.repeat(32);await assert.rejects(planAddressTransfer(s.service,s.args),/Covenant ID mismatch/);
 s=setup(['1500']);s.args.cells.push(s.args.cells[0]);await assert.rejects(planAddressTransfer(s.service,s.args),/Duplicate/);
 s=setup(['1500']);s.entries.length=0;await assert.rejects(planAddressTransfer(s.service,s.args),/not live/);
 s=setup(['250','250','250','250','250']);await assert.rejects(planAddressTransfer(s.service,s.args),/four-input/);
 s=setup(['1500']);s.service.withRpc=async fn=>{const result=await fn({getUtxosByAddresses:async()=>({entries:s.entries})});s.service.revision++;return result;};await assert.rejects(planAddressTransfer(s.service,s.args),/Network changed/);
});
