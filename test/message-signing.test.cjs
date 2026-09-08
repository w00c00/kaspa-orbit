const {test}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const wasm=require('@kluster/kaspa-wasm');const {Vault}=require('../desktop/vault.cjs');
test('KIP-5 Schnorr hex verifies and deterministic option reaches the signing engine',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-message-'));const v=new Vault(path.join(dir,'vault.json'));
 try{
  await v.create(crypto.randomBytes(24).toString('hex'));
  const message='Nexus test login / 签名测试';const options={type:'schnorr',noAuxRand:true};
  const signature=v.signKaspaMessage(message,options);
  assert.match(signature,/^[0-9a-f]{128}$/i);assert.equal(v.signKaspaMessage(message,options),signature);
  const publicKey=v.kaspaIdentity('mainnet').publicKey;
  assert.equal(wasm.verifyMessage({message,signature,publicKey}),true);
  assert.equal(wasm.verifyMessage({message:message+'changed',signature,publicKey}),false);
  assert.equal(wasm.verifyMessage({message,signature:v.signKaspaMessage(message),publicKey}),true);
  assert.throws(()=>v.signKaspaMessage(message,{type:'ecdsa'}),e=>e.code===4200);
  assert.throws(()=>v.signKaspaMessage(message,{noAuxRand:1}),e=>e.code===-32602);
  v.lock();assert.throws(()=>v.signKaspaMessage(message),/locked/);
 }finally{v.lock();await fs.rm(dir,{recursive:true,force:true});}
});
