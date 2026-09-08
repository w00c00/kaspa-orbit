const keys=new Set(['mainnet','testnet-10','igra','igra-testnet','kasplex']);
function endpoint(network,value){
 if(!keys.has(network))throw Error('Unknown RPC network');
 if(value==='')return '';
 if(typeof value!=='string'||value.length>2048)throw Error('Invalid RPC URL');
 const url=new URL(value),kaspa=['mainnet','testnet-10'].includes(network),secure=kaspa?'wss:':'https:',local=kaspa?'ws:':'http:';
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!==secure&&!(url.protocol===local&&loopback))throw Error('Remote RPC requires TLS; plaintext is allowed only on loopback / 远程节点必须加密');
 if(url.username||url.password||url.hash||url.search)throw Error('RPC credentials, query tokens and fragments are not supported');
 return url.href;
}
function overrides(input){const result={};if(input&&typeof input==='object'&&!Array.isArray(input))for(const network of keys){if(input[network])result[network]=endpoint(network,input[network]);}return result;}
module.exports={endpoint,overrides};
