const {PROFILE,inspectProgram,encodeOrdinaryOutput}=require('./kcc20-codec.cjs');
const {verifyCovenantCell}=require('./covenant-state.cjs');
const id=(s)=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
// Planning only: never signs or broadcasts. Fee funding and full transaction
// validation remain separate mandatory gates, including a final live recheck.
async function planAddressTransfer(service,{network,covenantId,owner,recipient,amount,cells}){
 const revision=service.revision;
 const current=()=>{if(service.network!==network||service.revision!==revision)throw Error('Network changed during token planning');};
 current();
 if(!['mainnet','testnet-10'].includes(network)||![covenantId,owner,recipient].every(id))throw Error('Invalid KCC20 transfer identity');
 covenantId=covenantId.toLowerCase();owner=owner.toLowerCase();recipient=recipient.toLowerCase();
 if(typeof amount!=='string'||!/^\d{1,10}$/.test(amount)||BigInt(amount)<1n||BigInt(amount)>PROFILE.maxAmount)throw Error('Invalid atomic KCC20 transfer amount');
 if(!Array.isArray(cells)||cells.length===0||cells.length>100)throw Error('Provide 1–100 bounded KCC20 candidates');
 const seen=new Set();
 const candidates=cells.map(cell=>{
  if(cell.network!==network||!id(cell.covenantId)||cell.covenantId.toLowerCase()!==covenantId||!id(cell.transactionId)||!Number.isInteger(cell.index)||cell.index<0||cell.index>0xffffffff)throw Error('KCC20 candidate identity mismatch');
  const key=cell.transactionId.toLowerCase()+':'+cell.index;if(seen.has(key))throw Error('Duplicate KCC20 candidate');seen.add(key);
  const state=inspectProgram(cell.programHex);
  if(state.owner!==owner||state.identifierType!==3||state.isMinter)throw Error('Only owned non-minter address cells are supported by this planner');
  return {...cell,state};
 }).sort((a,b)=>BigInt(a.state.amount)>BigInt(b.state.amount)?-1:BigInt(a.state.amount)<BigInt(b.state.amount)?1:0);
 const selected=[];let total=0n;
 for(const candidate of candidates){
  if(selected.length===PROFILE.maxInputs||total>=BigInt(amount))break;
  const verified=await verifyCovenantCell(service,candidate);current();
  selected.push(Object.freeze({...verified,state:candidate.state}));total+=BigInt(candidate.state.amount);
 }
 if(total<BigInt(amount))throw Error('Insufficient verified tokens within the four-input limit');
 const reference=selected[0].programHex;
 const output=(to,n)=>Object.freeze({covenantId,amount:String(n),owner:to,identifierType:3,programHex:encodeOrdinaryOutput(reference,{owner:to,identifierType:3,amount:String(n)})});
 const outputs=[output(recipient,BigInt(amount))];let change=total-BigInt(amount);
 while(change>0n){const part=change>PROFILE.maxAmount?PROFILE.maxAmount:change;outputs.push(output(owner,part));change-=part;}
 if(outputs.length>PROFILE.maxOutputs)throw Error('KCC20 output limit exceeded');
 current();
 return Object.freeze({network,covenantId,profile:PROFILE.id,inputs:Object.freeze(selected),outputs:Object.freeze(outputs),
  inputAmount:String(total),transferAmount:BigInt(amount).toString(),changeAmount:String(total-BigInt(amount)),
  requiresOwnerCospend:true,requiresFunding:true,requiresFinalLiveRecheck:true,readyToSign:false});
}
module.exports={planAddressTransfer};
