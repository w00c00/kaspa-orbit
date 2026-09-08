const {test}=require('node:test');const assert=require('node:assert/strict');const w=require('@kluster/kaspa-wasm');const {covenantIdentity,ordinaryFunding}=require('../desktop/utxo-identity.cjs');
test('Covenant ID is read from real WASM UTXO references, not only flat fixtures',()=>{
 const id='ab'.repeat(32),entries=new w.UtxoEntries([{outpoint:{transactionId:'cd'.repeat(32),index:0},amount:1n,scriptPublicKey:'000051',blockDaaScore:0n,isCoinbase:false,covenantId:id}]);
 const refs=entries.items;
 assert.equal(ordinaryFunding(refs[0]),true);
 // UtxoEntries' plain-object constructor drops covenantId. Populate the actual
 // entry copy at the RPC boundary instead, matching live RPC entry getters.
 const getEntry=Object.getOwnPropertyDescriptor(w.UtxoEntryReference.prototype,'entry').get;
 Object.defineProperty(refs[0],'entry',{get(){const entry=getEntry.call(this);entry.covenantId=new w.Hash(id);return entry;}});
 try{assert.ok(refs[0] instanceof w.UtxoEntryReference);assert.equal(refs[0].covenantId,undefined);assert.equal(covenantIdentity(refs[0]),id);assert.equal(covenantIdentity(refs[0]),id);assert.equal(ordinaryFunding(refs[0]),false);assert.equal(ordinaryFunding({isCoinbase:true}),false);assert.equal(covenantIdentity({covenantId:id}),id);assert.equal(covenantIdentity({}), '');assert.throws(()=>covenantIdentity({covenantId:'invalid'}));}
 finally{for(const ref of refs)ref.free();entries.free();}
});
