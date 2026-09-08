const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const w=require('@kluster/kaspa-wasm');
const {transferRequest,sendKrc20}=require('../desktop/krc20-provider.cjs');
const key=new w.PrivateKey(crypto.randomBytes(32).toString('hex'));const address=key.toAddress('testnet-10').toString();key.free();
const data={p:'KRC-20',op:'transfer',tick:'TEST',amt:'9007199254740993',to:address};
const params=(overrides={})=>[JSON.stringify({...data,...overrides}),4,address,0];
test('KRC20 dApp parser preserves atomic precision and rejects ambiguous identity/options',()=>{
 assert.equal(transferRequest(params(),'testnet-10').atomic,data.amt);
 for(const overrides of [{amt:12},{amt:'1.1'},{amt:'0'},{amt:'18446744073709551616'},{ca:'a'.repeat(64)},{op:'mint'},{extra:'ignored'},{to:'bad'}])assert.throws(()=>transferRequest(params(overrides),'testnet-10'));
 for(const args of [[params()[0],3],[params()[0],4,address,1],[params()[0],4,address,0,'extra']])assert.throws(()=>transferRequest(args,'testnet-10'));
 assert.throws(()=>transferRequest(params(),'mainnet'),/network/);
 assert.throws(()=>transferRequest([JSON.stringify(data),4,'different',0],'testnet-10'),/Destination/);
 assert.equal(transferRequest([JSON.stringify({...data,to:undefined}),4,address],'testnet-10').recipient,address);
});
function harness(){
 const counts={signed:0,saved:0,run:0};let active=true;
 const request={params:params(),identity:{address,publicKey:'public'},vault:{},valid:()=>active,
  service:{network:'testnet-10',revision:0,withRpc:async fn=>fn({getUtxosByAddresses:async()=>({entries:[{isCoinbase:true},{isCoinbase:false}]})})},
  holdings:async()=>({tokens:[{symbol:'TEST',contract:null,decimals:8,amount:data.amt}],next:''}),
  prepare:async input=>{assert.equal(input.entries.length,1);assert.equal(input.transfer.amount,'90071992.54740993');return {data:{...data,p:'krc-20'},summary:'exact prepared transfer'};},
  approve:async(_summary,check)=>assert.equal(check(),true),
  sign:()=>{counts.signed++;return {revealId:'hash'};},
  operations:{create:async()=>{counts.saved++;return {id:'saved-id'};},run:async(_id,check)=>{assert.equal(check(),true);assert.equal(counts.saved,1);counts.run++;}}
 };
 return {request,counts,revoke:()=>{active=false;}};
}
test('KRC20 dApp signs only reviewed data, persists before broadcast and retains recovery on failure',async()=>{
 const h=harness();assert.equal(await sendKrc20(h.request),'hash');assert.deepEqual(h.counts,{signed:1,saved:1,run:1});
 const failed=harness();failed.request.operations.run=async()=>{throw Error('RPC timeout');};await assert.rejects(sendKrc20(failed.request),/saved-id.*\nReveal: hash/);assert.equal(failed.counts.saved,1);
});
test('KRC20 dApp rejection, revocation, wrong amount and looping pagination never sign',async()=>{
 const rejected=harness();rejected.request.approve=async()=>{throw Error('Rejected');};await assert.rejects(sendKrc20(rejected.request),/Rejected/);assert.equal(rejected.counts.signed,0);
 const stale=harness();stale.request.approve=async()=>stale.revoke();await assert.rejects(sendKrc20(stale.request),/context changed/);assert.equal(stale.counts.signed,0);
 const changed=harness();changed.request.prepare=async()=>({data:{...data,amt:'1'},summary:'wrong'});await assert.rejects(sendKrc20(changed.request),/differs/);assert.equal(changed.counts.signed,0);
 const loop=harness();let calls=0;loop.request.holdings=async()=>{calls++;return {tokens:[],next:'repeat'};};await assert.rejects(sendKrc20(loop.request),/repeated/);assert.equal(calls,2);assert.equal(loop.counts.signed,0);
 const network=harness();network.request.holdings=async()=>{network.request.service.network='mainnet';return {tokens:[],next:''};};await assert.rejects(sendKrc20(network.request),/context changed/);assert.equal(network.counts.signed,0);
});
