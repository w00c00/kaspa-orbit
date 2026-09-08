const {test}=require('node:test');const assert=require('node:assert/strict');const {Kcc20Source}=require('../desktop/kcc20.cjs');
const id='ab'.repeat(32),owner='03'+'cd'.repeat(32);
const cell={outpoint:'ef'.repeat(32)+':0',owner,identifier_type:'03',is_minter:false,amount:'9007199254740993',value_sompi:'50000000',program_hex:'51'};
function harness(){let body={network:'mainnet',token_id:id,cells:[{...cell}],omitted_over_limit:2,omitted_unproven:1,omitted_unvalued:0};const source=new Kcc20Source(async url=>{assert.ok(url.includes('/cells?'));return new Response(JSON.stringify(body));});return {source,body};}
test('bounded KCC20 candidates keep exact amounts, omissions and unverified provenance',async()=>{
 const {source}=harness();const r=await source.cells('mainnet',id,{owner,limit:1});assert.equal(r.cells[0].reportedAmount,'9007199254740993');assert.equal(r.cells[0].liveBindingVerified,false);assert.equal(r.cells[0].contractSemanticsVerified,false);assert.equal(r.omittedOverLimit,'2');
});
test('KCC20 candidate query rejects identity substitution, duplicate/out-of-range outpoints and owner mismatch',async()=>{
 for(const change of [b=>b.token_id='00'.repeat(32),b=>b.cells.push({...cell}),b=>b.cells[0].outpoint='ef'.repeat(32)+':4294967296',b=>b.cells[0].owner='02'+'cd'.repeat(32),b=>b.cells[0].amount='-1',b=>b.cells[0].program_hex='zz']){const h=harness();change(h.body);await assert.rejects(h.source.cells('mainnet',id,{owner,limit:2}));}
 const h=harness();await assert.rejects(h.source.cells('mainnet',id,{limit:101}));await assert.rejects(h.source.cells('mainnet',id,{owner:'../bad'}));
});
