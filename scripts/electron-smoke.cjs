// Development-only harness. Not packaged; never uses the real wallet profile.
const {app,session,webContents,dialog}=require('electron');const crypto=require('node:crypto');
const profile=process.env.ORBIT_SMOKE_PROFILE;
if(!profile)throw Error('Use npm run test:desktop to create an isolated disposable profile');
app.setPath('userData',profile);app.setPath('sessionData',profile);
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
    await window.nexus.invoke('lock');await refresh();assert(current.locked,'wallet locks');
    let rejected=false;try{await window.nexus.invoke('history');}catch{rejected=true;}assert(rejected,'locked history must reject');
    document.getElementById('password').value=password;document.getElementById('wallet-form').requestSubmit();await wait(()=>!current.locked);
    assert(!document.getElementById('phrase').textContent,'unlock must not reveal seed');
    document.getElementById('wallet-add').click();await wait(()=>!document.getElementById('wallet-name').hidden);
    document.getElementById('wallet-name').value='Second test wallet';document.getElementById('password').value=password;document.getElementById('password-confirm').value=password;document.getElementById('wallet-form').requestSubmit();
    await wait(()=>current.wallets.length===2&&current.walletId!==firstId);
    assert(current.locked,'added wallet starts locked');document.getElementById('backed-up').click();
    const select=document.getElementById('wallet-select');select.value=firstId;select.dispatchEvent(new Event('change'));await wait(()=>current.walletId===firstId);
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
   const originalDialog=dialog.showMessageBox;let accountApprovals=0;
   dialog.showMessageBox=async(_window,options)=>{
    if(options.message==='https://nexus-smoke.test'&&options.detail==='Allow this site to see your evm address? / 允许网站查看钱包地址？'){
     accountApprovals++;return {response:1};
    }
    return {response:0};
   };
   try{
    await dapp.executeJavaScript(`(async()=>{
     const assert=(ok,label)=>{if(!ok)throw Error(label);};
     assert((await ethereum.request({method:'eth_accounts'})).length===0,'account exposed before connection');
     const permissions=await ethereum.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
     assert(permissions[0]?.parentCapability==='eth_accounts','account permission missing');
     const accounts=await ethereum.request({method:'eth_accounts'});assert(accounts.length===1&&/^0x[0-9a-fA-F]{40}$/.test(accounts[0]),'connected account missing');
     assert((await ethereum.request({method:'wallet_getPermissions'})).length===1,'permission query mismatch');
     let cleared=false;const listener=accounts=>{if(accounts.length===0)cleared=true;};ethereum.on('accountsChanged',listener);
     await ethereum.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]});
     for(let i=0;i<20&&!cleared;i++)await new Promise(r=>setTimeout(r,25));
     ethereum.removeListener('accountsChanged',listener);assert(cleared,'disconnect event missing');
     assert((await ethereum.request({method:'eth_accounts'})).length===0,'account remained connected');
     assert((await ethereum.request({method:'wallet_getPermissions'})).length===0,'permission remained granted');
    })()`);
    if(accountApprovals!==1)throw Error('Unexpected number of connection approvals');
   }finally{dialog.showMessageBox=originalDialog;await window.webContents.executeJavaScript("window.nexus.invoke('lock')");}
   phase('EVM connect/query/revoke lifecycle verified');
   finish();
  }catch(error){finish(error);}
 });
});
require('../desktop/main.cjs');
