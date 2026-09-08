const {quantity}=require('./evm.cjs');
const hashPattern=/^0x[0-9a-f]{64}$/i;
async function evmReceipt(service,record){
 const network=service.network,revision=service.revision;
 if(record.family!=='evm'||record.network!==network.id||!hashPattern.test(record.hash))throw Error('Receipt network or identity mismatch');
 const check=()=>{if(service.network!==network||service.revision!==revision)throw Error('Network changed during receipt check');};
 await service.verify(network);check();
 const receipt=await service.rpc('eth_getTransactionReceipt',[record.hash],network);check();
 if(receipt===null)return {status:'not-found',checkedAt:new Date().toISOString()};
 if(!receipt||typeof receipt.transactionHash!=='string'||receipt.transactionHash.toLowerCase()!==record.hash.toLowerCase()||!hashPattern.test(receipt.blockHash))throw Error('Receipt transaction identity mismatch');
 const height=quantity(receipt.blockNumber),status=quantity(receipt.status);
 if(status!==0n&&status!==1n)throw Error('Invalid receipt execution status');
 const [block,tip]=await Promise.all([service.rpc('eth_getBlockByNumber',[receipt.blockNumber,false],network),service.rpc('eth_blockNumber',[],network)]);check();
 if(!block||typeof block.hash!=='string'||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase())return {status:'reorg-or-inconsistent',checkedAt:new Date().toISOString()};
 if(quantity(block.number)!==height||!Array.isArray(block.transactions)||!block.transactions.some(tx=>typeof tx==='string'&&tx.toLowerCase()===record.hash.toLowerCase()))throw Error('Canonical block does not contain this transaction');
 const latest=quantity(tip);if(latest<height)throw Error('RPC head is behind receipt');
 return {status:status===1n?'executed':'reverted',blockHash:receipt.blockHash,blockNumber:height.toString(),confirmations:(latest-height+1n).toString(),checkedAt:new Date().toISOString()};
}
module.exports={evmReceipt};
