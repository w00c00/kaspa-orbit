const {test}=require('node:test'),assert=require('node:assert/strict');
const {EvmService}=require('../desktop/evm.cjs');
test('EVM read transport preserves named parameters without conversion',async()=>{
 const params={transaction:{to:'0x0000000000000000000000000000000000000001'},block:'latest'};let observed;
 const service=new EvmService(async(_url,options)=>{const request=JSON.parse(options.body);if(request.method==='eth_chainId')return Response.json({jsonrpc:'2.0',id:1,result:'0x97b1'});observed=request.params;return Response.json({jsonrpc:'2.0',id:1,result:'0x'});});
 assert.equal(await service.read('eth_call',params),'0x');assert.deepEqual(observed,params);
});
test('EVM reads reject late results after network changes at either await boundary',async()=>{
 for(const phase of ['verify','read']){
  const service=new EvmService();let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});let reads=0;
  service.verify=async()=>{if(phase==='verify'){started();await pending;}};
  service.rpc=async()=>{reads++;if(phase==='read'){started();await pending;}return 'old-chain-result';};
  const result=service.read('eth_blockNumber');await ready;service.revision++;release();
  await assert.rejects(result,/Network changed/);assert.equal(reads,phase==='verify'?0:1);
 }
});
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
