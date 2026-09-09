// Offline engine bridge. Fresh unfunded key; emits public synthetic tx only.
const w=require('@kluster/kaspa-wasm');const crypto=require('node:crypto');
const {assembleAddressTransfer}=require('../desktop/kcc20-assemble.cjs');
const {encodeOrdinaryOutput}=require('../desktop/kcc20-codec.cjs');
const {signAddressTransfer}=require('../desktop/kcc20-sign.cjs');
const {programHex}=require('../test/fixtures/kcc20-2433.json');
const key=new w.PrivateKey(crypto.randomBytes(32).toString('hex')),pub=key.toPublicKey(),x=pub.toXOnlyPublicKey();
try{
 const owner=x.toString(),covenantId='aa'.repeat(32);
 const program=encodeOrdinaryOutput(programHex,{owner,identifierType:3,amount:'1000'});
 const script=w.payToScriptHashScript(program);const scriptPublicKey='0000'+script.script;script.free();
 const count=process.argv[2]==='merge'?2:1;
 const inputs=Array.from({length:count},(_,index)=>({transactionId:'bb'.repeat(32),index,covenantId,programHex:program,valueSompi:'50000000',blockDaaScore:'1',scriptPublicKey}));
 const outputs=[{covenantId,owner,amount:String(count*1000),programHex:encodeOrdinaryOutput(program,{owner,identifierType:3,amount:String(count*1000)})}];
 const funding={transactionId:'cc'.repeat(32),index:0,covenantId:null,valueSompi:'100000000',blockDaaScore:'1',scriptPublicKey:'000020'+owner+'ac',isCoinbase:false};
 const plan={network:'testnet-10',covenantId,inputs,outputs},options={owner,feeSompi:'100000'};
 const draft=assembleAddressTransfer(plan,funding,options);
 process.stdout.write(signAddressTransfer(plan,funding,options,draft.transaction,key).transaction);
}finally{x.free();pub.free();key.free();}
