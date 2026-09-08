const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const networks=new Set(['mainnet','testnet-10','igra','igra-testnet','kasplex']);
class History {
 constructor(directory){this.directory=directory;}
 file(network,hash){if(!networks.has(network)||typeof hash!=='string'||!/^(0x)?[0-9a-f]{64}$/i.test(hash))throw Error('Invalid transaction identity');return path.join(this.directory,`${network}-${hash.toLowerCase()}.json`);}
 save(record){const file=this.file(record.network,record.hash),tmp=file+'.'+randomUUID()+'.tmp';fs.mkdirSync(this.directory,{recursive:true});try{fs.writeFileSync(tmp,JSON.stringify(record),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}}
 before(record){
  const {family,network,hash,address}=record;
  if(!['kaspa','evm'].includes(family)||typeof address!=='string'||address.length>150)throw Error('Invalid transaction record');
  const file=this.file(network,hash);if(fs.existsSync(file))throw Error(`Transaction already recorded; check ${hash} before retrying`);
  if(record.anchor!==undefined&&(family!=='kaspa'||typeof record.anchor!=='string'||!/^[0-9a-f]{64}$/i.test(record.anchor)))throw Error('Invalid transaction checkpoint');
  this.save({family,network,hash,address,...(record.anchor?{anchor:record.anchor}:{}),state:'broadcast-unknown',createdAt:new Date().toISOString()});
 }
 after(record){const file=this.file(record.network,record.hash),saved=JSON.parse(fs.readFileSync(file,'utf8'));this.save({...saved,state:'broadcast',updatedAt:new Date().toISOString()});}
 get(network,hash,address){const record=JSON.parse(fs.readFileSync(this.file(network,hash),'utf8'));if(record.network!==network||record.hash.toLowerCase()!==hash.toLowerCase()||record.address!==address)throw Error('Transaction record not owned by this account');return record;}
 observation(record,result){const saved=this.get(record.network,record.hash,record.address);this.save({...saved,observation:result});}
 list(network,address){if(!networks.has(network))throw Error('Invalid history network');let files;try{files=fs.readdirSync(this.directory);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  return files.filter(f=>f.startsWith(network+'-')&&f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(this.directory,f),'utf8'))).filter(r=>r.network===network&&r.address===address).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 }
}
module.exports={History};
