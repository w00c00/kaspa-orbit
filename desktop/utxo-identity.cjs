const w=require('@kluster/kaspa-wasm');
// RPC returns UtxoEntryReference; covenantId lives on its owned entry copy,
// unlike amount/outpoint which the reference also exposes directly.
function covenantIdentity(value){
 const wrapped=value instanceof w.UtxoEntryReference;
 const entry=wrapped?value.entry:value;let hash;
 try{hash=entry?.covenantId;if(hash==null)return '';const result=String(hash).toLowerCase();if(!/^[a-f0-9]{64}$/.test(result))throw Error('Invalid live Covenant ID');return result;}
 finally{if(hash instanceof w.Hash)hash.free();if(wrapped)entry.free();}
}
function ordinaryFunding(entry){return !entry.isCoinbase&&!covenantIdentity(entry);}
module.exports={covenantIdentity,ordinaryFunding};
