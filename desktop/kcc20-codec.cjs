// Exact deployed-program codec, not a transaction authorizer or safety audit.
const {createHash}=require('node:crypto');
const PROFILE=Object.freeze({id:'kcc20-4in-5out-2433',bytes:2433,stateBytes:46,
 suffixSha256:'f40cfce2a7a683142131cf0e74a9d98b54921df2696e49d4b675d0df87a6ca4a',maxOutputs:5,maxInputs:4,maxAmount:1000000000n});
function inspectProgram(hex){
 if(typeof hex!=='string'||hex.length!==PROFILE.bytes*2||!/^[a-fA-F0-9]+$/.test(hex))throw Error('Unsupported KCC20 program');
 const bytes=Buffer.from(hex,'hex');
 if(createHash('sha256').update(bytes.subarray(46)).digest('hex')!==PROFILE.suffixSha256)throw Error('Unrecognized KCC20 program template');
 if(bytes[0]!==32||bytes[33]!==1||bytes[35]!==8||bytes[44]!==1||bytes[34]>3||bytes[45]>1)throw Error('Noncanonical KCC20 state');
 const amount=bytes.readBigUInt64LE(36);
 // Reject negative encodings, negative zero and excessive balances before use.
 if(amount>PROFILE.maxAmount||(!bytes[45]&&amount===0n))throw Error('Unsupported KCC20 balance');
 return Object.freeze({profile:PROFILE.id,owner:bytes.subarray(1,33).toString('hex'),identifierType:bytes[34],amount:amount.toString(),isMinter:bytes[45]===1});
}
function encodeOrdinaryOutput(reference,state){
 inspectProgram(reference);
 if(!state||Object.keys(state).sort().join(',')!=='amount,identifierType,owner')throw Error('Explicit owner, identifierType and amount required');
 if(typeof state.owner!=='string'||!/^[a-fA-F0-9]{64}$/.test(state.owner)||!Number.isInteger(state.identifierType)||state.identifierType<0||state.identifierType>3)throw Error('Invalid KCC20 owner');
 if(typeof state.amount!=='string'||!/^\d+$/.test(state.amount)||state.amount.length>10)throw Error('KCC20 amount must be an atomic-unit string');
 const amount=BigInt(state.amount);if(amount<1n||amount>PROFILE.maxAmount)throw Error('KCC20 output amount out of range');
 const bytes=Buffer.from(reference,'hex');Buffer.from(state.owner,'hex').copy(bytes,1);bytes[34]=state.identifierType;bytes.writeBigUInt64LE(amount,36);bytes[45]=0;
 return bytes.toString('hex');
}
function pushBytes(bytes){
 const n=bytes.length;if(n>65535)throw Error('KCC20 push too large');
 return Buffer.concat([n<=75?Buffer.from([n]):n<=255?Buffer.from([0x4c,n]):Buffer.from([0x4d,n&255,n>>>8]),bytes]);
}
// ABI encoding only. Wallet layout is token inputs first, then an ordinary
// signed P2PK owner input. The transaction builder must verify that input.
function encodeAddressUnlock(reference,outputs,{tokenInputCount,ownerInputIndex,totalInputCount}){
 const input=inspectProgram(reference);if(input.identifierType!==3||input.isMinter)throw Error('Address-owned non-minter input required');
 if(!Number.isInteger(tokenInputCount)||tokenInputCount<1||tokenInputCount>4||!Number.isInteger(totalInputCount)||totalInputCount<=tokenInputCount||totalInputCount>256||!Number.isInteger(ownerInputIndex)||ownerInputIndex<tokenInputCount||ownerInputIndex>=totalInputCount)throw Error('Invalid KCC20 owner witness layout');
 if(!Array.isArray(outputs)||outputs.length<1||outputs.length>5)throw Error('Invalid KCC20 output count');
 const programs=outputs.map(state=>Buffer.from(encodeOrdinaryOutput(reference,state),'hex'));
 const fields=[Buffer.concat(programs.map(p=>p.subarray(1,33))),Buffer.from(programs.map(p=>p[34])),
  Buffer.concat(programs.map(p=>p.subarray(36,44))),Buffer.alloc(programs.length),Buffer.alloc(0),
  Buffer.alloc(tokenInputCount,ownerInputIndex),Buffer.from(reference,'hex')];
 return Buffer.concat(fields.map(pushBytes)).toString('hex');
}
module.exports={PROFILE,inspectProgram,encodeOrdinaryOutput,encodeAddressUnlock};
