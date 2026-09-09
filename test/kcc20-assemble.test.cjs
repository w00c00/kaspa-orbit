const {test}=require('node:test');const assert=require('node:assert/strict');const w=require('@kluster/kaspa-wasm');
const {assembleAddressTransfer}=require('../desktop/kcc20-assemble.cjs');const {encodeOrdinaryOutput}=require('../desktop/kcc20-codec.cjs');
const {programHex}=require('./fixtures/kcc20-2433.json');
function fixture(owner='11'.repeat(32)){const recipient='22'.repeat(32),covenantId='aa'.repeat(32);
 const program=encodeOrdinaryOutput(programHex,{owner,identifierType:3,amount:'1000'}),spk=w.payToScriptHashScript(program);
 const input={transactionId:'bb'.repeat(32),index:0,covenantId,programHex:program,valueSompi:'50000000',blockDaaScore:'1',scriptPublicKey:'0000'+spk.script};spk.free();
 const output={covenantId,owner:recipient,amount:'1000',programHex:encodeOrdinaryOutput(program,{owner:recipient,identifierType:3,amount:'1000'})};
 return {plan:{network:'testnet-10',covenantId,inputs:[input],outputs:[output]},funding:{transactionId:'cc'.repeat(32),index:0,covenantId:null,valueSompi:'100000000',blockDaaScore:'1',scriptPublicKey:'000020'+owner+'ac',isCoinbase:false},options:{owner,feeSompi:'100000'}};
}
test('pre-sign node recheck binds every token and funding input to reviewed bytes',async()=>{
 const {recheckCovenantInputs}=require('../desktop/covenant-preflight.cjs');
 const {plan,funding,options}=fixture(),draft=assembleAddressTransfer(plan,funding,options);
 const raw=JSON.parse(draft.transaction);
 const makeEntries=()=>raw.inputs.map(i=>({outpoint:{transactionId:i.transactionId,index:i.index},covenantId:i.utxo.covenantId,amount:BigInt(i.utxo.amount),blockDaaScore:BigInt(i.utxo.blockDaaScore),isCoinbase:false,scriptPublicKey:{version:0,script:i.utxo.scriptPublicKey.slice(4)}}));
 let entries=makeEntries();
 const service={network:plan.network,revision:0,withRpc:(fn,network)=>{assert.equal(network,plan.network);return fn({getUtxosByAddresses:async({addresses})=>{assert.equal(addresses.length,2);return {entries};}});}};
 const result=await recheckCovenantInputs(service,plan.network,draft.transaction);
 assert.equal(result.transaction,draft.transaction);assert.equal(result.inputCount,2);assert.equal(result.consensusVerified,false);
 for(const mutate of [e=>e.pop(),e=>e.push(e[0]),e=>e[0].covenantId='dd'.repeat(32),e=>e[1].amount++,e=>e[1].isCoinbase=true,e=>e[0].blockDaaScore++,e=>e[1].scriptPublicKey.script='51']){
  entries=makeEntries();mutate(entries);await assert.rejects(recheckCovenantInputs(service,plan.network,draft.transaction),/Input is spent|Live input differs/);
 }
 entries=makeEntries();service.withRpc=async fn=>{const value=await fn({getUtxosByAddresses:async()=>({entries})});service.revision++;return value;};
 await assert.rejects(recheckCovenantInputs(service,plan.network,draft.transaction),/Network changed/);
});
test('unsigned KCC20 assembly preserves bindings and balances KAS without signing',()=>{
 const {plan,funding,options}=fixture(),draft=assembleAddressTransfer(plan,funding,options),tx=JSON.parse(draft.transaction);
 assert.equal(tx.inputs.length,2);assert.equal(tx.inputs[0].utxo.covenantId,plan.covenantId);assert.equal(tx.inputs[1].utxo.covenantId,null);assert.equal(tx.inputs[1].signatureScript,'');assert.ok(tx.inputs[0].signatureScript.endsWith(plan.inputs[0].programHex));
 assert.deepEqual(tx.outputs[0].covenant,{authorizingInput:0,covenantId:plan.covenantId});assert.equal(tx.outputs[1].covenant,null);
 assert.equal(tx.inputs.reduce((n,i)=>n+BigInt(i.utxo.amount),0n)-tx.outputs.reduce((n,o)=>n+BigInt(o.value),0n),100000n);assert.ok(BigInt(draft.estimatedMass)<=100000n);assert.equal(draft.readyToSign,false);
});
test('input preflight accepts real WASM UTXO references without losing covenant identity',async()=>{
 const {recheckCovenantInputs}=require('../desktop/covenant-preflight.cjs');
 const {restoreBoundTransaction}=require('../desktop/covenant-transaction.cjs');
 const {plan,funding,options}=fixture(),draft=assembleAddressTransfer(plan,funding,options);
 const tx=restoreBoundTransaction(draft.transaction),inputs=tx.inputs,entries=inputs.map(input=>input.utxo);
 try{
  assert.ok(entries.every(entry=>entry instanceof w.UtxoEntryReference));
  const service={network:plan.network,revision:0,withRpc:fn=>fn({getUtxosByAddresses:async()=>({entries})})};
  for(let i=0;i<2;i++){
   const result=await recheckCovenantInputs(service,plan.network,draft.transaction);
   assert.equal(result.liveInputsVerified,true);assert.equal(result.inputCount,2);
  }
  const counterfeit=JSON.parse(draft.transaction);counterfeit.inputs[0].utxo.covenantId='dd'.repeat(32);
  await assert.rejects(recheckCovenantInputs(service,plan.network,JSON.stringify(counterfeit)),/differs/);
 }finally{entries.forEach(entry=>entry.free());inputs.forEach(input=>input.free());tx.free();}
});
test('KCC20 assembly rejects malformed funding, counterfeit token and inadequate fees',()=>{
 for(const mutate of [x=>x.funding.covenantId=x.plan.covenantId,x=>x.funding.isCoinbase=true,x=>x.funding.scriptPublicKey='000051',x=>x.options.feeSompi='0',x=>x.plan.inputs[0].covenantId='dd'.repeat(32),x=>x.plan.outputs[0].amount='1001',x=>x.funding.transactionId=x.plan.inputs[0].transactionId]){
  const x=fixture();mutate(x);assert.throws(()=>assembleAddressTransfer(x.plan,x.funding,x.options));
 }
});
test('actual owner signing preserves KCC20 outputs, covenant metadata and measured fee',()=>{
 const key=new w.PrivateKey(require('node:crypto').randomBytes(32).toString('hex'));
 const publicKey=key.toPublicKey(),xonly=publicKey.toXOnlyPublicKey();let tx;
 try{
  const {plan,funding,options}=fixture(xonly.toString());const draft=assembleAddressTransfer(plan,funding,options);
  const before=JSON.parse(draft.transaction);tx=require('../desktop/covenant-transaction.cjs').restoreBoundTransaction(draft.transaction);
  const signature=w.createInputSignature(tx,draft.ownerInputIndex,key,w.SighashType.All);assert.equal(signature.length,132);assert.equal(signature.slice(0,2),'41');
  const inputs=tx.inputs;try{inputs[draft.ownerInputIndex].signatureScript=signature;tx.inputs=inputs;}finally{inputs.forEach(input=>input.free());}
  tx.finalize().free();assert.equal(w.updateTransactionMass(plan.network,tx,1),true);
  const actualMass=w.calculateTransactionMass(plan.network,tx,1),after=JSON.parse(tx.serializeToSafeJSON());
  assert.deepEqual(after.outputs,before.outputs);assert.deepEqual(after.inputs[0],before.inputs[0]);
  assert.deepEqual(after.inputs[1].utxo,before.inputs[1].utxo);assert.equal(after.inputs[1].signatureScript.length,132);
  assert.ok(actualMass<=BigInt(options.feeSompi));assert.equal(String(actualMass),draft.estimatedMass);
 }finally{tx?.free();xonly.free();publicKey.free();key.free();}
});
test('KCC20 signer binds reviewed bytes, exact owner and ALL signature on TN10',()=>{
 const {signAddressTransfer}=require('../desktop/kcc20-sign.cjs');
 const key=new w.PrivateKey(require('node:crypto').randomBytes(32).toString('hex')),publicKey=key.toPublicKey(),owner=publicKey.toXOnlyPublicKey();
 try{
  const f=fixture(owner.toString()),draft=assembleAddressTransfer(f.plan,f.funding,f.options);
  const signed=signAddressTransfer(f.plan,f.funding,f.options,draft.transaction,key);
  assert.equal(JSON.parse(signed.transaction).inputs[1].signatureScript.slice(-2),'01');assert.equal(signed.consensusVerified,false);
  assert.deepEqual(JSON.parse(signed.transaction).outputs,JSON.parse(draft.transaction).outputs);
  assert.throws(()=>signAddressTransfer(f.plan,f.funding,f.options,draft.transaction+' ',key),/changed since review/);
  assert.throws(()=>signAddressTransfer(f.plan,f.funding,{...f.options,owner:'11'.repeat(32)},draft.transaction,key),/key mismatch/);
  assert.throws(()=>signAddressTransfer({...f.plan,network:'mainnet'},f.funding,f.options,draft.transaction,key),/TN10/);
 }finally{owner.free();publicKey.free();key.free();}
});
