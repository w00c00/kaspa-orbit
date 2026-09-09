const {test}=require('node:test'),assert=require('node:assert/strict');
const {EvmService}=require('../desktop/evm.cjs');
test('EVM RPC preserves revert data for dApp decoding',async()=>{
 for(const data of ['0xdeadbeef',{originalError:{data:'0x1234'}},null]){
  const service=new EvmService(async()=>Response.json({jsonrpc:'2.0',id:1,error:{code:3,message:'execution reverted',data}}));
  await assert.rejects(service.rpc('eth_call',[]),error=>{assert.equal(error.code,3);assert.deepEqual(error.data,data);return true;});
 }
});
test('EVM RPC rejects malformed envelopes and oversized bodies before parsing',async()=>{
 for(const body of [null,[],{result:'0x1'},{jsonrpc:'2.0',id:2,result:'0x1'},{jsonrpc:'2.0',id:1,result:null,error:{code:3,message:'bad'}},{jsonrpc:'2.0',id:1,error:null}]){
  const service=new EvmService(async()=>Response.json(body));
  await assert.rejects(service.rpc('eth_chainId'),/Malformed RPC/);
 }
 let cancelled=false;
 const service=new EvmService(async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':'20000001'}}));
 await assert.rejects(service.rpc('eth_chainId'),/too large/);assert.equal(cancelled,true);
});
