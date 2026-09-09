const w=require('@kluster/kaspa-wasm');
const {restoreBoundTransaction}=require('./covenant-transaction.cjs');
const {covenantIdentity}=require('./utxo-identity.cjs');
// Recheck the exact reviewed bytes, not mutable plan objects. This is a node
// observation, not a reservation or a consensus/script-engine validation.
async function recheckCovenantInputs(service,network,transaction,validateNode){
 const revision=service.revision;
 const current=()=>{if(service.network!==network||service.revision!==revision)throw Error('Network changed during input preflight');};
 current();
 if(!['mainnet','testnet-10'].includes(network))throw Error('Unsupported covenant network');
 const decoded=restoreBoundTransaction(transaction);decoded.free();
 const raw=JSON.parse(transaction);
 if(raw.inputs.length<1||raw.inputs.length>5)throw Error('Unsupported covenant input count');
 const seen=new Set(),addresses=new Set();
 for(const input of raw.inputs){
  const key=input.transactionId+':'+input.index;
  if(seen.has(key))throw Error('Duplicate covenant input');seen.add(key);
  const hex=input.utxo.scriptPublicKey;
  if(typeof hex!=='string'||!/^[a-f0-9]{4}(?:[a-f0-9]{2})+$/.test(hex))throw Error('Invalid input script');
  const script=new w.ScriptPublicKey(parseInt(hex.slice(0,4),16),hex.slice(4));let address;
  try{address=w.addressFromScriptPublicKey(script,network);if(!address)throw Error('Unsupported input address');addresses.add(address.toString());}
  finally{address?.free();script.free();}
 }
 await service.withRpc(async (rpc,info)=>{
  if(validateNode){validateNode(info||await rpc.getServerInfo());current();}
  const {entries}=await rpc.getUtxosByAddresses({addresses:[...addresses]});current();
  for(const input of raw.inputs){
   const matches=entries.filter(e=>String(e.outpoint.transactionId).toLowerCase()===input.transactionId&&e.outpoint.index===input.index);
   if(matches.length!==1)throw Error('Input is spent, missing or ambiguous');
   const live=matches[0],expected=input.utxo;
   const script=live.scriptPublicKey;let hex;
   try{hex=script.version.toString(16).padStart(4,'0')+script.script.toLowerCase();}
   finally{if(live instanceof w.UtxoEntryReference)script.free();}
   if(covenantIdentity(live)!==(expected.covenantId??'')||hex!==expected.scriptPublicKey||String(live.amount)!==expected.amount||String(live.blockDaaScore)!==expected.blockDaaScore||live.isCoinbase!==expected.isCoinbase)throw Error('Live input differs from reviewed transaction');
  }
 },network);
 current();
 return Object.freeze({network,revision,transaction,inputCount:raw.inputs.length,liveInputsVerified:true,consensusVerified:false});
}
module.exports={recheckCovenantInputs};
