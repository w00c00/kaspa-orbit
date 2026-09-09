const {test}=require('node:test'),assert=require('node:assert/strict'),w=require('@kluster/kaspa-wasm');
const {transferRequest}=require('../desktop/kcc20-request.cjs');
test('KCC20 request binds network, recipient script and exact atomic amount',()=>{
 const script=new w.ScriptPublicKey(0,'20'+'11'.repeat(32)+'ac'),address=w.addressFromScriptPublicKey(script,'testnet-10');
 try{const args={covenantId:'aa'.repeat(32),recipient:address.toString(),amount:'1000',feeSompi:'100000'};const r=transferRequest('testnet-10',args);assert.equal(r.recipient,'11'.repeat(32));assert.equal(r.amount,'1000');
  for(const amount of ['0','-1','1.5','1000000001','01'])assert.throws(()=>transferRequest('testnet-10',{...args,amount}));
  assert.throws(()=>transferRequest('mainnet',args),/TN10/);assert.throws(()=>transferRequest('testnet-10',{...args,feeSompi:'100000001'}));assert.throws(()=>transferRequest('testnet-10',{...args,hidden:'field'}));
 }finally{address.free();script.free();}
});
test('request pipeline connects candidate discovery, node verification and ordinary funding',async()=>{
 const {prepareTransferRequest}=require('../desktop/kcc20-request.cjs'),{encodeOrdinaryOutput}=require('../desktop/kcc20-codec.cjs');
 const {programHex}=require('./fixtures/kcc20-2433.json');
 const owner='11'.repeat(32),covenantId='aa'.repeat(32),program=encodeOrdinaryOutput(programHex,{owner,identifierType:3,amount:'1000'});
 const tokenScript=w.payToScriptHashScript(program),ownerScript=new w.ScriptPublicKey(0,'20'+owner+'ac'),address=w.addressFromScriptPublicKey(ownerScript,'testnet-10');
 try{
  const args={covenantId,recipient:address.toString(),amount:'900',feeSompi:'200000'};
  const cell={network:'testnet-10',covenantId,transactionId:'bb'.repeat(32),index:0,programHex:program};
  const entry=(id,script,amount,cov)=>({outpoint:{transactionId:id,index:0},covenantId:cov,amount,blockDaaScore:1n,isCoinbase:false,scriptPublicKey:{version:0,script:script.script}});
  const entries=[entry(cell.transactionId,tokenScript,50000000n,covenantId),entry('cc'.repeat(32),ownerScript,100000000n,null)];let calls=0,active=true;
  const service={network:'testnet-10',revision:0,withRpc:fn=>fn({getUtxosByAddresses:async()=>{calls++;return {entries};}},{networkId:'testnet-10',isSynced:true,hasUtxoIndex:true,virtualDaaScore:467579632n})};
  const source={cells:async(network,id,query)=>{assert.equal(network,'testnet-10');assert.equal(id,covenantId);assert.equal(query.owner,'03'+owner);return {cells:[cell]};}};
  const input={service,source,identity:{publicKey:owner},args,valid:()=>active};
  const result=await prepareTransferRequest(input);assert.equal(result.prepared.plan.changeAmount,'100');assert.equal(result.prepared.draft.readyToSign,false);assert.equal(calls,3);
  assert.ok(BigInt(result.prepared.draft.estimatedMass)>100000n);
  assert.equal(result.prepared.options.isToccataActive,true);
  await assert.rejects(prepareTransferRequest({...input,args:{...args,feeSompi:'100000'}}),/Fee below/);
  for(const feeSompi of ['',undefined]){
   const automatic=await prepareTransferRequest({...input,args:{...args,feeSompi}});
   assert.equal(automatic.prepared.options.feeSompi,automatic.prepared.draft.feeSompi);
   assert.ok(BigInt(automatic.prepared.draft.feeSompi)>=BigInt(automatic.prepared.draft.estimatedMass));
   assert.ok(BigInt(automatic.prepared.draft.feeSompi)<200000n);
  }
  source.cells=async()=>{active=false;return {cells:[cell]};};calls=0;await assert.rejects(prepareTransferRequest(input),/context changed/);assert.equal(calls,0);
 }finally{address.free();ownerScript.free();tokenScript.free();}
});
