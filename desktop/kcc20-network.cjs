// TN10 activation from official rusty-kaspa a41a333 consensus parameters.
// Current c338d495 has removed the activation override after the transition.
// A node report is a trust boundary, not independent consensus verification.
const TN10_TOCCATA_DAA=467579632n;
function requireTn10Toccata(info){
 if(!info||String(info.networkId)!=='testnet-10'||info.isSynced!==true||info.hasUtxoIndex!==true)throw Error('Synced TN10 UTXO-indexed node required');
 const score=info.virtualDaaScore;
 if(!(typeof score==='bigint'||typeof score==='string'&&/^(0|[1-9]\d*)$/.test(score))||BigInt(score)<TN10_TOCCATA_DAA)throw Error('TN10 Toccata activation not observed');
 return true;
}
module.exports={requireTn10Toccata,TN10_TOCCATA_DAA};
