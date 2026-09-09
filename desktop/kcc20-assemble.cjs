const w=require('@kluster/kaspa-wasm');
const {inspectProgram,encodeAddressUnlock}=require('./kcc20-codec.cjs');
const {restoreBoundTransaction}=require('./covenant-transaction.cjs');
const uint=s=>typeof s==='string'&&/^(0|[1-9]\d*)$/.test(s)&&s.length<=20;
// Local assembly only; live input rechecks and wallet approval remain required.
function assembleAddressTransfer(plan,funding,{owner,feeSompi,carrierSompi='50000000',isToccataActive=false}){
 if(!/^[a-f0-9]{64}$/.test(owner)||!['mainnet','testnet-10'].includes(plan.network)||!Array.isArray(plan.inputs)||plan.inputs.length<1||plan.inputs.length>4||!Array.isArray(plan.outputs)||plan.outputs.length<1||plan.outputs.length>5)throw Error('Invalid token assembly layout');
 if(!uint(feeSompi)||!uint(carrierSompi)||BigInt(carrierSompi)<50000000n||BigInt(carrierSompi)>2100000000000000000n)throw Error('Invalid fee or token carrier');
 const ownerScript='000020'+owner+'ac',seen=new Set();let kasIn=0n,tokenIn=0n,tokenOut=0n;
 const outpoint=cell=>{if(!/^[a-f0-9]{64}$/.test(cell.transactionId)||!Number.isInteger(cell.index)||cell.index<0||cell.index>0xffffffff)throw Error('Invalid input outpoint');const id=cell.transactionId+':'+cell.index;if(seen.has(id))throw Error('Duplicate input');seen.add(id);};
 const value=cell=>{if(!uint(cell.valueSompi)||BigInt(cell.valueSompi)<=0n||BigInt(cell.valueSompi)>2100000000000000000n||!uint(cell.blockDaaScore))throw Error('Invalid input value or DAA score');kasIn+=BigInt(cell.valueSompi);};
 const tokenInputs=plan.inputs.map(cell=>{
  outpoint(cell);value(cell);const state=inspectProgram(cell.programHex);
  if(cell.covenantId!==plan.covenantId||state.owner!==owner||state.identifierType!==3||state.isMinter)throw Error('Token input identity mismatch');
  const script=w.payToScriptHashScript(cell.programHex);try{if(cell.scriptPublicKey!==script.version.toString(16).padStart(4,'0')+script.script)throw Error('Token input script mismatch');}finally{script.free();}
  tokenIn+=BigInt(state.amount);return cell;
 });
 outpoint(funding);value(funding);
 if(funding.covenantId!=null||funding.isCoinbase!==false||funding.scriptPublicKey!==ownerScript)throw Error('Ordinary owner P2PK funding required');
 const states=plan.outputs.map(output=>{
  const state=inspectProgram(output.programHex);
  if(output.covenantId!==plan.covenantId||state.isMinter||state.identifierType!==3||state.amount!==output.amount||state.owner!==output.owner)throw Error('Token output identity mismatch');
  tokenOut+=BigInt(state.amount);return {owner:state.owner,identifierType:3,amount:state.amount};
 });
 if(tokenIn!==tokenOut)throw Error('Token balances are not conserved');
 const change=kasIn-BigInt(carrierSompi)*BigInt(states.length)-BigInt(feeSompi);
 if(change<1000000n)throw Error('Insufficient ordinary KAS funding or change below policy minimum');
 const ownerInputIndex=tokenInputs.length;
 const inputs=[...tokenInputs,funding].map((cell,i)=>({transactionId:cell.transactionId,index:cell.index,sequence:'0',sigOpCount:0,computeBudget:400,
  signatureScript:i===ownerInputIndex?'':encodeAddressUnlock(cell.programHex,states,{tokenInputCount:tokenInputs.length,ownerInputIndex,totalInputCount:tokenInputs.length+1}),
  utxo:{address:null,amount:cell.valueSompi,scriptPublicKey:cell.scriptPublicKey,blockDaaScore:cell.blockDaaScore,isCoinbase:false,covenantId:i===ownerInputIndex?null:plan.covenantId}}));
 const outputs=plan.outputs.map(output=>{const script=w.payToScriptHashScript(output.programHex);try{return {value:carrierSompi,scriptPublicKey:script.version.toString(16).padStart(4,'0')+script.script,covenant:{authorizingInput:0,covenantId:plan.covenantId}};}finally{script.free();}});
 outputs.push({value:String(change),scriptPublicKey:ownerScript,covenant:null});
 const raw={id:'00'.repeat(32),version:1,inputs,outputs,subnetworkId:'00'.repeat(20),lockTime:'0',gas:'0',storageMass:'0',payload:''};
 // Size the exact Schnorr signature push without exposing a signing key.
 raw.inputs[ownerInputIndex].signatureScript='41'+'00'.repeat(65);
 const sized=restoreBoundTransaction(JSON.stringify(raw));let estimatedMass;
 try{if(!w.updateTransactionMass(plan.network,sized,1,isToccataActive===true))throw Error('Token transaction exceeds mass limit');estimatedMass=w.calculateTransactionMass(plan.network,sized,1);raw.storageMass=String(sized.storageMass);}finally{sized.free();}
 if(BigInt(feeSompi)<estimatedMass)throw Error('Fee below estimated transaction mass');
 raw.inputs[ownerInputIndex].signatureScript='';const unsigned=restoreBoundTransaction(JSON.stringify(raw));
 try{return Object.freeze({network:plan.network,transaction:unsigned.serializeToSafeJSON(),ownerInputIndex,feeSompi,changeSompi:String(change),estimatedMass:String(estimatedMass),requiresFinalLiveRecheck:true,readyToSign:false});}finally{unsigned.free();}
}
module.exports={assembleAddressTransfer};
