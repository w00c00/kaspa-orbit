const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const w=require('@kluster/kaspa-wasm');
const {transferRequest,sendKaspa}=require('../desktop/kaspa-provider.cjs');
function address(network='testnet-10'){const key=new w.PrivateKey(crypto.randomBytes(32).toString('hex'));try{return key.toAddress(network).toString();}finally{key.free();}}
test('dApp KAS amounts are sompi, exact and network checked',()=>{
 const to=address();assert.deepEqual(transferRequest([to,1],'testnet-10'),{recipient:to,amount:'0.00000001'});
 assert.equal(transferRequest([to,'9007199254740993',{}],'testnet-10').amount,'90071992.54740993');
 for(const amount of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'01','1e8','0.1','2870000000000000001'])assert.throws(()=>transferRequest([to,amount],'testnet-10'));
 assert.throws(()=>transferRequest([to,1,{feeRate:1}],'testnet-10'),e=>e.code===4200);
 assert.throws(()=>transferRequest([to,1],'mainnet'),/network mismatch/);
});
test('dApp send reviews prepared immutable amount and never broadcasts after rejection or context change',async()=>{
 const to=address(),params=[to,100000001,{}];let allowed=true,submitted=0,reviewed;
 const service={network:'testnet-10',prepare:async input=>{assert.equal(input.amount,'1.00000001');params[1]=1;return {...input,summary:'exact reviewed transaction'};},broadcast:async(prepared,_vault,valid)=>{assert.ok(valid());assert.equal(prepared.amount,'1.00000001');submitted++;return 'test-hash';}};
 const request={params,service,address:to,vault:{},valid:()=>allowed,approve:async summary=>{reviewed=summary;}};
 assert.equal(await sendKaspa(request),'test-hash');assert.equal(reviewed,'exact reviewed transaction');assert.equal(submitted,1);
 params[1]=100000001;await assert.rejects(sendKaspa({...request,approve:async()=>{throw Object.assign(Error('Rejected'),{code:4001});}}),e=>e.code===4001);
 params[1]=100000001;await assert.rejects(sendKaspa({...request,approve:async()=>{allowed=false;}}),/context changed/);assert.equal(submitted,1);
 allowed=true;params[1]=100000001;await assert.rejects(sendKaspa({...request,approve:async()=>{service.network='mainnet';}}),/context changed/);assert.equal(submitted,1);
});
