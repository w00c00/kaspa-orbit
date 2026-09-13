const {test}=require('node:test');const assert=require('node:assert/strict');
const {Discovery}=require('../ui/discovery.js');
test('hidden-window completion resets loading and does not cache an unseen result',async()=>{
 let context='wallet',release,calls=0;const states=[];
 const discovery=new Discovery({context:()=>context,load:()=>{calls++;return new Promise(r=>release=r);},publish:(...s)=>states.push(s)});
 const pending=discovery.tick('kaspa');context=null;release();await pending;
 assert.equal(states.at(-1)[1],'idle');context='wallet';const resumed=discovery.tick('kaspa');assert.equal(calls,2);release();await resumed;
 assert.equal(states.at(-1)[1],'success');
});
test('asset discovery deduplicates, refreshes on context change and suppresses stale errors',async()=>{
 let context='wallet-a',release,calls=0;const states=[];
 const discovery=new Discovery({context:()=>context,load:async()=>{calls++;await new Promise(r=>release=r);if(calls===1)throw Error('old failure');},publish:(...s)=>states.push(s)});
 const first=discovery.tick('krc20');await discovery.tick('krc20');assert.equal(calls,1);
 context='wallet-b';release();await first;await new Promise(r=>setImmediate(r));assert.equal(calls,2);
 assert.equal(states.some(s=>s[1]==='error'),false);release();await new Promise(r=>setImmediate(r));
 assert.equal(states.at(-1)[1],'success');await discovery.tick('krc20');assert.equal(calls,2);
 context=null;await discovery.tick('kcc20');assert.equal(calls,2);
});
test('query failure is distinct from empty holdings and can retry manually',async()=>{
 const states=[];let calls=0;const discovery=new Discovery({context:()=> 'wallet',load:async()=>{calls++;throw Error('HTTP 503');},publish:(...s)=>states.push(s)});
 await discovery.tick('kcc20');assert.deepEqual(states.at(-1),['kcc20','error','HTTP 503']);
 await discovery.tick('kcc20');assert.equal(calls,1);await discovery.tick('kcc20',true);assert.equal(calls,2);
});
