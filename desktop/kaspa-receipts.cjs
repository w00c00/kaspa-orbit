const HASH=/^[0-9a-f]{64}$/i;
async function kaspaReceipt(service,record){
 const network=service.network,revision=service.revision;
 if(record.family!=='kaspa'||record.network!==network||!HASH.test(record.hash))throw Error('Kaspa receipt identity mismatch');
 if(!record.anchor)return {status:'no-checkpoint',checkedAt:new Date().toISOString()};
 if(typeof record.anchor!=='string'||!HASH.test(record.anchor))throw Error('Invalid Kaspa checkpoint');
 return service.withRpc(async rpc=>{
  const chain=await rpc.getVirtualChainFromBlock({startHash:record.anchor,includeAcceptedTransactionIds:true});
  if(network!==service.network||revision!==service.revision)throw Error('Network changed during receipt check');
  if(!Array.isArray(chain.addedChainBlockHashes)||!Array.isArray(chain.acceptedTransactionIds)||!Array.isArray(chain.removedChainBlockHashes))throw Error('Malformed virtual chain response');
  const added=new Set(chain.addedChainBlockHashes.map(h=>{if(typeof h!=='string'||!HASH.test(h))throw Error('Invalid chain block hash');return h.toLowerCase();}));
  for(const group of chain.acceptedTransactionIds){
   if(typeof group.acceptingBlockHash!=='string'||!added.has(group.acceptingBlockHash.toLowerCase())||!Array.isArray(group.acceptedTransactionIds))throw Error('Acceptance data not bound to added chain block');
   if(group.acceptedTransactionIds.some(id=>typeof id==='string'&&id.toLowerCase()===record.hash.toLowerCase()))return {status:'kaspa-accepted',acceptingBlockHash:group.acceptingBlockHash,checkedAt:new Date().toISOString()};
  }
  return {status:'not-observed',checkedAt:new Date().toISOString()};
 },network);
}
module.exports={kaspaReceipt};
