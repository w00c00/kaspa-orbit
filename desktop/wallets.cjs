const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Vault}=require('./vault.cjs');
class Wallets{
 constructor(root){this.root=root;this.dir=path.join(root,'wallets');this.id='legacy';this.vault=new Vault(path.join(root,'vault.json'));this.names={};this.busy=false;}
 file(id){if(id==='legacy')return path.join(this.root,'vault.json');if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid wallet ID');return path.join(this.dir,id+'.json');}
 async init(){await fs.mkdir(this.dir,{recursive:true,mode:0o700});try{const m=JSON.parse(await fs.readFile(path.join(this.dir,'index.json'),'utf8'));this.names=m.names||{};if(m.active){const file=this.file(m.active);await fs.access(file);this.id=m.active;this.vault=new Vault(file);}}catch(e){if(e.code!=='ENOENT')throw e;}return this;}
 async list(){const ids=(await fs.readdir(this.dir)).filter(n=>/^[a-f0-9]{32}\.json$/.test(n)).map(n=>n.slice(0,-5));if(await new Vault(this.file('legacy')).exists())ids.unshift('legacy');return ids.map((id,i)=>({id,name:typeof this.names[id]==='string'?this.names[id]:(id==='legacy'?'原有钱包 / Original wallet':`Wallet ${i+1}`)}));}
 async save(state={active:this.id,names:this.names}){const temp=path.join(this.dir,crypto.randomBytes(16).toString('hex')+'.tmp');try{await fs.writeFile(temp,JSON.stringify(state),{mode:0o600,flag:'wx'});await fs.rename(temp,path.join(this.dir,'index.json'));}finally{await fs.rm(temp,{force:true});}}
 name(name){if(typeof name!=='string'||!name.trim()||name.trim().length>50)throw Error('Wallet name requires 1–50 characters / 钱包名称需 1–50 字');return name.trim();}
 async select(id){if(!(await this.list()).some(w=>w.id===id))throw Error('Wallet not found');this.vault.lock();const next=new Vault(this.file(id));await this.save({active:id,names:this.names});this.id=id;this.vault=next;}
 async add(name,password,phrase){
  name=this.name(name);const id=crypto.randomBytes(16).toString('hex'),next=new Vault(this.file(id));
  const recovery=await next.create(password,phrase);next.lock();this.vault.lock();
  const names={...this.names,[id]:name};
  try{await this.save({active:id,names});}
  catch{throw Error('Wallet file saved, but wallet index could not be saved. Current wallet unchanged. After fixing storage, select the new wallet from the list and back up with its password. / 钱包文件已保存，但索引保存失败，当前钱包未切换。修复存储问题后，从列表选择新钱包，用创建密码重新备份。');}
  this.id=id;this.vault=next;this.names=names;return recovery;
 }
 async rename(name){const names={...this.names,[this.id]:this.name(name)};await this.save({active:this.id,names});this.names=names;}
}
module.exports={Wallets};
