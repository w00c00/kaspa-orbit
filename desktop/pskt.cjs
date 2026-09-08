const {covenantIdentity}=require('./utxo-identity.cjs');
const wasm=require('@kluster/kaspa-wasm');
const {formatKas}=require('./kaspa.cjs');
function assertPreserved(source,normalized,path='transaction'){
 if(source===null||typeof source!=='object'){if(source!==normalized)throw Error(`Unsupported or noncanonical Safe-JSON value: ${path}`);return;}
 if(!normalized||typeof normalized!=='object'||Array.isArray(source)!==Array.isArray(normalized))throw Error(`Unsupported Safe-JSON structure: ${path}`);
 if(Array.isArray(source)&&source.length!==normalized.length)throw Error(`Safe-JSON array length changed: ${path}`);
 for(const key of Object.keys(source)){if(!Object.hasOwn(normalized,key))throw Error(`Unsupported Safe-JSON field: ${path}.${key}`);assertPreserved(source[key],normalized[key],`${path}.${key}`);}
}
function inspectPskt(request,address){
 if(!request||typeof request.txJsonString!=='string'||request.txJsonString.length>1000000)throw Error('Invalid or oversized Safe-JSON transaction');
 const signInputs=request.options?.signInputs;
 for(const name of Object.keys(request.options||{}))if(name!=='signInputs')throw Error(`Unsupported signing option: ${name}`);
 if(!Array.isArray(signInputs)||!signInputs.length||signInputs.length>256)throw Error('Explicit signInputs required');
 const source=JSON.parse(request.txJsonString);
 const legacyMass=Object.hasOwn(source,'mass');
 if(legacyMass&&Object.hasOwn(source,'storageMass'))throw Error('Duplicate mass aliases are not supported');
 if(legacyMass&&source.mass!=='0')throw Error('Only legacy zero mass placeholder is supported');
 const canonicalSource={...source};delete canonicalSource.mass;
 const tx=wasm.Transaction.deserializeFromSafeJSON(JSON.stringify(canonicalSource));
 try{
  assertPreserved(canonicalSource,JSON.parse(tx.serializeToSafeJSON()));
  const script=wasm.payToAddressScript(address),inputs=tx.inputs,indices=new Set();
  try{for(const item of signInputs){if(!item||typeof item!=='object'||Object.keys(item).some(k=>!['index','sighashType'].includes(k)))throw Error('Unsupported signing input option');if(!Number.isSafeInteger(item.index)||item.index<0||item.index>=inputs.length||indices.has(item.index))throw Error('Invalid or duplicate signing index');if(item.sighashType!==1)throw Error('Only SIGHASH_ALL (1) is supported');const input=inputs[item.index];if(!input.utxo||input.utxo.scriptPublicKey.script!==script.script||input.utxo.scriptPublicKey.version!==script.version)throw Error('Requested input is not owned by this wallet');if(input.utxo.covenantId||input.utxo.isCoinbase)throw Error('Selected funding input must be ordinary non-coinbase P2PK');if(input.signatureScript)throw Error('Refusing to replace an existing signature');indices.add(item.index);}
   const own=inputs.filter(input=>input.utxo?.scriptPublicKey.script===script.script&&input.utxo.scriptPublicKey.version===script.version);
   const ownedAmount=own.reduce((n,input)=>n+BigInt(input.utxo.amount),0n);
   const returned=tx.outputs.filter(output=>output.scriptPublicKey.script===script.script&&output.scriptPublicKey.version===script.version&&!output.covenant).reduce((n,output)=>n+BigInt(output.value),0n);
   const unsigned=tx.serializeToSafeJSON();
   return Object.freeze({unsigned,sourceJson:request.txJsonString,legacyMass,signInputs:Object.freeze(signInputs.map(i=>Object.freeze({...i}))),address,summary:`Sign selected Kaspa inputs / 签署指定输入\nAccount / 账户: ${address}\nInputs / 输入: ${[...indices].join(', ')}\nWallet inputs / 钱包输入总额: ${formatKas(ownedAmount)} KAS\nOrdinary wallet change / 普通钱包找零: ${formatKas(returned)} KAS\nNet KAS outflow / KAS 净支出: ${formatKas(ownedAmount>returned?ownedAmount-returned:0n)} KAS\nContract/token effects require review in the dApp / 合约与代币变更请核对 dApp\nOutputs / 输出:\n${tx.outputs.map((o,i)=>`${i}: ${formatKas(o.value)} KAS · ${o.scriptPublicKey.script}`).join('\n')}`});
  }finally{script.free();}
 }finally{tx.free();}
}
async function verifyOwnedInputs(prepared,kaspaService){
 return kaspaService.withRpc(async rpc=>{
  const {entries}=await rpc.getUtxosByAddresses({addresses:[prepared.address]});
  const tx=wasm.Transaction.deserializeFromSafeJSON(prepared.unsigned);
  const script=wasm.payToAddressScript(prepared.address);
  try{for(const input of tx.inputs.filter(i=>i.utxo?.scriptPublicKey.script===script.script)){const live=entries.find(entry=>entry.outpoint.transactionId.toString()===input.previousOutpoint.transactionId.toString()&&entry.outpoint.index===input.previousOutpoint.index);if(!live||BigInt(live.amount)!==BigInt(input.utxo.amount)||live.scriptPublicKey.script!==input.utxo.scriptPublicKey.script||live.scriptPublicKey.version!==input.utxo.scriptPublicKey.version||covenantIdentity(live)!==covenantIdentity(input.utxo)||Boolean(live.isCoinbase)!==Boolean(input.utxo.isCoinbase))throw Error('Signing input differs from live wallet UTXO');}}
  finally{script.free();tx.free();}
 });
}
function signSelected(prepared,key){
 const tx=wasm.Transaction.deserializeFromSafeJSON(prepared.unsigned);
 try{const inputs=tx.inputs;for(const {index,sighashType} of prepared.signInputs)inputs[index].signatureScript=wasm.createInputSignature(tx,index,key,sighashType);tx.inputs=inputs;tx.finalize();const normalized=JSON.parse(tx.serializeToSafeJSON()),result=JSON.parse(prepared.sourceJson);result.id=normalized.id;for(const {index} of prepared.signInputs)result.inputs[index].signatureScript=normalized.inputs[index].signatureScript;return JSON.stringify(result);}finally{tx.free();}
}
module.exports={inspectPskt,verifyOwnedInputs,signSelected};
