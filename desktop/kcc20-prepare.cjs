const w=require('@kluster/kaspa-wasm');
const {ordinaryFunding}=require('./utxo-identity.cjs');
const {assembleAddressTransfer}=require('./kcc20-assemble.cjs');
const {recheckCovenantInputs}=require('./covenant-preflight.cjs');
const {requireTn10Toccata}=require('./kcc20-network.cjs');
async function prepareAddressTransfer(service,sourcePlan,sourceOptions){
 const plan=structuredClone(sourcePlan),options=structuredClone(sourceOptions),revision=service.revision;
 const current=()=>{if(service.network!==plan.network||service.revision!==revision)throw Error('Network changed during token funding');};current();
 if(plan.network!=='testnet-10'||!/^[a-f0-9]{64}$/.test(options.owner))throw Error('TN10 owner required');
 const script=new w.ScriptPublicKey(0,'20'+options.owner+'ac');let address;
 try{
  address=w.addressFromScriptPublicKey(script,plan.network);if(!address)throw Error('Invalid owner address');
  const expectedScript='0000'+script.script;
  const candidates=await service.withRpc(async (rpc,info)=>{
   options.isToccataActive=requireTn10Toccata(info||await rpc.getServerInfo());current();
   const {entries}=await rpc.getUtxosByAddresses({addresses:[address.toString()]});current();
   if(!Array.isArray(entries)||entries.length>10000)throw Error('Too many funding candidates');
   return entries.filter(ordinaryFunding).map(entry=>{
    const spk=entry.scriptPublicKey;let hex;
    try{hex=spk.version.toString(16).padStart(4,'0')+spk.script.toLowerCase();}
    finally{if(entry instanceof w.UtxoEntryReference)spk.free();}
    if(hex!==expectedScript)return null;
    return {transactionId:String(entry.outpoint.transactionId).toLowerCase(),index:entry.outpoint.index,covenantId:null,valueSompi:String(entry.amount),blockDaaScore:String(entry.blockDaaScore),scriptPublicKey:hex,isCoinbase:false};
   }).filter(Boolean).sort((a,b)=>BigInt(a.valueSompi)<BigInt(b.valueSompi)?-1:BigInt(a.valueSompi)>BigInt(b.valueSompi)?1:0);
  },plan.network);current();
  let selected,draft,lastError;
  for(const funding of candidates){
   try{draft=assembleAddressTransfer(plan,funding,options);selected=funding;break;}
   catch(error){lastError=error;}
  }
  if(!selected)throw Error('No suitable ordinary owner funding input: '+(lastError?.message||'no eligible UTXO'));
  await recheckCovenantInputs(service,plan.network,draft.transaction);current();
  return Object.freeze({plan,options,funding:Object.freeze(selected),draft,revision,requiresApproval:true});
 }finally{address?.free();script.free();}
}
module.exports={prepareAddressTransfer};
