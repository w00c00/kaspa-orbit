const {Interface,getAddress,formatUnits,parseUnits,ZeroAddress}=require('ethers');
const {addressFor}=require('./kaspa.cjs');
const ERC20=new Interface(['function symbol() view returns (string)','function decimals() view returns (uint8)','function balanceOf(address) view returns (uint256)','function transfer(address,uint256) returns (bool)']);
async function erc20Holding(evm,contract,owner){
 contract=getAddress(contract);owner=getAddress(owner);const network=evm.network,revision=evm.revision;
 const call=async(name,args=[])=>ERC20.decodeFunctionResult(name,await evm.read('eth_call',[{to:contract,data:ERC20.encodeFunctionData(name,args)},'latest']))[0];
 const [symbol,decimals,amount]=await Promise.all([call('symbol'),call('decimals'),call('balanceOf',[owner])]);
 if(evm.revision!==revision)throw Error('Network changed during token query');
 if(typeof symbol!=='string'||symbol.length>80||decimals>255n)throw Error('Invalid token metadata');
 return {kind:'erc20',contract,network:network.id,chainId:network.chainId,symbol,decimals:Number(decimals),amount:String(amount),balance:formatUnits(amount,decimals)};
}
async function krc20Holdings(network,address,next='',transport=fetch){
 addressFor(address,network);
 if(typeof next!=='string'||next.length>2048)throw Error('Invalid pagination cursor');
 const base=network==='mainnet'?'https://api.kasplex.org':'https://tn10api.kasplex.org';
 // addressFor has validated the address. Kasplex expects the literal prefix
 // colon in this path; percent-encoding it returns HTTP 403 "address invalid".
 const url=new URL(`/v1/krc20/address/${address}/tokenlist`,base);if(next)url.searchParams.set('next',next);
 const response=await transport(url,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok)throw Error(`KRC20 indexer HTTP ${response.status}`);
 const body=await response.json();if(!Array.isArray(body.result))throw Error('Invalid KRC20 indexer response');
 const tokens=body.result.map(item=>{
   const decimals=Number(item.dec);if(!Number.isInteger(decimals)||decimals<0||decimals>18||!/^\d+$/.test(item.balance)||!/^\d+$/.test(item.locked))throw Error('Invalid KRC20 token amount');
   const symbol=item.tick||item.ca;if(typeof symbol!=='string'||symbol.length>128)throw Error('Invalid KRC20 identity');
   return {kind:'krc20',symbol,contract:item.ca||null,decimals,amount:item.balance,locked:item.locked,balance:formatUnits(item.balance,decimals),lockedBalance:formatUnits(item.locked,decimals)};
 });
 return {network,source:base,tokens,next:typeof body.next==='string'?body.next:''};
}
async function prepareErc20Transfer(evm,{contract,recipient,amount,chainId,decimals},owner){
 if(chainId!==evm.network.chainId)throw Error('Token network changed; query the token again / 请在当前网络重新查询代币');
 const revision=evm.revision,token=await erc20Holding(evm,contract,owner);
 if(token.decimals!==decimals)throw Error('Token decimals changed; query again / 代币精度已变化');
 if(typeof amount!=='string'||amount.length>100||! /^(0|[1-9]\d*)(\.\d+)?$/.test(amount))throw Error('Invalid token amount');
 const value=parseUnits(amount,token.decimals);if(value<=0n||value>BigInt(token.amount))throw Error('Insufficient token balance or invalid amount / 代币余额不足或金额无效');
 recipient=getAddress(recipient);if(recipient===ZeroAddress)throw Error('Cannot transfer to zero address');
 const data=ERC20.encodeFunctionData('transfer',[recipient,value]);
 const simulation=await evm.read('eth_call',[{from:owner,to:token.contract,data},'pending']);
 if(simulation!=='0x'&&!ERC20.decodeFunctionResult('transfer',simulation)[0])throw Error('Token transfer simulation returned false');
 if(evm.revision!==revision)throw Error('Network changed during token preparation');
 const prepared=await evm.prepare({from:owner,to:token.contract,value:'0x0',data},owner);
 if(prepared.revision!==revision)throw Error('Network changed during token preparation');
 return Object.freeze({...prepared,summary:`Token transfer / 代币转账\nToken / 代币: ${token.symbol}\nContract / 合约: ${token.contract}\nRecipient / 接收人: ${recipient}\nAmount / 金额: ${formatUnits(value,token.decimals)} ${token.symbol}\nToken may apply transfer fees / 代币合约可能扣取转账税\n\n${prepared.summary}`});
}
module.exports={ERC20,erc20Holding,krc20Holdings,prepareErc20Transfer};
