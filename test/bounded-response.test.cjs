const {test}=require('node:test');const assert=require('node:assert/strict');const {boundedText}=require('../desktop/bounded-response.cjs');
test('response byte limit preserves Unicode and cancels oversized streamed bodies',async()=>{
 assert.equal(await boundedText(new Response('中文'),6),'中文');
 await assert.rejects(boundedText(new Response('中文'),5),/too large/);
 let cancelled=false,reads=0;
 const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(8));},cancel(){cancelled=true;}});
 await assert.rejects(boundedText(new Response(stream),12),/too large/);assert.equal(cancelled,true);assert.ok(reads<=3);
});
test('response rejects declared oversize, invalid UTF-8 and transport failures',async()=>{
 let cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}});
 await assert.rejects(boundedText(new Response(stream,{headers:{'content-length':'999'}}),12),/too large/);assert.equal(cancelled,true);
 await assert.rejects(boundedText(new Response(new Uint8Array([255]))),/encoded data/);
 await assert.rejects(boundedText(new Response(new ReadableStream({start(c){c.error(Error('connection lost'));}}))),/connection lost/);
});
