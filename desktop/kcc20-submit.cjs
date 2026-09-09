const {restoreBoundTransaction}=require('./covenant-transaction.cjs');
const {recheckCovenantInputs}=require('./covenant-preflight.cjs');
const {requireTn10Toccata}=require('./kcc20-network.cjs');
const w=require('@kluster/kaspa-wasm');
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Node request timed out')),ms);})]);}finally{clearTimeout(timer);}}
// Internal TN10 submission boundary. The caller must supply the signed result
// from the approval pipeline and an account-bound validity callback.
async function submitAddressTransfer({service,signed,address,valid}){
 const {network,transaction,transactionId}=signed,revision=service.revision;
 const check=()=>{if(network!=='testnet-10'||service.network!==network||service.revision!==revision||!valid())throw Error('Token submission context changed');};
 check();if(!service.history)throw Error('Durable transaction history required');
 const raw=JSON.parse(transaction),funding=raw.inputs?.at(-1)?.utxo;
 if(!funding||funding.covenantId!=null||!/^000020[a-f0-9]{64}ac$/.test(funding.scriptPublicKey))throw Error('Owner funding input missing');
 const ownerScript=new w.ScriptPublicKey(0,funding.scriptPublicKey.slice(4));let ownerAddress;
 try{ownerAddress=w.addressFromScriptPublicKey(ownerScript,network);if(ownerAddress?.toString()!==address)throw Error('Token history account mismatch');}
 finally{ownerAddress?.free();ownerScript.free();}
 await recheckCovenantInputs(service,network,transaction);check();
 return service.withRpc(async (rpc,info)=>{
  requireTn10Toccata(info||await rpc.getServerInfo());check();
  const {sink:anchor}=await bounded(rpc.getSink(),5000);check();
  const tx=restoreBoundTransaction(transaction);
  try{
   if(tx.id!==transactionId)throw Error('Signed token transaction ID mismatch');
   const record={family:'kaspa',network,hash:transactionId,address,anchor};
   service.history.before(record);check();
   let result;
   try{result=await bounded(rpc.submitTransaction({transaction:tx,allowOrphan:false}),18000);}
   catch(error){throw Error(`Token broadcast status unknown; check ${transactionId} before retrying: ${error.message}`);}
   if(result.transactionId!==transactionId)throw Error(`Unexpected node result; check ${transactionId} before retrying`);
   service.history.after(record);return {transactionId,state:'broadcast'};
  }finally{tx.free();}
 },network,30000);
}
module.exports={submitAddressTransfer};
