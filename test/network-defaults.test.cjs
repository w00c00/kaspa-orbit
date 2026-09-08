const {test}=require('node:test');
const assert=require('node:assert/strict');
const {KaspaService}=require('../desktop/kaspa.cjs');
const {EvmService}=require('../desktop/evm.cjs');
test('wallet services default to mainnet without connecting or broadcasting',()=>{
 assert.equal(new KaspaService().network,'mainnet');
 assert.equal(new EvmService().network.id,'igra');
 assert.equal(new EvmService().network.chainId,38833);
});
