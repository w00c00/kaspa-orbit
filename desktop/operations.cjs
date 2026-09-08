const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const w=require('@kluster/kaspa-wasm');
class Krc20Operations{
 constructor(directory,kaspaService){this.directory=directory;this.kaspaService=kaspaService;}
 file(id){if(typeof id!=='string'||!/^[-0-9a-f]{36}$/.test(id))throw Error('Invalid operation ID');return path.join(this.directory,id+'.json');}
 async save(record){await fs.mkdir(this.directory,{recursive:true,mode:0o700});const file=this.file(record.id),temp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(record),{mode:0o600,flag:'wx'});await fs.rename(temp,file);}
 async create(prepared,signed){const record={id:crypto.randomUUID(),createdAt:new Date().toISOString(),state:'ready',prepared,signed};await this.save(record);return record;}
 async get(id){return JSON.parse(await fs.readFile(this.file(id),'utf8'));}
 async list(address,network){await fs.mkdir(this.directory,{recursive:true,mode:0o700});const records=[];for(const name of await fs.readdir(this.directory)){if(!name.endsWith('.json'))continue;const record=await this.get(name.slice(0,-5));if(record.prepared.address===address&&record.prepared.network===network)records.push({id:record.id,createdAt:record.createdAt,state:record.state,summary:record.prepared.summary,commitId:record.signed.commitId,revealId:record.signed.revealId});}return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 async run(id,valid){
  const record=await this.get(id),{prepared,signed}=record;
  if(prepared.network!==this.kaspaService.network||!valid())throw Error('Operation network or authorization changed');
  if(record.state==='revealed')return record;
  await this.kaspaService.withRpc(async rpc=>{
   const started=Date.now();
   const submit=async(json,expected)=>{if(!valid()||Date.now()-started>18000)throw Error('Authorization expired');const tx=w.Transaction.deserializeFromSafeJSON(json);try{tx.finalize();if(tx.id!==expected)throw Error('Saved transaction ID mismatch');const result=await rpc.submitTransaction({transaction:tx,allowOrphan:false});if(result.transactionId!==expected)throw Error('Unexpected submission ID');}finally{tx.free();}};
   if(record.state==='ready'){
    record.state='commit-unknown';await this.save(record);
    await submit(signed.commit,signed.commitId);
    record.state='committed';await this.save(record);
   }
   const {entries}=await rpc.getUtxosByAddresses({addresses:[prepared.escrow,prepared.address]});
   if(entries.some(entry=>String(entry.outpoint.transactionId)===signed.revealId)){record.state='revealed';await this.save(record);return;}
   const funding=entries.find(entry=>String(entry.outpoint.transactionId)===signed.commitId&&entry.outpoint.index===prepared.commitIndex);
   if(!funding)throw Error(`Waiting for commitment confirmation or reveal status / 等待提交确认或揭示状态。Commit: ${signed.commitId}; Reveal: ${signed.revealId}`);
   if(BigInt(funding.amount)!==BigInt(prepared.deposit))throw Error('Commitment amount mismatch');
   record.state='reveal-unknown';await this.save(record);
   await submit(signed.reveal,signed.revealId);
   record.state='reveal-broadcast';await this.save(record);
  },prepared.network);
  return record;
 }
}
module.exports={Krc20Operations};
