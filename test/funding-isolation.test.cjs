const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const w=require('@kluster/kaspa-wasm');
const {KaspaService}=require('../desktop/kaspa.cjs');const {prepareKrc20}=require('../desktop/krc20.cjs');
test('KAS and KRC20 builders never select covenant-bound outputs as ordinary funding',async()=>{
 const key=new w.PrivateKey(crypto.randomBytes(32).toString('hex')),address=key.toAddress('testnet-10').toString(),pair=key.toKeypair(),publicKey=String(pair.xOnlyPublicKey),script=w.payToAddressScript(address);
 const ordinary={address,outpoint:{transactionId:'ab'.repeat(32),index:0},amount:500000000n,scriptPublicKey:script,blockDaaScore:1n,isCoinbase:false};
 const bound={...ordinary,outpoint:{transactionId:'cd'.repeat(32),index:0},amount:1000000000n,covenantId:'ef'.repeat(32)};
 let entries=[bound];const service=new KaspaService(()=>({connect:async()=>{},disconnect:async()=>{},getServerInfo:async()=>({networkId:'testnet-10',isSynced:true,hasUtxoIndex:true}),getUtxosByAddresses:async()=>({entries})}));service.network='testnet-10';
 const krc=()=>prepareKrc20({network:'testnet-10',address,publicKey,entries,transfer:{tick:'TEST',recipient:address,amount:'1',decimals:0}});
 try{
  await assert.rejects(service.prepare({address,recipient:address,amount:'1'}),/No spendable/);await assert.rejects(krc(),/No ordinary KAS/);
  entries=[bound,ordinary];const kas=await service.prepare({address,recipient:address,amount:'1'}),token=await krc();
  for(const json of [kas.unsigned,token.commit]){const tx=JSON.parse(json);assert.equal(tx.inputs.length,1);assert.equal(tx.inputs[0].transactionId,ordinary.outpoint.transactionId);}
 }finally{script.free();pair.free();key.free();}
});
