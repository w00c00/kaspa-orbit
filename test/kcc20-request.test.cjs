const {test}=require('node:test'),assert=require('node:assert/strict'),w=require('@kluster/kaspa-wasm');
const {transferRequest}=require('../desktop/kcc20-request.cjs');
test('KCC20 request binds network, recipient script and exact atomic amount',()=>{
 const script=new w.ScriptPublicKey(0,'20'+'11'.repeat(32)+'ac'),address=w.addressFromScriptPublicKey(script,'testnet-10');
 try{const args={covenantId:'aa'.repeat(32),recipient:address.toString(),amount:'1000',feeSompi:'100000'};const r=transferRequest('testnet-10',args);assert.equal(r.recipient,'11'.repeat(32));assert.equal(r.amount,'1000');
  for(const amount of ['0','-1','1.5','1000000001','01'])assert.throws(()=>transferRequest('testnet-10',{...args,amount}));
  assert.throws(()=>transferRequest('mainnet',args),/TN10/);assert.throws(()=>transferRequest('testnet-10',{...args,feeSompi:'100000001'}));assert.throws(()=>transferRequest('testnet-10',{...args,hidden:'field'}));
 }finally{address.free();script.free();}
});
