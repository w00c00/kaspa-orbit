const {test}=require('node:test');const assert=require('node:assert/strict');
const {restoreBoundTransaction}=require('../desktop/covenant-transaction.cjs');
function fixture(){const covenantId='aa'.repeat(32),scriptPublicKey='000020'+'11'.repeat(32)+'ac';return {
 id:'00'.repeat(32),version:1,inputs:[{transactionId:'bb'.repeat(32),index:0,sequence:'0',sigOpCount:0,computeBudget:400,signatureScript:'',
 utxo:{address:null,amount:'100000000',scriptPublicKey,blockDaaScore:'1',isCoinbase:false,covenantId}}],
 outputs:[{value:'90000000',scriptPublicKey,covenant:{authorizingInput:0,covenantId}}],subnetworkId:'00'.repeat(20),lockTime:'0',gas:'0',storageMass:'0',payload:''};}
test('Safe JSON roundtrip retains input identity, output binding and compute budget',()=>{
 const input=fixture(),tx=restoreBoundTransaction(JSON.stringify(input));
 try{const output=JSON.parse(tx.serializeToSafeJSON());assert.equal(output.inputs[0].utxo.covenantId,input.inputs[0].utxo.covenantId);assert.equal(output.inputs[0].computeBudget,400);assert.deepEqual(output.outputs[0].covenant,input.outputs[0].covenant);assert.notEqual(output.id,input.id);
 const again=restoreBoundTransaction(tx.serializeToSafeJSON());try{assert.equal(again.id,tx.id);}finally{again.free();}}
 finally{tx.free();}
});
test('covenant decoding refuses legacy version, omitted budgets and invalid authorizing indexes',()=>{
 for(const mutate of [x=>x.version=0,x=>delete x.inputs[0].computeBudget,x=>x.inputs[0].computeBudget=65536,x=>x.outputs[0].covenant.authorizingInput=1,x=>x.inputs[0].utxo.covenantId='not-a-hash']){
  const x=fixture();mutate(x);assert.throws(()=>restoreBoundTransaction(JSON.stringify(x)));
 }
});
