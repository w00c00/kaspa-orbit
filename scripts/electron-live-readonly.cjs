// Public-page smoke only. Fresh empty profile; never creates/unlocks a wallet.
const {app,webContents}=require('electron');
const profile=process.env.ORBIT_SMOKE_PROFILE,url=process.argv[2];
if(!profile||!url||new URL(url).protocol!=='https:')throw Error('Use run-desktop-smoke.cjs --live https://public-dapp');
app.setPath('userData',profile);app.setPath('sessionData',profile);
let done=false;
const timer=setTimeout(()=>finish(Error('Public page smoke timed out')),45000);
function finish(error){if(done)return;done=true;clearTimeout(timer);if(error){console.error(error.message);app.exit(1);}else app.quit();}
app.on('browser-window-created',(_event,window)=>{
 window.webContents.once('did-finish-load',async()=>{
  try{
   const state=await window.webContents.executeJavaScript("window.nexus.invoke('status')");
   if(!state.locked||state.exists)throw Error('Empty locked profile required');
   await window.webContents.executeJavaScript(`window.nexus.invoke('browse',{url:${JSON.stringify(url)}})`);
   const page=webContents.getAllWebContents().find(wc=>wc!==window.webContents&&wc.getURL().startsWith('https://'));
   if(!page)throw Error('Public page missing');
   const result=await page.executeJavaScript(`(async()=>{
    if(typeof require!=='undefined'||typeof window.nexus!=='undefined')throw Error('Privileged API exposed');
    if(!window.ethereum||window.kasware?.ethereum!==window.ethereum)throw Error('Provider missing');
    const accounts=await window.ethereum.request({method:'eth_accounts'});
    if(accounts.length)throw Error('Empty profile exposed an account');
    let discovered=false;const listener=e=>{if(e.detail?.info?.rdns==='org.kaspa.nexus'&&e.detail.provider===window.ethereum)discovered=true;};
    window.addEventListener('eip6963:announceProvider',listener);window.dispatchEvent(new Event('eip6963:requestProvider'));window.removeEventListener('eip6963:announceProvider',listener);
    if(!discovered)throw Error('Discovery missing');
    return {url:location.href,title:document.title,ready:document.readyState,emptyAccounts:true,discovered};
   })()`);
   console.log('PASS public page/provider smoke (not connection or transaction validation): '+JSON.stringify(result));finish();
  }catch(error){finish(error);}
 });
});
require('../desktop/main.cjs');
