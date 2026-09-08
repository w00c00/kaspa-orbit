const w=require('@kluster/kaspa-wasm');
const {parseUnits}=require('ethers');
const {addressFor,formatKas}=require('./kaspa.cjs');
function transferData({tick,ca,recipient,amount,decimals},network){
 addressFor(recipient,network);
 if(!Number.isInteger(decimals)||decimals<0||decimals>18||typeof amount!=='string'||amount.length>100||!/^(0|[1-9]\d*)(\.\d+)?$/.test(amount))throw Error('Invalid KRC20 amount');
 const atomic=parseUnits(amount,decimals);if(atomic<=0n||atomic>18446744073709551615n)throw Error('KRC20 amount out of range');
 if(ca){if(typeof ca!=='string'||!/^[0-9a-f]{64}$/i.test(ca))throw Error('Invalid KRC20 contract ID');return {p:'krc-20',op:'transfer',ca:ca.toLowerCase(),amt:atomic.toString(),to:recipient};}
 if(typeof tick!=='string'||!/^[a-zA-Z]{4,6}$/.test(tick))throw Error('Invalid KRC20 ticker');
 return {p:'krc-20',op:'transfer',tick:tick.toUpperCase(),amt:atomic.toString(),to:recipient};
}
function inscription(publicKey,data){
 if(typeof publicKey!=='string'||!/^[a-f0-9]{64}$/i.test(publicKey))throw Error('Invalid inscription public key');
 return new w.ScriptBuilder().addData(publicKey).addOp(w.Opcodes.OpCheckSig).addOp(w.Opcodes.OpFalse).addOp(w.Opcodes.OpIf).addData(Buffer.from('kasplex')).addI64(0n).addData(Buffer.from(JSON.stringify(data))).addOp(w.Opcodes.OpEndIf);
}
async function prepareKrc20({network,address,publicKey,entries,transfer}){
 entries=entries.filter(require('./utxo-identity.cjs').ordinaryFunding);
 if(!entries.length)throw Error('No ordinary KAS available for KRC20 fees / 没有可用于手续费的普通 KAS');
 addressFor(address,network);const data=transferData(transfer,network),script=inscription(publicKey,data);
 let commit,reveal,lockingScript;
 try{
  lockingScript=script.createPayToScriptHashScript();const escrow=w.addressFromScriptPublicKey(lockingScript,network).toString();
  const deposit=130000000n;
  commit=await w.createTransactions({networkId:network,entries,outputs:[{address:escrow,amount:deposit}],changeAddress:address,priorityFee:0n});
  if(commit.transactions.length!==1)throw Error('Consolidate wallet UTXOs before KRC20 transfer');
  const commitTx=commit.transactions[0],outputs=commitTx.transaction.outputs,index=outputs.findIndex(o=>o.scriptPublicKey.script===lockingScript.script&&o.value===deposit);
  if(index<0)throw Error('Inscription commitment output missing');
  reveal=await w.createTransactions({networkId:network,entries:[{address:escrow,outpoint:{transactionId:commitTx.id,index},amount:deposit,scriptPublicKey:lockingScript,blockDaaScore:0n,isCoinbase:false}],outputs:[],changeAddress:address,priorityFee:100000n,minimumSignatures:Math.ceil((script.toString().length/2+66)/66)});
  if(reveal.transactions.length!==1)throw Error('Unexpected reveal transaction count');
  const revealTx=reveal.transactions[0];
  return Object.freeze({network,address,publicKey,data,escrow,redeemScript:script.toString(),commitId:commitTx.id,commitIndex:index,commit:commitTx.serializeToSafeJSON(),reveal:revealTx.serializeToSafeJSON(),deposit:deposit.toString(),summary:`KRC20 transfer / 转账\n${JSON.stringify(data,null,2)}\nTemporary commitment / 临时锁定: ${formatKas(deposit)} KAS\nTotal fees / 两步总手续费: ${formatKas(commitTx.feeAmount+revealTx.feeAmount)} KAS\nReveal returns unused KAS to / 揭示后余款返回: ${address}`});
 }finally{script.free();lockingScript?.free();for(const result of [commit,reveal]){for(const tx of result?.transactions||[])tx.free();result?.summary.free();}}
}
function signKrc20(prepared,vault){
 if(vault.kaspaIdentity(prepared.network).address!==prepared.address)throw Error('Wrong KRC20 signing wallet');
 const commit=vault.signKaspaTransaction(prepared.commit,prepared.address,prepared.network);
 const reveal=w.Transaction.deserializeFromSafeJSON(prepared.reveal);
 try{
  vault.withKaspaKey(key=>{const inputs=reveal.inputs;if(inputs.length!==1)throw Error('Invalid reveal input count');inputs[0].signatureScript=w.payToScriptHashSignatureScript(prepared.redeemScript,w.createInputSignature(reveal,0,key,1));reveal.inputs=inputs;reveal.finalize();});
  if(!w.updateTransactionMass(prepared.network,reveal,1))throw Error('Reveal exceeds standard transaction mass');
  const input=BigInt(prepared.deposit),output=reveal.outputs.reduce((n,o)=>n+o.value,0n),mass=w.calculateTransactionMass(prepared.network,reveal,1);
  if(input-output<mass)throw Error('Reveal fee below calculated mass');
  return {commit,reveal:reveal.serializeToSafeJSON(),commitId:prepared.commitId,revealId:reveal.id};
 }finally{reveal.free();}
}
module.exports={transferData,inscription,prepareKrc20,signKrc20};
