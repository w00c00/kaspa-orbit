// Development-only harness. Not packaged; never uses the real wallet profile.
const {app,session,webContents,dialog}=require('electron');const crypto=require('node:crypto');
const profile=process.env.ORBIT_SMOKE_PROFILE;
if(!profile)throw Error('Use npm run test:desktop to create an isolated disposable profile');
app.setPath('userData',profile);app.setPath('sessionData',profile);
let submittedTransaction;
// No fallback to the network: all main-process fetch calls are intercepted.
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://rpc.igralabs.com:8545')throw Error('Unexpected test fetch destination');
 const request=JSON.parse(options.body),{method,params}=request;
 const results={eth_chainId:'0x97b1',eth_getTransactionCount:'0x0',eth_gasPrice:'0x1',eth_estimateGas:'0x5208',eth_getBalance:'0xde0b6b3a7640000'};
 let result;
 if(method==='eth_sendRawTransaction'){
  if(submittedTransaction)throw Error('Unexpected duplicate test submission');
  submittedTransaction=require('ethers').Transaction.from(params[0]);result=submittedTransaction.hash;
 }else if(Object.hasOwn(results,method))result=results[method];else throw Error('Unexpected test RPC method: '+method);
 return Response.json({jsonrpc:'2.0',id:request.id,result});
};
const password=crypto.randomBytes(24).toString('hex');
const phase=label=>console.log('SMOKE phase: '+label);
phase('temporary profile configured');
let done=false;
const timeout=setTimeout(()=>finish(Error('Desktop smoke test timed out')),30000);
function finish(error){if(done)return;done=true;clearTimeout(timeout);console.log(error?'FAIL desktop smoke: '+error.message:'PASS desktop smoke: isolated wallet lifecycle, UI, RPC/history and sandboxed dApp provider/alias');if(error)app.exit(1);else app.quit();}
app.on('before-quit',()=>phase('normal quit requested'));
app.on('will-quit',()=>phase('windows closed; app will quit'));
process.on('exit',()=>phase('Electron process exit'));
app.on('browser-window-created',(_event,window)=>{
 phase('shell window created');
 window.webContents.on('console-message',event=>{if(event.level==='error')console.error('Renderer error: '+event.message+' '+event.sourceId+':'+event.lineNumber);});
 window.webContents.on('render-process-gone',(_event,details)=>finish(Error('Shell renderer exited: '+details.reason)));
 window.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame)finish(Error('Shell load failed: '+code+' '+description));});
 window.webContents.once('did-finish-load',async()=>{
  phase('shell document loaded');
  try{
   const result=await window.webContents.executeJavaScript(`(async()=>{
    const assert=(condition,label)=>{if(!condition)throw Error(label);};
    const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('UI did not initialize');};
    await wait(()=>document.getElementById('rpc-form')&&document.getElementById('history-load')&&document.getElementById('kcc20-load'));
    await refresh();assert(current.locked&&!current.exists,'isolated fresh profile');assert(current.kaspaNetwork==='mainnet','mainnet default');
    assert(document.getElementById('kaspa-network').checkVisibility(),'network selector while locked');
    const password=${JSON.stringify(password)};
    document.getElementById('wallet-name').value='First test wallet';
    document.getElementById('password-confirm').value=password;
    document.getElementById('password').value=password;
    document.getElementById('wallet-form').requestSubmit();
    await wait(()=>current&&current.exists&&document.getElementById('phrase').textContent.split(' ').length===24);
    assert(current.locked,'new wallet remains locked for backup');
    document.getElementById('backed-up').click();
    document.getElementById('password').value=password;document.getElementById('wallet-form').requestSubmit();await wait(()=>!current.locked);
    assert(document.getElementById('accounts').checkVisibility(),'accounts visible after creation');
    assert(current.accounts.kaspa.address.startsWith('kaspa:'),'mainnet address');
    assert(!!document.getElementById('kcc20-send-form'),'experimental KCC20 form missing');
    let mainnetBlocked=false;try{await window.nexus.invoke('kcc20-send',{});}catch(error){mainnetBlocked=/TN10/.test(error.message);}assert(mainnetBlocked,'experimental token send must reject mainnet before RPC');
    const firstId=current.walletId,firstAddress=current.accounts.kaspa.address;
    document.getElementById('backed-up').click();assert(!document.getElementById('phrase').textContent,'backup phrase cleared');
    for(const id of ['send-form','krc20-load','erc20-form','kcc20-load','history-load'])assert(!!document.getElementById(id),id+' missing');
    assert((await window.nexus.invoke('history')).length===0,'fresh history');assert(Object.keys(await window.nexus.invoke('rpc-settings')).length===0,'default RPC settings');
    for(const id of ['password','password-confirm','recovery-password','import'])document.getElementById(id).value='synthetic-sensitive-marker';
    await window.nexus.invoke('lock');await refresh();assert(current.locked,'wallet locks');
    await wait(()=>['password','password-confirm','recovery-password','import'].every(id=>document.getElementById(id).value===''));
    assert(!document.getElementById('phrase').textContent,'lock clears displayed recovery phrase');
    let rejected=false;try{await window.nexus.invoke('history');}catch{rejected=true;}assert(rejected,'locked history must reject');
    document.getElementById('password').value=password;document.getElementById('wallet-form').requestSubmit();await wait(()=>!current.locked);
    assert(!document.getElementById('phrase').textContent,'unlock must not reveal seed');
    document.getElementById('wallet-add').click();await wait(()=>!document.getElementById('wallet-name').hidden);
    document.getElementById('wallet-name').value='Second test wallet';document.getElementById('password').value=password;document.getElementById('password-confirm').value=password;document.getElementById('wallet-form').requestSubmit();
    await wait(()=>current.wallets.length===2&&current.walletId!==firstId);
    assert(current.locked,'added wallet starts locked');document.getElementById('backed-up').click();
    document.getElementById('recovery-password').value='synthetic-old-wallet-password';
    const select=document.getElementById('wallet-select');select.value=firstId;select.dispatchEvent(new Event('change'));await wait(()=>current.walletId===firstId);
    assert(document.getElementById('recovery-password').value==='','wallet switch clears recovery password');
    document.getElementById('password').value=password;document.getElementById('wallet-form').requestSubmit();await wait(()=>!current.locked);
    assert(current.accounts.kaspa.address===firstAddress,'switch restores original address');
    await window.nexus.invoke('lock');await refresh();return {ok:true};
   })()`);
   if(!result.ok)throw Error('Unexpected desktop test result');
   phase('wallet lifecycle verified');
   // Controlled HTTPS fixture, served entirely in-process; no real website or node.
   session.fromPartition('persist:dapps').protocol.handle('https',request=>{
    if(new URL(request.url).hostname!=='nexus-smoke.test')return new Response('Blocked by test',{status:403});
    return new Response('<!doctype html><title>Nexus provider fixture</title><p>Isolated provider test</p>',{headers:{'content-type':'text/html'}});
   });
   await window.webContents.executeJavaScript("window.nexus.invoke('browse',{url:'https://nexus-smoke.test/'})");
   phase('embedded fixture loaded');
   const dapp=webContents.getAllWebContents().find(wc=>wc.getURL()==='https://nexus-smoke.test/');
   if(!dapp)throw Error('Embedded dApp view missing');
   await dapp.executeJavaScript(`(async()=>{
    const assert=(ok,label)=>{if(!ok)throw Error(label);};
    assert(typeof window.nexus==='undefined'&&typeof require==='undefined','shell/Node access leaked');
    for(const name of ['camera','microphone','geolocation','notifications']){
     const permission=await navigator.permissions.query({name});
     assert(permission.state==='denied','unexpected browser permission: '+name+' '+permission.state);
    }
    assert(window.kasware.ethereum===window.ethereum,'EVM alias mismatch');
    assert(window.ethereum.isNexus&&window.ethereum.isKasWare,'provider flags missing');
    assert(await window.kasware.ethereum.request({method:'eth_chainId'})==='0x97b1','default Igra chain mismatch');
    assert((await window.kasware.getAccounts()).length===0,'locked account leaked');
    let rejected=false;try{await window.kasware.signMessage('fixture',{noAuxRand:true});}catch(e){rejected=/Unlock/.test(e.message);}assert(rejected,'locked signing not rejected');
    let discovered;window.addEventListener('eip6963:announceProvider',e=>discovered=e.detail);window.dispatchEvent(new Event('eip6963:requestProvider'));
    assert(discovered?.provider===window.ethereum&&discovered.info.name==='Kaspa Orbit','wallet discovery failed');
   })()`);
   phase('isolated provider verified');
   await window.webContents.executeJavaScript(`window.nexus.invoke('unlock',{password:${JSON.stringify(password)}})`);
   const expectedAccount=(await window.webContents.executeJavaScript("window.nexus.invoke('status')")).accounts.evm;
   const expectedKaspa=(await window.webContents.executeJavaScript("window.nexus.invoke('status')")).accounts.kaspa;
   const kaspaMessage='Orbit isolated Kaspa login test / 本地签名测试';
   const kaspaReview=`Sign Kaspa message / 签署 Kaspa 消息\nKIP-5 · Schnorr (hex)\n${expectedKaspa.address}\n${kaspaMessage}`;
   let kaspaConnections=0,kaspaSignatures=0;
   const testMessage='Orbit isolated desktop signature test',messageHex='0x'+Buffer.from(testMessage).toString('hex');
   const expectedReview=`Sign message / 签署消息\nAccount: ${expectedAccount}\n${testMessage}\n\nHex: ${messageHex}`;
   const typed={domain:{name:'Orbit isolated test',version:'1',chainId:38833},types:{TestMessage:[{name:'note',type:'string'}]},primaryType:'TestMessage',message:{note:'No asset authorization; offline test only'}};
   const typedReview=`Sign typed data / 签署结构化数据\nIgra Mainnet\n${JSON.stringify(typed,null,2)}`;
   const transactionReview=`Igra Mainnet\nFrom / 发出: ${expectedAccount}\nTo / 接收: ${expectedAccount}\nValue / 金额: 0.000000000000000001 iKAS\nMaximum fee / 最高手续费: 0.0000000000000252 iKAS\nNonce: 0\nData / 调用数据: 0x`;
   const originalDialog=dialog.showMessageBox;let accountApprovals=0,messageApprovals=0,typedApprovals=0,transactionApprovals=0;
   dialog.showMessageBox=async(_window,options)=>{
    if(options.message==='https://nexus-smoke.test'&&options.detail==='Allow this site to see your kaspa address? / 允许网站查看钱包地址？'){kaspaConnections++;return {response:1};}
    if(options.message==='https://nexus-smoke.test'&&options.detail===kaspaReview){kaspaSignatures++;return {response:1};}
    if(options.message==='https://nexus-smoke.test'&&options.detail==='Allow this site to see your evm address? / 允许网站查看钱包地址？'){
     accountApprovals++;return {response:1};
    }
    if(options.message==='https://nexus-smoke.test'&&options.detail===expectedReview){messageApprovals++;return {response:1};}
    if(options.message==='https://nexus-smoke.test'&&options.detail===typedReview){typedApprovals++;return {response:1};}
    if(options.message==='https://nexus-smoke.test'&&options.detail===transactionReview){transactionApprovals++;return {response:1};}
    return {response:0};
   };
   try{
    const native=await dapp.executeJavaScript(`(async()=>{
     const assert=(ok,label)=>{if(!ok)throw Error(label);};
     assert((await kasware.getAccounts()).length===0,'Kaspa account leaked before approval');
     const accounts=await kasware.requestAccounts();
     assert(accounts.length===1,'Kaspa connection account missing');
     assert((await ethereum.request({method:'eth_accounts'})).length===0,'Kaspa approval also authorized EVM');
     const publicKey=await kasware.getPublicKey();
     const signature=await kasware.signMessage(${JSON.stringify(kaspaMessage)},{type:'schnorr',noAuxRand:true});
     let cleared=false;const listener=accounts=>{if(accounts.length===0)cleared=true;};kasware.on('accountsChanged',listener);
     await kasware.disconnect();
     for(let i=0;i<20&&!cleared;i++)await new Promise(r=>setTimeout(r,25));
     kasware.removeListener('accountsChanged',listener);
     assert(cleared&&(await kasware.getAccounts()).length===0,'Kaspa disconnect failed');
     let denied=false;try{await kasware.signMessage('after revocation');}catch(error){denied=error.code===4100;}
     assert(denied,'Kaspa signing allowed after revocation');
     return {address:accounts[0],publicKey,signature};
    })()`);
    const wasm=require('@kluster/kaspa-wasm');
    if(kaspaConnections!==1||kaspaSignatures!==1||native.address!==expectedKaspa.address||native.publicKey!==expectedKaspa.publicKey||!wasm.verifyMessage({message:kaspaMessage,signature:native.signature,publicKey:native.publicKey})||wasm.verifyMessage({message:kaspaMessage+'altered',signature:native.signature,publicKey:native.publicKey}))throw Error('Desktop Kaspa signature/permission verification failed');
    phase('Kaspa connect/sign/verify/disconnect lifecycle verified');
    const connection=await dapp.executeJavaScript(`(async()=>{
     const assert=(ok,label)=>{if(!ok)throw Error(label);};
     assert((await ethereum.request({method:'eth_accounts'})).length===0,'account exposed before connection');
     const permissions=await ethereum.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
     assert(permissions[0]?.parentCapability==='eth_accounts','account permission missing');
     const accounts=await ethereum.request({method:'eth_accounts'});assert(accounts.length===1&&/^0x[0-9a-fA-F]{40}$/.test(accounts[0]),'connected account missing');
     assert((await ethereum.request({method:'wallet_getPermissions'})).length===1,'permission query mismatch');
     const signature=await ethereum.request({method:'personal_sign',params:[${JSON.stringify(messageHex)},accounts[0]]});
     const typed=${JSON.stringify(typed)},wrong={...typed,domain:{...typed.domain,chainId:1}};
     let rejected=false;try{await ethereum.request({method:'eth_signTypedData_v4',params:[accounts[0],JSON.stringify(wrong)]});}catch(error){rejected=/chain mismatch/.test(error.message);}assert(rejected,'wrong-chain typed signing accepted');
     const typedSignature=await ethereum.request({method:'eth_signTypedData_v4',params:[accounts[0],JSON.stringify(typed)]});
     const transactionHash=await ethereum.request({method:'eth_sendTransaction',params:[{from:accounts[0],to:accounts[0],value:'0x1'}]});
     let cleared=false;const listener=accounts=>{if(accounts.length===0)cleared=true;};ethereum.on('accountsChanged',listener);
     await ethereum.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]});
     for(let i=0;i<20&&!cleared;i++)await new Promise(r=>setTimeout(r,25));
     ethereum.removeListener('accountsChanged',listener);assert(cleared,'disconnect event missing');
     assert((await ethereum.request({method:'eth_accounts'})).length===0,'account remained connected');
     assert((await ethereum.request({method:'wallet_getPermissions'})).length===0,'permission remained granted');
     return {account:accounts[0],signature,typedSignature,transactionHash};
    })()`);
    if(accountApprovals!==1)throw Error('Unexpected number of connection approvals');
    if(messageApprovals!==1||connection.account!==expectedAccount||require('ethers').verifyMessage(testMessage,connection.signature)!==expectedAccount)throw Error('Desktop signature verification failed');
    if(typedApprovals!==1||require('ethers').verifyTypedData(typed.domain,typed.types,typed.message,connection.typedSignature)!==expectedAccount)throw Error('Desktop typed signature verification failed');
    if(transactionApprovals!==1||submittedTransaction?.hash!==connection.transactionHash||submittedTransaction.from!==expectedAccount||submittedTransaction.to!==expectedAccount||submittedTransaction.value!==1n||submittedTransaction.chainId!==38833n)throw Error('Mock-RPC desktop transaction mismatch');
   }finally{dialog.showMessageBox=originalDialog;await window.webContents.executeJavaScript("window.nexus.invoke('lock')");}
   phase('EVM connect/sign/verify/revoke lifecycle verified');
   const exited=new Promise(resolve=>dapp.once('render-process-gone',resolve));
   dapp.forcefullyCrashRenderer();await exited;
   await window.webContents.executeJavaScript(`(async()=>{
    for(let i=0;i<100;i++){
     if([...document.querySelectorAll('#tabs button')].some(button=>button.title.includes('Page process exited; reload')))return;
     await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw Error('Renderer exit guidance missing from wallet UI');
   })()`);
   const reloaded=new Promise(resolve=>dapp.once('did-finish-load',resolve));
   dapp.reload();await reloaded;
   await dapp.executeJavaScript(`(async()=>{
    if(!window.kasware||!window.ethereum)throw Error('Provider missing after crash reload');
    if((await kasware.getAccounts()).length||(await ethereum.request({method:'eth_accounts'})).length)throw Error('Locked account leaked after crash reload');
   })()`);
   phase('Real isolated renderer crash and reload verified');
   finish();
  }catch(error){finish(error);}
 });
});
require('../desktop/main.cjs');
