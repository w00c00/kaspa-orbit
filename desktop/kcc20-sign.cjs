const w=require('@kluster/kaspa-wasm');
const {assembleAddressTransfer}=require('./kcc20-assemble.cjs');
const {restoreBoundTransaction}=require('./covenant-transaction.cjs');
// Caller owns the key and must obtain approval and recheck live inputs. This
// pure signer neither accesses the vault nor broadcasts. Bind to the exact
// bytes reviewed by the caller so mutable plan objects cannot change payment.
function signAddressTransfer(plan,funding,options,reviewedTransaction,key){
 if(plan.network!=='testnet-10')throw Error('Experimental KCC20 signing requires TN10');
 const publicKey=key.toPublicKey(),xonly=publicKey.toXOnlyPublicKey();
 try{if(xonly.toString()!==options.owner)throw Error('KCC20 owner signing key mismatch');}
 finally{xonly.free();publicKey.free();}
 const draft=assembleAddressTransfer(plan,funding,options);
 if(typeof reviewedTransaction!=='string'||draft.transaction!==reviewedTransaction)throw Error('KCC20 transaction changed since review');
 const tx=restoreBoundTransaction(reviewedTransaction);
 try{
  const signature=w.createInputSignature(tx,draft.ownerInputIndex,key,w.SighashType.All);
  if(!/^41[a-f0-9]{128}01$/.test(signature))throw Error('Unexpected KCC20 SIGHASH_ALL signature encoding');
  const inputs=tx.inputs;
  try{inputs[draft.ownerInputIndex].signatureScript=signature;tx.inputs=inputs;}
  finally{inputs.forEach(input=>input.free());}
  tx.finalize().free();
  if(!w.updateTransactionMass(plan.network,tx,1))throw Error('Signed token transaction exceeds mass limit');
  const mass=w.calculateTransactionMass(plan.network,tx,1);
  if(mass>BigInt(options.feeSompi))throw Error('Signed token transaction fee too low');
  const transaction=tx.serializeToSafeJSON(),after=JSON.parse(transaction),before=JSON.parse(reviewedTransaction);
  const normalized=structuredClone(after);normalized.inputs[draft.ownerInputIndex].signatureScript='';
  normalized.id=before.id;
  if(JSON.stringify(normalized)!==JSON.stringify(before))throw Error('Signing changed reviewed transaction fields');
  return Object.freeze({network:plan.network,transaction,transactionId:after.id,mass:String(mass),requiresFinalLiveRecheck:true,consensusVerified:false});
 }finally{tx.free();}
}
module.exports={signAddressTransfer};
