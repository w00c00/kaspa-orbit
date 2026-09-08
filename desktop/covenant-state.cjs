const wasm=require('@kluster/kaspa-wasm');
const {covenantIdentity}=require('./utxo-identity.cjs');
function hash(value,label){if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value))throw Error(`Invalid ${label}`);return value.toLowerCase();}
// The indexer may supply candidates, but only the selected node supplies the
// live outpoint, script commitment and covenant identity used by a builder.
async function verifyCovenantCell(service,input){
 const network=service.network,revision=service.revision;
 const covenantId=hash(input.covenantId,'Covenant ID'),transactionId=hash(input.transactionId,'transaction ID');
 if(!Number.isSafeInteger(input.index)||input.index<0||input.index>0xffffffff)throw Error('Invalid output index');
 if(typeof input.programHex!=='string'||! /^(?:[a-f0-9]{2}){1,100000}$/i.test(input.programHex))throw Error('Invalid redeem program');
 const programHex=input.programHex.toLowerCase();const script=wasm.payToScriptHashScript(programHex);let address;
 try{
  address=wasm.addressFromScriptPublicKey(script,network);if(!address)throw Error('Cannot derive covenant address');
  const scriptHex=script.script,version=script.version,addressText=address.toString();
  return await service.withRpc(async rpc=>{
   const {entries}=await rpc.getUtxosByAddresses({addresses:[addressText]});
   if(service.network!==network||service.revision!==revision)throw Error('Network changed during covenant lookup');
   const entry=entries.find(e=>String(e.outpoint.transactionId).toLowerCase()===transactionId&&e.outpoint.index===input.index);
   if(!entry)throw Error('Covenant output not live at this address / 未找到未花费的契约输出');
   if(covenantIdentity(entry)!==covenantId)throw Error('Covenant ID mismatch: matching script is not token identity');
   if(entry.scriptPublicKey.version!==version||entry.scriptPublicKey.script.toLowerCase()!==scriptHex.toLowerCase())throw Error('Redeem program does not match live script commitment');
   if(entry.isCoinbase||BigInt(entry.amount)<=0n)throw Error('Invalid covenant cell value or coinbase');
   return {network,covenantId,transactionId,index:input.index,programHex,address:addressText,valueSompi:String(entry.amount),scriptPublicKey:version.toString(16).padStart(4,'0')+scriptHex,blockDaaScore:String(entry.blockDaaScore),liveBindingVerified:true,contractSemanticsVerified:false};
  },network);
 }finally{address?.free();script.free();}
}
module.exports={verifyCovenantCell};
