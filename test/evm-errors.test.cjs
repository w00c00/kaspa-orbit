const {test}=require('node:test'),assert=require('node:assert/strict');
const {EvmService}=require('../desktop/evm.cjs');
test('EVM RPC preserves revert data for dApp decoding',async()=>{
 for(const data of ['0xdeadbeef',{originalError:{data:'0x1234'}},null]){
  const service=new EvmService(async()=>({ok:true,json:async()=>({jsonrpc:'2.0',id:1,error:{code:3,message:'execution reverted',data}})}));
  await assert.rejects(service.rpc('eth_call',[]),error=>{assert.equal(error.code,3);assert.deepEqual(error.data,data);return true;});
 }
});
