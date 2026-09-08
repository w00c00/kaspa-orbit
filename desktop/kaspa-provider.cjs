const {addressFor,formatKas,amountSompi}=require('./kaspa.cjs');
function invalid(message){return Object.assign(Error(message),{code:-32602});}
function messageOptions(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['type','noAuxRand'].includes(key)))throw invalid('Unknown message signing options');
 const {type='auto',noAuxRand=false}=options;
 if(!['auto','schnorr','ecdsa'].includes(type)||typeof noAuxRand!=='boolean')throw invalid('Invalid message signing options');
 if(type==='ecdsa')throw Object.assign(Error('ECDSA message signatures are not supported; this account signs KIP-5 Schnorr hex'),{code:4200});
 return Object.freeze({type:'schnorr',noAuxRand});
}
function messageRequest(params){
 if(!Array.isArray(params)||params.length<1||params.length>2||typeof params[0]!=='string'||params[0].length>16384)throw invalid('Expected message and optional signing options');
 return Object.freeze({message:params[0],options:messageOptions(params[1])});
}
function exactSompi(value){
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<=0)throw invalid('Amount must be a positive safe integer in sompi');return BigInt(value);}
 if(typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value))return BigInt(value);
 throw invalid('Amount must be integer sompi; use a decimal string for large amounts');
}
function transferRequest(params,network){
 if(!Array.isArray(params)||params.length<2||params.length>3)throw invalid('Expected recipient, sompi, and optional options');
 const [recipient,sompi,options={}]=params;
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length)throw Object.assign(Error('Custom sendKaspa options are not supported; no options are silently ignored'),{code:4200});
 addressFor(recipient,network);
 const value=exactSompi(sompi),amount=formatKas(value);amountSompi(amount);
 return Object.freeze({recipient,amount});
}
async function sendKaspa({params,service,address,approve,valid,vault}){
 const network=service.network;
 const check=()=>valid()&&network===service.network;
 if(!check())throw Error('Request context changed');
 const input=transferRequest(params,network);
 const prepared=await service.prepare({address,...input});
 if(!check())throw Error('Request context changed');
 await approve(prepared.summary,check);
 if(!check())throw Error('Request context changed');
 return service.broadcast(prepared,vault,check);
}
module.exports={transferRequest,sendKaspa,messageOptions,messageRequest};
