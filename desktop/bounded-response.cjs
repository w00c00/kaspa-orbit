// Bound decompressed bytes as they arrive, before JSON parsing or aggregation.
async function boundedText(response,maxBytes=20_000_000){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('Invalid response limit');
 if(!response.body?.getReader)throw Error('Streaming response required');
 const reader=response.body.getReader();const chunks=[];let total=0,complete=false;
 try{
  const declared=response.headers?.get('content-length');
  if(declared&&/^\d+$/.test(declared)&&BigInt(declared)>BigInt(maxBytes))throw Error('Response too large');
  while(true){const {done,value}=await reader.read();if(done){complete=true;break;}total+=value.byteLength;if(total>maxBytes)throw Error('Response too large');chunks.push(Buffer.from(value));}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total));
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
module.exports={boundedText};
