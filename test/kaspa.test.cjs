const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const wasm=require('@kluster/kaspa-wasm');
const {KaspaService,amountSompi,formatKas,addressFor}=require('../desktop/kaspa.cjs');const {Vault}=require('../desktop/vault.cjs');
test('Kaspa exact amounts reject rounding, negatives and wrong network',()=>{assert.equal(amountSompi('0.00000001'),1n);assert.equal(formatKas(100000001n),'1.00000001');for(const n of ['1e2','0','-1','0.000000001','01','1.'])assert.throws(()=>amountSompi(n));const key=new wasm.PrivateKey(crypto.randomBytes(32).toString('hex'));try{assert.throws(()=>addressFor(key.toAddress('mainnet').toString(),'testnet-10'));}finally{key.free();}});
test('Kaspa RPC rejects wrong network and always disconnects',async()=>{let closed=false;const s=new KaspaService(()=>({connect:async()=>{},getServerInfo:async()=>({networkId:'testnet-10',isSynced:true,hasUtxoIndex:true}),disconnect:async()=>{closed=true;}}));await assert.rejects(s.balance('kaspatest:invalid'));await assert.rejects(s.withRpc(()=>null),/network mismatch/);assert.ok(closed);});
test('Kaspa transfer builds and signs real WASM bytes; revoked request cannot submit',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-kaspa-'));let entries;
 try{const vault=new Vault(path.join(directory,'vault.json'));await vault.create(crypto.randomBytes(24).toString('hex'));const address=vault.kaspaIdentity().address;
 const destinationKey=new wasm.PrivateKey(crypto.randomBytes(32).toString('hex'));const recipient=destinationKey.toAddress('testnet-10').toString();destinationKey.free();
 entries=[{address,outpoint:{transactionId:crypto.randomBytes(32).toString('hex'),index:0},amount:200000000n,scriptPublicKey:wasm.payToAddressScript(address),blockDaaScore:100n,isCoinbase:false}];
 let submitted=0;const service=new KaspaService(()=>({connect:async()=>{},getServerInfo:async()=>({networkId:'testnet-10',isSynced:true,hasUtxoIndex:true}),getUtxosByAddresses:async()=>({entries}),submitTransaction:async({transaction})=>{submitted++;assert.ok(transaction.inputs[0].signatureScript.length>0);return {transactionId:transaction.id};},disconnect:async()=>{}}));
 service.network='testnet-10';const prepared=await service.prepare({address,recipient,amount:'1'});assert.ok(prepared.summary.includes(recipient));assert.equal(prepared.amount,'100000000');
 await assert.rejects(service.broadcast(prepared,vault,()=>false),/authorization changed/);assert.equal(submitted,0);
 const hash=await service.broadcast(prepared,vault,()=>true);assert.match(hash,/^[0-9a-f]{64}$/);assert.equal(submitted,1);
 }finally{for(const entry of entries||[])entry.scriptPublicKey.free();await fs.rm(directory,{recursive:true,force:true});}
});
