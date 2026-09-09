const {assembleAddressTransfer}=require('./kcc20-assemble.cjs');
const {recheckCovenantInputs}=require('./covenant-preflight.cjs');
const {signAddressTransfer}=require('./kcc20-sign.cjs');
// Backend orchestration only: approve must reject on cancellation. No IPC
// exposure or broadcast until durable recovery and submission are implemented.
async function authorizeAddressTransfer({service,prepared,vault,valid,approve}){
 const snapshot=structuredClone(prepared),{plan,funding,options,draft,revision}=snapshot;
 const check=()=>{if(!valid()||vault.locked||service.network!==plan.network||service.revision!==revision)throw Error('Wallet or network changed before token signing');};
 check();if(plan.network!=='testnet-10')throw Error('Experimental signing requires TN10');
 const canonical=assembleAddressTransfer(plan,funding,options);
 if(canonical.transaction!==draft.transaction)throw Error('Token draft mismatch');
 const tx=JSON.parse(draft.transaction);
 const summary=JSON.stringify({network:plan.network,covenantId:plan.covenantId,
  tokenOutputs:plan.outputs.map(output=>({owner:output.owner,atomicAmount:output.amount})),
  carrierSompi:tx.outputs.slice(0,-1).map(output=>output.value),feeSompi:canonical.feeSompi,kasChangeSompi:canonical.changeSompi});
 await approve(summary,()=>{try{check();return true;}catch{return false;}});check();
 await recheckCovenantInputs(service,plan.network,draft.transaction);check();
 return vault.withKaspaKey(key=>signAddressTransfer(plan,funding,options,draft.transaction,key));
}
module.exports={authorizeAddressTransfer};
