const wasm=require('@kluster/kaspa-wasm');
// Serialization boundary only. This does not prove live UTXOs, authorization,
// token conservation or fees; callers must complete those checks separately.
function restoreBoundTransaction(json){
 if(typeof json!=='string'||json.length>2_000_000)throw Error('Invalid covenant transaction JSON');
 const expected=JSON.parse(json);
 if(expected.version!==1||!Array.isArray(expected.inputs)||!Array.isArray(expected.outputs))throw Error('Covenants require an explicit v1 transaction');
 for(const input of expected.inputs){
  if(!input.utxo||!Number.isInteger(input.computeBudget)||input.computeBudget<0||input.computeBudget>65535)throw Error('Missing UTXO or compute budget');
  if(input.utxo.covenantId!=null&&!/^[a-f0-9]{64}$/.test(input.utxo.covenantId))throw Error('Invalid input Covenant ID');
 }
 for(const output of expected.outputs){
  const cov=output.covenant;if(cov!=null&&(!/^[a-f0-9]{64}$/.test(cov.covenantId)||!Number.isInteger(cov.authorizingInput)||cov.authorizingInput<0||cov.authorizingInput>=expected.inputs.length))throw Error('Invalid output covenant binding');
 }
 const tx=wasm.Transaction.deserializeFromSafeJSON(json);
 try{
  const actual=JSON.parse(tx.serializeToSafeJSON());
  if(actual.inputs.length!==expected.inputs.length||actual.outputs.length!==expected.outputs.length)throw Error('Transaction shape changed during decoding');
  expected.inputs.forEach((input,i)=>{
   if((actual.inputs[i].utxo.covenantId??null)!==(input.utxo.covenantId??null)||actual.inputs[i].computeBudget!==input.computeBudget)throw Error('Input covenant identity or budget lost during decoding');
  });
  expected.outputs.forEach((output,i)=>{
   const a=actual.outputs[i].covenant,b=output.covenant;
   if((a?.covenantId??null)!==(b?.covenantId??null)||(a?.authorizingInput??null)!==(b?.authorizingInput??null))throw Error('Output covenant binding lost during decoding');
  });
  const hash=tx.finalize();hash.free();return tx;
 }catch(error){tx.free();throw error;}
}
module.exports={restoreBoundTransaction};
