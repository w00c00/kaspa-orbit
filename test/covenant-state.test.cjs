const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const w=require('@kluster/kaspa-wasm');const {verifyCovenantCell}=require('../desktop/covenant-state.cjs');
test('live covenant binding rejects same-script counterfeit ID, stale outpoint and network switch',async()=>{
 const input={covenantId:crypto.randomBytes(32).toString('hex'),transactionId:crypto.randomBytes(32).toString('hex'),index:0,programHex:'51'};const script=w.payToScriptHashScript(input.programHex);
 try{const entry={outpoint:{transactionId:input.transactionId,index:0},covenantId:input.covenantId,scriptPublicKey:script,amount:20000n,blockDaaScore:1n,isCoinbase:false};const s={network:'testnet-10',revision:0,withRpc:fn=>fn({getUtxosByAddresses:async()=>({entries:[entry]})})};
 const cell=await verifyCovenantCell(s,input);assert.equal(cell.valueSompi,'20000');assert.equal(cell.liveBindingVerified,true);assert.equal(cell.contractSemanticsVerified,false);
 entry.covenantId=crypto.randomBytes(32).toString('hex');await assert.rejects(verifyCovenantCell(s,input),/Covenant ID mismatch/);entry.covenantId=input.covenantId;entry.outpoint.index=1;await assert.rejects(verifyCovenantCell(s,input),/not live/);entry.outpoint.index=0;
 s.withRpc=fn=>fn({getUtxosByAddresses:async()=>{s.revision++;return {entries:[entry]};}});await assert.rejects(verifyCovenantCell(s,input),/Network changed/);
 }finally{script.free();}
});
