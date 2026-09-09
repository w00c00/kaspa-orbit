const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('injected provider discovers, reports errors and removes event listeners',async()=>{
  const events=new Map(),announced=[],callbacks=[],requests=[];
  const window={addEventListener:(type,fn)=>events.set(type,fn),dispatchEvent:event=>{if(event.type==='eip6963:announceProvider')announced.push(event.detail);}};
  const context=vm.createContext({window,crypto:require('node:crypto').webcrypto,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},console});
  const electron={contextBridge:{exposeInMainWorld:(key,value)=>window[key]=value,executeInMainWorld:({func})=>vm.runInContext(`(${func.toString()})()`,context)},ipcRenderer:{invoke:async(_channel,request)=>{requests.push(request);return request.method==='eth_chainId'?{result:'0x97b4'}:{error:{code:4001,message:'Rejected'}};},on:(_channel,fn)=>{callbacks.push(fn);}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../desktop/dapp-preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return electron;}});
  assert.equal(announced.length,1);assert.equal(announced[0].provider,window.ethereum);events.get('eip6963:requestProvider')();assert.equal(announced.length,2);
  assert.equal(await window.ethereum.request({method:'eth_chainId'}),'0x97b4');
  for(const invalid of [null,undefined,[],42])await assert.rejects(window.ethereum.request(invalid),error=>error.code===-32602);
  const originalInvoke=electron.ipcRenderer.invoke;
  const {BrowserProvider,Wallet,getBytes,verifyMessage}=require('ethers');
  const wallet=Wallet.createRandom();
  electron.ipcRenderer.invoke=async(_channel,{family,method,params})=>{
    assert.equal(family,'evm');
    if(method==='eth_chainId')return {result:'0x97b4'};
    if(method==='eth_accounts'||method==='eth_requestAccounts')return {result:[wallet.address]};
    if(method==='eth_getBalance')return {result:'0x2a'};
    if(method==='personal_sign'){assert.equal(params[1].toLowerCase(),wallet.address.toLowerCase());return {result:await wallet.signMessage(getBytes(params[0]))};}
    return {error:{code:4200,message:'Unsupported method'}};
  };
  const client=new BrowserProvider(window.ethereum);
  try{
    assert.equal((await client.getNetwork()).chainId,38836n);
    const signer=await client.getSigner();assert.equal(await signer.getAddress(),wallet.address);
    assert.equal(await client.getBalance(wallet.address),42n);
    const signature=await signer.signMessage('Orbit compatibility test');
    assert.equal(verifyMessage('Orbit compatibility test',signature),wallet.address);
  }finally{client.destroy();electron.ipcRenderer.invoke=originalInvoke;}
  electron.ipcRenderer.invoke=async()=>({error:{code:3,message:'execution reverted',data:'0xdeadbeef'}});
  await assert.rejects(window.ethereum.request({method:'eth_call',params:[]}),error=>error.code===3&&error.data==='0xdeadbeef');
  electron.ipcRenderer.invoke=originalInvoke;
  const named={transaction:{to:'0x0000000000000000000000000000000000000001'},block:'latest'};
  await assert.rejects(window.ethereum.request({method:'eth_call',params:named}),error=>error.code===4001);
  assert.deepEqual(requests.at(-1).params,named);
  for(const params of [null,1,'invalid'])await assert.rejects(window.ethereum.request({method:'eth_call',params}),error=>error.code===-32602);
  await assert.rejects(window.kasware.request({method:'signMessage',params:{message:'hi'}}),error=>error.code===-32602);
  await assert.rejects(window.ethereum.request({method:'eth_requestAccounts'}),error=>error.code===4001);
  let changes=0;const listener=()=>changes++;assert.equal(window.ethereum.on('accountsChanged',listener),window.ethereum);
  callbacks[0](null,{family:'evm',event:'accountsChanged',value:[]});assert.equal(changes,1);
  window.ethereum.removeListener('accountsChanged',listener);callbacks[0](null,{family:'evm',event:'accountsChanged',value:[]});assert.equal(changes,1);
  assert.equal(typeof window.kasware.requestAccounts,'function');
  assert.equal(window.kasware.ethereum,window.ethereum);assert.equal(window.kasware.ethereum.isKasWare,true);
  assert.equal(await window.kasware.ethereum.request({method:'eth_chainId'}),'0x97b4');
  assert.equal(Object.getOwnPropertyDescriptor(window.kasware,'ethereum').writable,false);
  await assert.rejects(window.kasware.signMessage('hello',{type:'schnorr',noAuxRand:true}),error=>error.code===4001);
  assert.equal(JSON.stringify(requests.at(-1)),JSON.stringify({family:'kaspa',method:'signMessage',params:['hello',{type:'schnorr',noAuxRand:true}]}));
  await assert.rejects(window.kasware.signKRC20Transaction('inscription',4,'destination',0),error=>error.code===4001);
  assert.equal(JSON.stringify(requests.at(-1)),JSON.stringify({family:'kaspa',method:'signKRC20Transaction',params:['inscription',4,'destination',0]}));
  assert.equal(typeof window.kasware.disconnect,'function');
  assert.equal(typeof window.kasware.switchNetwork,'function');
  await assert.rejects(window.kasware.switchNetwork('testnet-10'),error=>error.code===4001);
});
