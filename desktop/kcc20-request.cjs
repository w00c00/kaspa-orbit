const w=require('@kluster/kaspa-wasm');
const {addressFor}=require('./kaspa.cjs');
const {planAddressTransfer}=require('./kcc20-plan.cjs');
const {prepareAddressTransfer}=require('./kcc20-prepare.cjs');
function transferRequest(network,args){
 if(network!=='testnet-10')throw Error('KCC20 transfer is experimental: select TN10');
 if(!args||typeof args!=='object'||Object.keys(args).some(k=>!['covenantId','recipient','amount','feeSompi'].includes(k)))throw Error('Invalid KCC20 request fields');
 if(typeof args.covenantId!=='string'||!/^[a-f0-9]{64}$/i.test(args.covenantId))throw Error('Invalid Covenant ID');
 if(typeof args.amount!=='string'||!/^[1-9]\d{0,9}$/.test(args.amount)||BigInt(args.amount)>1000000000n)throw Error('Enter 1–1000000000 atomic token units');
 const autoFee=args.feeSompi===undefined||args.feeSompi==='';
 if(!autoFee&&(typeof args.feeSompi!=='string'||!/^[1-9]\d{0,8}$/.test(args.feeSompi)||BigInt(args.feeSompi)>100000000n))throw Error('Invalid fee in sompi (maximum 1 KAS)');
 addressFor(args.recipient,network);const script=w.payToAddressScript(args.recipient);
 try{const match=/^20([a-f0-9]{64})ac$/.exec(script.script);if(script.version!==0||!match)throw Error('KCC20 address ownership requires a Schnorr P2PK recipient');return Object.freeze({covenantId:args.covenantId.toLowerCase(),recipient:match[1],recipientAddress:args.recipient,amount:args.amount,feeSompi:args.feeSompi});}
 finally{script.free();}
}
async function prepareTransferRequest({service,source,identity,args,valid}){
 const network=service.network,revision=service.revision,request=transferRequest(network,args);
 const owner=identity.publicKey;
 const check=()=>{if(!valid()||service.network!==network||service.revision!==revision)throw Error('KCC20 wallet context changed');};check();
 const candidates=await source.cells(network,request.covenantId,{owner:'03'+owner,limit:100});check();
 const plan=await planAddressTransfer(service,{network,covenantId:request.covenantId,owner,recipient:request.recipient,amount:request.amount,cells:candidates.cells});check();
 const prepared=await prepareAddressTransfer(service,plan,{owner,feeSompi:request.feeSompi},valid);check();
 return {prepared,request};
}
module.exports={transferRequest,prepareTransferRequest};
