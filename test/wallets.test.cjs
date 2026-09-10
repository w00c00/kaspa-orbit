const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Vault}=require('../desktop/vault.cjs'),{Wallets}=require('../desktop/wallets.cjs');
test('multiple independent wallets preserve legacy bytes, switch locked and persist names',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-wallets-')),password=crypto.randomBytes(24).toString('hex');let store;
 try{const legacy=new Vault(path.join(root,'vault.json'));await legacy.create(password);const address=legacy.accounts('testnet-10').kaspa.address;legacy.lock();const original=await fs.readFile(legacy.file);
 store=await new Wallets(root).init();assert.equal((await store.list()).length,1);
 const phrase=await store.add('Second',password);assert.equal(phrase.split(' ').length,24);assert.equal(store.vault.locked,true);const second=store.id;
 await store.vault.unlock(password);assert.notEqual(store.vault.accounts('testnet-10').kaspa.address,address);
 await store.select('legacy');assert.equal(store.vault.locked,true);await store.vault.unlock(password);assert.equal(store.vault.accounts('testnet-10').kaspa.address,address);
 await store.rename('Original');await store.select(second);const again=await new Wallets(root).init();assert.equal(again.id,second);assert.equal((await again.list()).find(w=>w.id==='legacy').name,'Original');assert.deepEqual(await fs.readFile(legacy.file),original);
 await assert.rejects(store.select('../vault'),/not found/);await assert.rejects(store.add('',password),/name/);
 const imported=await store.add('Imported',password,phrase);assert.equal(imported,null);assert.equal((await store.list()).length,3);
 }finally{store?.vault.lock();await fs.rm(root,{recursive:true,force:true});}
});
test('failed index writes preserve selected wallet and names while switching fails locked',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-wallet-write-')),password=crypto.randomBytes(24).toString('hex');let store;
 try{
  store=await new Wallets(root).init();await store.add('First',password);const first=store.id;
  await store.add('Second',password);const second=store.id,original=store.vault;
  await original.unlock(password);const disk=await fs.readFile(path.join(store.dir,'index.json'));
  const save=store.save;store.save=async()=>{throw Error('simulated disk failure');};
  await assert.rejects(store.rename('Not saved'),/disk failure/);
  assert.equal(store.names[second],'Second');assert.equal(store.vault.locked,false);
  await assert.rejects(store.select(first),/disk failure/);
  assert.equal(store.id,second);assert.equal(store.vault,original);assert.equal(store.vault.locked,true);
  assert.deepEqual(await fs.readFile(path.join(store.dir,'index.json')),disk);
  store.save=save;await store.select(first);await store.rename('Saved');
  const reloaded=await new Wallets(root).init();assert.equal(reloaded.id,first);assert.equal(reloaded.names[first],'Saved');
 }finally{store?.vault.lock();await fs.rm(root,{recursive:true,force:true});}
});
test('lock wins over pending unlock, including concurrent unlock calls',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-lock-')),password=crypto.randomBytes(24).toString('hex'),v=new Vault(path.join(root,'vault.json'));
 try{await v.create(password);v.lock();const pending=v.unlock(password);v.lock();await assert.rejects(pending);assert.equal(v.locked,true);
 const first=v.unlock(password),second=v.unlock(password);const results=await Promise.allSettled([first,second]);assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');assert.equal(v.locked,false);
 await assert.rejects(v.recovery(password+'wrong'));assert.equal(v.locked,false);
 assert.equal((await v.recovery(password)).split(' ').length,24);
 const recovery=v.recovery(password);v.lock();await assert.rejects(recovery);assert.equal(v.locked,true);
 }finally{v.lock();await fs.rm(root,{recursive:true,force:true});}
});
