const {formatUnits}=require('ethers');
const {addressFor}=require('./kaspa.cjs');
const {krc20Holdings}=require('./tokens.cjs');
const {prepareKrc20,signKrc20}=require('./krc20.cjs');
function invalid(message){return Object.assign(Error(message),{code:-32602});}
function transferRequest(params,network){
 if(!Array.isArray(params)||params.length<2||params.length>4)throw invalid('Expected inscription, type, optional destination and priority fee');
 const [json,type,destination,fee=0]=params;
 if(type!==4)throw Object.assign(Error('Only KRC20 transfer (type 4) is supported; mint and deployment are not implemented'),{code:4200});
 if(fee!==0)throw Object.assign(Error('Custom KRC20 priority fee is not supported'),{code:4200});
 if(typeof json!=='string'||json.length>4096)throw invalid('Invalid inscription JSON');
 let data;try{data=JSON.parse(json);}catch{throw invalid('Invalid inscription JSON');}
 if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['p','op','tick','ca','amt','to'].includes(k)))throw invalid('Unsupported inscription fields');
 if(typeof data.p!=='string'||data.p.toLowerCase()!=='krc-20'||data.op!=='transfer')throw invalid('Not a KRC20 transfer');
 if(typeof data.amt!=='string'||! /^[1-9]\d{0,19}$/.test(data.amt)||BigInt(data.amt)>18446744073709551615n)throw invalid('Amount must be a positive uint64 atomic-unit string');
 if((data.tick!==undefined)===(data.ca!==undefined))throw invalid('Specify exactly one ticker or contract ID');
 if(data.tick!==undefined&&(typeof data.tick!=='string'||! /^[A-Za-z]{4,6}$/.test(data.tick)))throw invalid('Invalid ticker');
 if(data.ca!==undefined&&(typeof data.ca!=='string'||! /^[a-f0-9]{64}$/i.test(data.ca)))throw invalid('Invalid contract ID');
 if(destination!==undefined&&data.to!==undefined&&destination!==data.to)throw invalid('Destination differs from inscription recipient');
 const recipient=data.to??destination;addressFor(recipient,network);
 return Object.freeze({tick:data.tick?.toUpperCase(),ca:data.ca?.toLowerCase(),recipient,atomic:data.amt});
}
async function sendKrc20({params,service,identity,vault,operations,approve,valid,holdings=krc20Holdings,prepare=prepareKrc20,sign=signKrc20}){
 const network=service.network,revision=service.revision;
 const check=()=>valid()&&network===service.network&&revision===service.revision;
 const requireValid=()=>{if(!check())throw Error('KRC20 request context changed');};
 requireValid();const input=transferRequest(params,network);let next='',holding;const seen=new Set();
 for(let page=0;page<100;page++){
  requireValid();if(seen.has(next))throw Error('KRC20 indexer repeated pagination cursor');seen.add(next);
  const result=await holdings(network,identity.address,next);requireValid();
  holding=result.tokens.find(token=>input.ca?token.contract?.toLowerCase()===input.ca:!token.contract&&token.symbol.toUpperCase()===input.tick);
  if(holding||!result.next)break;next=result.next;
 }
 if(!holding)throw Error('KRC20 holding not found within query limit');
 if(BigInt(input.atomic)>BigInt(holding.amount))throw Error('Insufficient KRC20 balance');
 const prepared=await service.withRpc(async rpc=>{
  const {entries}=await rpc.getUtxosByAddresses({addresses:[identity.address]});requireValid();
  return prepare({network,...identity,entries:entries.filter(e=>!e.isCoinbase),transfer:{tick:input.tick,ca:input.ca,recipient:input.recipient,amount:formatUnits(input.atomic,holding.decimals),decimals:holding.decimals}});
 },network);
 requireValid();
 if(prepared.data.amt!==input.atomic||prepared.data.to!==input.recipient||prepared.data.tick!==input.tick||prepared.data.ca!==input.ca)throw Error('Prepared inscription differs from requested transfer');
 await approve(`${network}\n${prepared.summary}\nToken balances are indexer-reported / 代币余额由索引器提供`,check);requireValid();
 const signed=sign(prepared,vault);const record=await operations.create(prepared,signed);
 try{requireValid();await operations.run(record.id,check);}catch(error){throw Error(`${error.message}\nSaved for recovery / 已保存恢复记录: ${record.id}\nReveal: ${signed.revealId}`);}
 return signed.revealId;
}
module.exports={transferRequest,sendKrc20};
