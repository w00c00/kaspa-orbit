const kaspa=require('@kluster/kaspa-wasm');
const NETWORKS=Object.freeze(['testnet-10','mainnet']);
async function deadline(promise,milliseconds=20000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Kaspa node request timed out / 节点请求超时')),milliseconds);})]);}finally{clearTimeout(timer);}}
function amountSompi(value){if(typeof value!=='string'||! /^(0|[1-9]\d*)(\.\d{1,8})?$/.test(value))throw Error('Amount must have at most 8 decimals / 金额最多 8 位小数');const [whole,fraction='']=value.split('.');const amount=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));if(amount<=0n||amount>2870000000000000000n)throw Error('Invalid KAS amount');return amount;}
function formatKas(value){const n=BigInt(value);return `${n/100000000n}.${(n%100000000n).toString().padStart(8,'0')}`;}
function addressFor(address,network){if(!NETWORKS.includes(network)||typeof address!=='string'||!address.startsWith(network==='mainnet'?'kaspa:':'kaspatest:'))throw Error('Address network mismatch / 地址网络不匹配');const script=kaspa.payToAddressScript(address);script.free();return address;}
class KaspaService{
 constructor(factory){this.network='mainnet';this.revision=0;this.factory=factory;}
 async withRpc(action,network=this.network,actionTimeout=20000){
   const url=this.rpcOverrides?.[network];
   const rpc=this.factory?this.factory(network,url):new kaspa.RpcClient(url?{url,networkId:network}:{resolver:new kaspa.Resolver(),networkId:network});
   try{await deadline(rpc.connect({strategy:'fallback',timeoutDuration:15000}));const info=await deadline(rpc.getServerInfo());if(String(info.networkId)!==network)throw Error('Kaspa node network mismatch');if(!info.isSynced||!info.hasUtxoIndex)throw Error('Node must be synced with UTXO index');return await deadline(action(rpc,info),actionTimeout);}
   finally{try{await rpc.disconnect();}catch{}try{await rpc.stop();}catch{}}
 }
 async switch(network){if(!NETWORKS.includes(network))throw Error('Unknown Kaspa network');await this.withRpc(()=>true,network);this.network=network;this.revision++;}
 async balance(address){const network=this.network;addressFor(address,network);return this.withRpc(async rpc=>{const result=await rpc.getBalanceByAddress({address});return {network,balanceSompi:String(result.balance),balance:formatKas(result.balance),symbol:network==='mainnet'?'KAS':'tKAS'};},network);}
 async prepare({address,recipient,amount,priorityFee='0'}){
   const network=this.network,revision=this.revision;addressFor(address,network);addressFor(recipient,network);
   const value=amountSompi(amount);
   if(typeof priorityFee!=='string'||!/^\d+$/.test(priorityFee)||BigInt(priorityFee)>100000000n)throw Error('Invalid priority fee');
   return this.withRpc(async rpc=>{
     const {entries}=await rpc.getUtxosByAddresses({addresses:[address]});
     const spendable=entries.filter(require('./utxo-identity.cjs').ordinaryFunding);
     if(!spendable.length)throw Error('No spendable non-coinbase UTXOs / 没有可用的普通 UTXO');
     const generated=await kaspa.createTransactions({entries:spendable,outputs:[{address:recipient,amount:value}],changeAddress:address,priorityFee:BigInt(priorityFee),networkId:network});
     try{if(generated.transactions.length!==1)throw Error('UTXO consolidation required before this transfer / 此笔转账需要先归集 UTXO');
       const pending=generated.transactions[0];
       return Object.freeze({network,revision,address,recipient,amount:value.toString(),unsigned:pending.serializeToSafeJSON(),summary:`${network}\nFrom / 发出: ${address}\nTo / 接收: ${recipient}\nAmount / 金额: ${formatKas(value)} KAS\nFee / 手续费: ${formatKas(pending.feeAmount)} KAS\nChange / 找零: ${formatKas(pending.changeAmount)} KAS`});
     }finally{for(const tx of generated.transactions)tx.free();generated.summary.free();}
   },network);
 }
 async broadcast(prepared,vault,valid){
   const check=()=>valid()&&prepared.revision===this.revision&&prepared.network===this.network&&vault.kaspaIdentity(this.network).address===prepared.address;
   if(!check())throw Error('Kaspa authorization changed');
   return this.withRpc(async rpc=>{
     if(!check())throw Error('Kaspa authorization changed');
     const anchor=this.history?(await deadline(rpc.getSink(),5000)).sink:undefined;
     if(this.history&&(typeof anchor!=='string'||! /^[0-9a-f]{64}$/i.test(anchor)))throw Error('Invalid pre-broadcast checkpoint');
     if(!check())throw Error('Kaspa authorization changed');
     const signed=vault.signKaspaTransaction(prepared.unsigned,prepared.address,this.network);
     const tx=kaspa.Transaction.deserializeFromSafeJSON(signed);
     try{if(!check())throw Error('Kaspa authorization changed');
       const record={family:'kaspa',network:prepared.network,hash:tx.id,address:prepared.address,anchor};this.history?.before(record);
       let result;try{result=await deadline(rpc.submitTransaction({transaction:tx,allowOrphan:false}),18000);}catch(error){throw Error(`Broadcast status unknown; check ${tx.id} before retrying / 广播结果未确认，请先查询交易。${error.message}`);}if(result.transactionId!==tx.id)throw Error(`Node returned unexpected transaction ID; check ${tx.id}`);
       try{this.history?.after(record);}catch{throw Error(`Broadcast accepted, but history update failed; check ${tx.id} / 已提交，但记录更新失败，请查询交易`);}return result.transactionId;}
     finally{tx.free();}
   },prepared.network,30000);
 }
}
module.exports={KaspaService,NETWORKS,amountSompi,formatKas,addressFor};
