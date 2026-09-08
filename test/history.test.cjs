const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const {History}=require('../desktop/history.cjs');
test('history survives restart, isolates networks/accounts, and persists no signing payload',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-history-'));try{const history=new History(dir),record={family:'kaspa',network:'mainnet',hash:crypto.randomBytes(32).toString('hex'),address:'public-address',signed:'must-not-save'};
 history.before(record);const restart=new History(dir);assert.equal(restart.list('mainnet',record.address)[0].state,'broadcast-unknown');assert.equal(restart.list('testnet-10',record.address).length,0);assert.equal(restart.list('mainnet','other').length,0);
 assert.ok(!fs.readFileSync(history.file(record.network,record.hash),'utf8').includes('must-not-save'));assert.throws(()=>restart.before(record),/already recorded/);
 restart.after(record);assert.equal(new History(dir).list('mainnet',record.address)[0].state,'broadcast');assert.throws(()=>history.file('../escape',record.hash));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
