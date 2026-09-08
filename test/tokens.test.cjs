const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const wasm=require('@kluster/kaspa-wasm');
const {krc20Holdings}=require('../desktop/tokens.cjs');
test('KRC20 balance preserves integer precision and pagination',async()=>{
 const key=new wasm.PrivateKey(crypto.randomBytes(32).toString('hex'));const address=key.toAddress('mainnet').toString();key.free();let observed;
 const transport=async url=>{observed=url;return {ok:true,json:async()=>({result:[{tick:'EXAMPLE',balance:'9007199254740993',locked:'100',dec:'8'}],next:'next/page'})};};
 const result=await krc20Holdings('mainnet',address,'cursor/value',transport);
 assert.equal(result.tokens[0].balance,'90071992.54740993');assert.equal(result.next,'next/page');assert.equal(observed.origin,'https://api.kasplex.org');assert.equal(observed.searchParams.get('next'),'cursor/value');
 await assert.rejects(krc20Holdings('testnet-10',address,'',transport),/network mismatch/);
 await assert.rejects(krc20Holdings('mainnet',address,'',async()=>({ok:true,json:async()=>({result:[{tick:'BAD',dec:'8',balance:'-1',locked:'0'}]})})),/Invalid KRC20/);
});
