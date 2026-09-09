const {getAddress,getBytes,isHexString,formatEther,Transaction,keccak256}=require('ethers');
const {boundedText}=require('./bounded-response.cjs');
const NETWORKS=Object.freeze([
  {id:'igra-testnet',name:'Igra Galleon Testnet',chainId:38836,symbol:'iKAS',rpc:'https://galleon-testnet.igralabs.com:8545',explorer:'https://explorer.galleon-testnet.igralabs.com'},
  {id:'igra',name:'Igra Mainnet',chainId:38833,symbol:'iKAS',rpc:'https://rpc.igralabs.com:8545',explorer:'https://explorer.igralabs.com'},
  {id:'kasplex',name:'Kasplex Mainnet',chainId:202555,symbol:'KAS',rpc:'https://evmrpc.kasplex.org',explorer:'https://explorer.kasplex.org'},
].map(Object.freeze));
const hex=n=>'0x'+BigInt(n).toString(16);
function quantity(value){if(typeof value!=='string'||!/^0x(0|[1-9a-f][0-9a-f]*)$/i.test(value))throw Error('Invalid RPC quantity');const n=BigInt(value);if(n>=1n<<256n)throw Error('Quantity overflow');return n;}
const READ_METHODS=new Set(['eth_blockNumber','eth_getBalance','eth_getCode','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_getLogs']);
class EvmService {
  constructor(transport=fetch){this.transport=transport;this.network=NETWORKS.find(n=>n.id==='igra');this.revision=0;}
  async rpc(method,params=[],network=this.network){
    const response=await this.transport(this.rpcOverrides?.[network.id]||network.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok)throw Error(`RPC HTTP ${response.status}`);
    const body=JSON.parse(await boundedText(response));
    if(!body||typeof body!=='object'||Array.isArray(body)||body.jsonrpc!=='2.0'||body.id!==1||Object.hasOwn(body,'result')===Object.hasOwn(body,'error'))throw Error('Malformed RPC response');
    if(Object.hasOwn(body,'error')){
      if(!body.error||!Number.isInteger(body.error.code)||typeof body.error.message!=='string')throw Error('Malformed RPC error');
      throw Object.assign(Error(body.error.message),{code:body.error.code,...(Object.hasOwn(body.error,'data')?{data:body.error.data}:{})});
    }
    if(!Object.hasOwn(body,'result'))throw Error('Malformed RPC response');return body.result;
  }
  async verify(network=this.network){if(quantity(await this.rpc('eth_chainId',[],network))!==BigInt(network.chainId))throw Error('RPC returned wrong chain / 节点网络不匹配');}
  async switch(chainId){const next=NETWORKS.find(n=>BigInt(n.chainId)===quantity(chainId));if(!next)throw Object.assign(Error('Unknown network'),{code:4902});await this.verify(next);this.network=next;this.revision++;return null;}
  async read(method,params=[]){if(!READ_METHODS.has(method))throw Object.assign(Error('Unsupported RPC method'),{code:4200});const network=this.network;await this.verify(network);return this.rpc(method,params,network);}
  async prepare(input,address){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid transaction');
    const allowed=new Set(['from','to','value','data','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','chainId','type','accessList']);
    for(const key of Object.keys(input))if(!allowed.has(key))throw Error(`Unsupported transaction field: ${key}`);
    if(getAddress(input.from)!==getAddress(address))throw Error('Transaction account mismatch');
    const network=this.network,revision=this.revision;
    if(input.chainId!==undefined&&quantity(input.chainId)!==BigInt(network.chainId))throw Error('Transaction chain mismatch');
    const tx={chainId:BigInt(network.chainId),to:input.to?getAddress(input.to):null,value:quantity(input.value??'0x0'),data:input.data??'0x'};
    if(!isHexString(tx.data)||tx.data.length>262146)throw Error('Invalid or oversized transaction data');
    await this.verify(network);
    tx.nonce=Number(quantity(input.nonce??await this.rpc('eth_getTransactionCount',[address,'pending'],network)));
    if(!Number.isSafeInteger(tx.nonce))throw Error('Invalid nonce');
    if(input.accessList!==undefined)tx.accessList=input.accessList;
    const dynamic=input.maxFeePerGas!==undefined||input.maxPriorityFeePerGas!==undefined;
    if(dynamic){if(input.gasPrice!==undefined)throw Error('Conflicting fee fields');tx.type=2;tx.maxPriorityFeePerGas=quantity(input.maxPriorityFeePerGas??'0x0');tx.maxFeePerGas=quantity(input.maxFeePerGas??await this.rpc('eth_gasPrice',[],network));if(tx.maxPriorityFeePerGas>tx.maxFeePerGas)throw Error('Priority fee exceeds max fee');}
    else{tx.type=input.accessList?1:0;tx.gasPrice=quantity(input.gasPrice??await this.rpc('eth_gasPrice',[],network));}
    if(input.type!==undefined&&quantity(input.type)!==BigInt(tx.type))throw Error('Transaction type and fee fields disagree');
    const rpcTx={from:address,to:tx.to,value:hex(tx.value),data:tx.data,...(tx.accessList?{accessList:tx.accessList}:{})};
    if(!rpcTx.to)delete rpcTx.to;
    const estimate=quantity(await this.rpc('eth_estimateGas',[rpcTx],network));
    tx.gasLimit=input.gas?quantity(input.gas):estimate*120n/100n;
    if(tx.gasLimit<estimate)throw Error('Gas limit is below estimated requirement');
    const maxFee=tx.gasLimit*(tx.maxFeePerGas??tx.gasPrice);
    const balance=quantity(await this.rpc('eth_getBalance',[address,'pending'],network));
    if(balance<tx.value+maxFee)throw Error('Insufficient balance including maximum fee / 余额不足以支付金额和手续费');
    // Serialize before approval so a caller cannot mutate the reviewed object.
    const unsigned=Transaction.from(tx).unsignedSerialized;
    return Object.freeze({unsigned,network,revision,address:getAddress(address),summary:`${network.name}\nFrom / 发出: ${address}\nTo / 接收: ${tx.to??'Contract creation / 创建合约'}\nValue / 金额: ${formatEther(tx.value)} ${network.symbol}\nMaximum fee / 最高手续费: ${formatEther(maxFee)} ${network.symbol}\nNonce: ${tx.nonce}\nData / 调用数据: ${tx.data}`});
  }
  async broadcast(prepared,wallet,valid=()=>true){
    if(prepared.revision!==this.revision||prepared.network!==this.network||getAddress(wallet.address)!==prepared.address)throw Error('Wallet or network changed; review again');
    await this.verify(prepared.network);
    if(prepared.revision!==this.revision||!valid())throw Error('Network or authorization changed');
    const signed=await wallet.signTransaction(Transaction.from(prepared.unsigned));
    if(!valid()||prepared.revision!==this.revision)throw Error('Authorization expired before broadcast');
    const record={family:'evm',network:prepared.network.id,hash:keccak256(signed),address:prepared.address};
    this.history?.before(record);
    let hash;try{hash=await this.rpc('eth_sendRawTransaction',[signed],prepared.network);}catch(error){throw Error(`Broadcast status unknown; check ${keccak256(signed)} before retrying / 广播结果未确认，请先查询交易。${error.message}`);}
    if(hash.toLowerCase()!==keccak256(signed).toLowerCase())throw Error('RPC returned unexpected transaction hash');
    try{this.history?.after(record);}catch{throw Error(`Broadcast accepted, but history update failed; check ${hash} / 已提交，但记录更新失败，请查询交易`);}
    return hash;
  }
}
function personalMessage(params,address){if(!Array.isArray(params)||params.length!==2||getAddress(params[1])!==getAddress(address))throw Error('Message account mismatch');if(!isHexString(params[0])||params[0].length>32770)throw Error('Invalid or oversized message');return getBytes(params[0]);}
module.exports={EvmService,NETWORKS,READ_METHODS,hex,quantity,personalMessage};
