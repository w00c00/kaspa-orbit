const {formatUnits}=require('ethers');
const {addressFor}=require('./kaspa.cjs');
const {boundedText}=require('./bounded-response.cjs');
function exactJson(text){return JSON.parse(text,(_key,value,context)=>{if(typeof value==='number'&&Number.isInteger(value)){if(context?.source&&/^-?\d+$/.test(context.source))return context.source;if(!Number.isSafeInteger(value))throw Error('Unsafe integer in indexer response');return String(value);}return value;});}
function integer(value,label){if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error(`Unsafe ${label}`);const s=String(value);if(!/^\d+$/.test(s))throw Error(`Invalid ${label}`);return s;}
function id(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value))throw Error('Invalid Covenant ID');return value.toLowerCase();}
function text(value,max=120){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';}
class Kcc20Source{
 constructor(transport=fetch){this.transport=transport;}
 async cells(network,covenantId,{owner,limit=20}={}){
  covenantId=id(covenantId);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('KCC20 cell limit must be 1–100');
  if(owner!==undefined&&(typeof owner!=='string'||! /^[a-f0-9]{66}$/.test(owner)))throw Error('Invalid KCC20 owner key');
  const query=new URLSearchParams({limit:String(limit)});if(owner)query.set('owner',owner);
  const data=await this.get(network,`token/${covenantId}/cells?${query}`);
  if(data.token_id!==covenantId||!Array.isArray(data.cells)||data.cells.length>limit)throw Error('KCC20 cell response identity or limit mismatch');
  const seen=new Set();const cells=data.cells.map(cell=>{
   const match=typeof cell.outpoint==='string'&&/^([a-f0-9]{64}):(0|[1-9]\d{0,9})$/.exec(cell.outpoint);
   if(!match||Number(match[2])>0xffffffff||seen.has(cell.outpoint))throw Error('Invalid or duplicate KCC20 cell outpoint');seen.add(cell.outpoint);
   if(typeof cell.program_hex!=='string'||! /^(?:[a-f0-9]{2}){1,100000}$/.test(cell.program_hex))throw Error('Invalid KCC20 cell program');
   if(typeof cell.owner!=='string'||! /^[a-f0-9]{66}$/.test(cell.owner)||owner&&cell.owner!==owner)throw Error('KCC20 cell owner mismatch');
   if(cell.identifier_type!==cell.owner.slice(0,2)||typeof cell.is_minter!=='boolean')throw Error('Invalid KCC20 ownership metadata');
   return {network,covenantId,transactionId:match[1],index:Number(match[2]),programHex:cell.program_hex,valueSompi:integer(cell.value_sompi,'cell value'),reportedAmount:integer(cell.amount,'cell amount'),reportedOwner:cell.owner,reportedIsMinter:cell.is_minter,source:'kascov',liveBindingVerified:false,contractSemanticsVerified:false};
  });
  return {network,covenantId,cells,omittedOverLimit:integer(data.omitted_over_limit,'omitted cells'),omittedUnproven:integer(data.omitted_unproven,'unproven cells'),omittedUnvalued:integer(data.omitted_unvalued,'unvalued cells')};
 }
 async get(network,resource){if(!['mainnet','testnet-10'].includes(network))throw Error('Unknown KCC20 network');const response=await this.transport(`https://kascov.io/data/${network}/${resource}`,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{accept:'application/json'}});if(!response.ok){await response.body?.cancel().catch(()=>{});throw Error(`KCC20 indexer HTTP ${response.status}`);}const body=await boundedText(response);const data=exactJson(body);if(data.network!==network)throw Error('KCC20 indexer network mismatch');return data;}
 async holdings(network,address){addressFor(address,network);const data=await this.get(network,`addr/${encodeURIComponent(address)}.json`);if(data.address!==address)throw Error('KCC20 indexer address mismatch');if(!Array.isArray(data.token_holdings))throw Error('Missing KCC20 holdings');
  return {network,address,source:'kascov',checkedAt:new Date().toISOString(),tokens:data.token_holdings.map(h=>{
   const covenantId=id(h.token_id),amount=integer(h.balance,'KCC20 balance');
   const rawDecimals=h.listed_decimals??h.claimed_decimals;
   const decimals=rawDecimals==null?null:Number(rawDecimals);if(decimals!==null&&(!Number.isInteger(decimals)||decimals<0||decimals>18))throw Error('Invalid KCC20 decimals');
   return {kind:'kcc20',covenantId,name:text(h.listed_name||h.claimed_name||h.name),symbol:text(h.listed_ticker||h.claimed_ticker,32),amount,decimals,balance:decimals===null?amount:formatUnits(amount,decimals),cells:integer(h.cells,'KCC20 cells'),ownerKind:text(h.owner_kind,40),indexerStatus:text(h.status,40),source:'kascov',locallyVerified:false,url:`https://kascov.io/#/${network}/token/${covenantId}`};
  })};
 }
 async token(network,covenantId){covenantId=id(covenantId);const data=await this.get(network,`token/${covenantId}`);if(data.token?.covenant_id!==covenantId)throw Error('KCC20 identity mismatch');const token=data.token;return {network,covenantId,name:text(token.name),layout:text(token.layout),template:text(token.template),indexerStatus:text(data.validation?.status||token.status),reason:text(data.validation?.reason,400),source:'kascov',locallyVerified:false};}
}
module.exports={Kcc20Source,exactJson};
