const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {overrides}=require('./rpc-config.cjs');
const defaults=Object.freeze({kaspaNetwork:'mainnet',evmNetwork:'igra'});
function sanitize(value={}){return {
 kaspaNetwork:['mainnet','testnet-10'].includes(value?.kaspaNetwork)?value.kaspaNetwork:defaults.kaspaNetwork,
 evmNetwork:['igra','igra-testnet','kasplex'].includes(value?.evmNetwork)?value.evmNetwork:defaults.evmNetwork,
 ...(value?.rpcOverrides?{rpcOverrides:overrides(value.rpcOverrides)}:{})
};}
class Settings {
 constructor(file){this.file=file;try{this.value=sanitize(JSON.parse(fs.readFileSync(file,'utf8')));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;this.value={...defaults};}}
 update(patch){const next=sanitize({...this.value,...patch}),temp=this.file+'.'+randomUUID()+'.tmp';fs.mkdirSync(path.dirname(this.file),{recursive:true});try{fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600,flag:'wx'});fs.renameSync(temp,this.file);this.value=next;}finally{fs.rmSync(temp,{force:true});}return {...next};}
}
module.exports={Settings};
