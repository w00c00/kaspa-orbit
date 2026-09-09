const {test}=require('node:test'),assert=require('node:assert/strict');const {requireTn10Toccata,TN10_TOCCATA_DAA}=require('../desktop/kcc20-network.cjs');
test('TN10 fork gate requires exact network, sync, index and activation score',()=>{
 const info={networkId:'testnet-10',isSynced:true,hasUtxoIndex:true,virtualDaaScore:TN10_TOCCATA_DAA};assert.equal(requireTn10Toccata(info),true);
 for(const patch of [{networkId:'mainnet'},{isSynced:false},{hasUtxoIndex:false},{virtualDaaScore:TN10_TOCCATA_DAA-1n},{virtualDaaScore:undefined},{virtualDaaScore:NaN}])assert.throws(()=>requireTn10Toccata({...info,...patch}));
});
