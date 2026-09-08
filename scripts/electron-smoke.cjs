// Development-only harness. Not packaged; never uses the real wallet profile.
const {app,session,webContents}=require('electron');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-smoke-'));
app.setPath('userData',profile);app.setPath('sessionData',profile);
const password=crypto.randomBytes(24).toString('hex');
let done=false;
const timeout=setTimeout(()=>finish(Error('Desktop smoke test timed out')),30000);
function finish(error){if(done)return;done=true;clearTimeout(timeout);console.log(error?'FAIL desktop smoke: '+error.message:'PASS desktop smoke: isolated wallet lifecycle, UI, RPC/history and sandboxed dApp provider/alias');app.exit(error?1:0);}
process.on('exit',()=>{fs.rmSync(profile,{recursive:true,force:true});});
app.on('browser-window-created',(_event,window)=>{
 window.webContents.once('did-finish-load',async()=>{
  try{
   const result=await window.webContents.executeJavaScript(`(async()=>{
    const assert=(condition,label)=>{if(!condition)throw Error(label);};
    const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('UI did not initialize');};
    await wait(()=>document.getElementById('rpc-form')&&document.getElementById('history-load')&&document.getElementById('kcc20-load'));
    await refresh();assert(current.locked&&!current.exists,'isolated fresh profile');assert(current.kaspaNetwork==='mainnet','mainnet default');
    assert(document.getElementById('kaspa-network').checkVisibility(),'network selector while locked');
    const password=${JSON.stringify(password)};
    document.getElementById('password').value=password;
    document.getElementById('wallet-form').requestSubmit();
    await wait(()=>current&&!current.locked&&document.getElementById('phrase').textContent.split(' ').length===24);
    assert(document.getElementById('accounts').checkVisibility(),'accounts visible after creation');
    assert(current.accounts.kaspa.address.startsWith('kaspa:'),'mainnet address');
    document.getElementById('backed-up').click();assert(!document.getElementById('phrase').textContent,'backup phrase cleared');
    for(const id of ['send-form','krc20-load','erc20-form','kcc20-load','history-load'])assert(!!document.getElementById(id),id+' missing');
    assert((await window.nexus.invoke('history')).length===0,'fresh history');assert(Object.keys(await window.nexus.invoke('rpc-settings')).length===0,'default RPC settings');
    await window.nexus.invoke('lock');await refresh();assert(current.locked,'wallet locks');
    let rejected=false;try{await window.nexus.invoke('history');}catch{rejected=true;}assert(rejected,'locked history must reject');
    document.getElementById('password').value=password;document.getElementById('wallet-form').requestSubmit();await wait(()=>!current.locked);
    assert(!document.getElementById('phrase').textContent,'unlock must not reveal seed');
    await window.nexus.invoke('lock');await refresh();return {ok:true};
   })()`);
   if(!result.ok)throw Error('Unexpected desktop test result');
   // Controlled HTTPS fixture, served entirely in-process; no real website or node.
   session.fromPartition('persist:dapps').protocol.handle('https',request=>{
    if(new URL(request.url).hostname!=='nexus-smoke.test')return new Response('Blocked by test',{status:403});
    return new Response('<!doctype html><title>Nexus provider fixture</title><p>Isolated provider test</p>',{headers:{'content-type':'text/html'}});
   });
   await window.webContents.executeJavaScript("window.nexus.invoke('browse',{url:'https://nexus-smoke.test/'})");
   const dapp=webContents.getAllWebContents().find(wc=>wc.getURL()==='https://nexus-smoke.test/');
   if(!dapp)throw Error('Embedded dApp view missing');
   await dapp.executeJavaScript(`(async()=>{
    const assert=(ok,label)=>{if(!ok)throw Error(label);};
    assert(typeof window.nexus==='undefined'&&typeof require==='undefined','shell/Node access leaked');
    assert(window.kasware.ethereum===window.ethereum,'EVM alias mismatch');
    assert(window.ethereum.isNexus&&window.ethereum.isKasWare,'provider flags missing');
    assert(await window.kasware.ethereum.request({method:'eth_chainId'})==='0x97b1','default Igra chain mismatch');
    assert((await window.kasware.getAccounts()).length===0,'locked account leaked');
    let rejected=false;try{await window.kasware.signMessage('fixture',{noAuxRand:true});}catch(e){rejected=/Unlock/.test(e.message);}assert(rejected,'locked signing not rejected');
    let discovered;window.addEventListener('eip6963:announceProvider',e=>discovered=e.detail);window.dispatchEvent(new Event('eip6963:requestProvider'));
    assert(discovered?.provider===window.ethereum&&discovered.info.name==='Kaspa Orbit','wallet discovery failed');
   })()`);
   finish();
  }catch(error){finish(error);}
 });
});
require('../desktop/main.cjs');
