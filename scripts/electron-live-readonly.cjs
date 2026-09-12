// Public-page smoke defaults to a locked empty profile.
// --connect-empty explicitly creates an ephemeral unfunded wallet and permits
// one exact-origin EVM address disclosure only; all signing approvals are denied.
const {app,webContents,dialog}=require('electron');
const profile=process.env.ORBIT_SMOKE_PROFILE,url=process.argv[2];
if(!profile||!url||new URL(url).protocol!=='https:')throw Error('Use run-desktop-smoke.cjs --live https://public-dapp');
const connectEmpty=process.argv.includes('--connect-empty');let approvals=0;
if(connectEmpty){
 if(new URL(url).origin!=='https://defi.kaspa.com'||!process.argv.includes('--wallet-picker'))throw Error('Empty-wallet connection is scoped to the KaspaCom picker');
 dialog.showMessageBox=async(_window,options)=>{
  const allowed=options.message==='https://defi.kaspa.com'&&options.detail==='Allow this site to see your evm address? / 允许网站查看钱包地址？'&&approvals===0;
  if(allowed)approvals++;return {response:allowed?1:0};
 };
}
app.setPath('userData',profile);app.setPath('sessionData',profile);
let done=false;
const timer=setTimeout(()=>finish(Error('Public page smoke timed out')),45000);
function finish(error){if(done)return;done=true;clearTimeout(timer);if(error){console.error(error.message);app.exit(1);}else app.quit();}
app.on('browser-window-created',(_event,window)=>{
 window.webContents.once('did-finish-load',async()=>{
  try{
   const state=await window.webContents.executeJavaScript("window.nexus.invoke('status')");
   if(!state.locked||state.exists)throw Error('Empty locked profile required');
   if(connectEmpty){
    const password=require('node:crypto').randomBytes(24).toString('hex');
    await window.webContents.executeJavaScript(`(async()=>{await window.nexus.invoke('wallet-add',{name:'Disposable website test',password:${JSON.stringify(password)}});await window.nexus.invoke('unlock',{password:${JSON.stringify(password)}});return true;})()`);
   }
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
    // Document load can precede SPA hydration. Observe the UI separately.
    for(let i=0;i<100&&!document.querySelector('button');i++)await new Promise(r=>setTimeout(r,100));
    return {url:location.href,title:document.title,ready:document.readyState,emptyAccounts:true,discovered,
      visibleButtons:[...document.querySelectorAll('button')].filter(b=>b.checkVisibility()).slice(0,30).map(b=>b.innerText.trim()).filter(Boolean)};
   })()`);
   console.log('PASS public page/provider smoke (not connection or transaction validation): '+JSON.stringify(result));
   if(process.argv.includes('--wallet-picker')){
    if(!['app.zealousswap.com','defi.kaspa.com'].includes(new URL(page.getURL()).hostname))throw Error('Wallet picker probe is scoped to verified public dApps');
    const picker=await page.executeJavaScript(`(async()=>{
     const button=[...document.querySelectorAll('button')].find(b=>b.checkVisibility()&&['连接','Connect','Connect Wallet'].includes(b.innerText.trim()));
     if(!button)throw Error('Observed connect control missing');button.click();
     // WalletConnect/AppKit components often render inside open shadow roots.
     // Inspect only rendered text; never select a wallet or approve a request.
     function snapshot(){const roots=[];let visited=0;function scan(root){for(const element of root.querySelectorAll('*')){if(++visited>20000)return;if(element.shadowRoot){roots.push({host:element.tagName,text:[...element.shadowRoot.children].filter(e=>!['STYLE','SCRIPT'].includes(e.tagName)).map(e=>e.innerText||'').join(' ').slice(0,4000)});scan(element.shadowRoot);}}}scan(document);return {text:document.body.innerText.slice(0,6000),shadowRoots:roots.slice(0,30)};}
     let observation;
     for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));observation=snapshot();if(JSON.stringify(observation).includes('Kaspa Orbit'))break;}
     return observation;
    })()`);
    console.log('Wallet picker observation only: '+JSON.stringify(picker));
    if(connectEmpty){
     await page.executeJavaScript(`(()=>{function find(root){for(const button of root.querySelectorAll('button'))if(button.checkVisibility()&&button.innerText.trim()==='Kaspa Orbit')return button;for(const element of root.querySelectorAll('*'))if(element.shadowRoot){const button=find(element.shadowRoot);if(button)return button;}}const button=find(document);if(!button)throw Error('Observed Orbit wallet option missing');button.click();})()`);
     for(let i=0;i<50&&!approvals;i++)await new Promise(r=>setTimeout(r,100));
     const permissions=await window.webContents.executeJavaScript("window.nexus.invoke('permissions')");
     const accounts=await page.executeJavaScript("window.ethereum.request({method:'eth_accounts'})");
     if(approvals!==1||accounts.length!==1||!permissions.some(p=>p.origin==='https://defi.kaspa.com'&&p.family==='evm'))throw Error('Website connection not established');
     await window.webContents.executeJavaScript("window.nexus.invoke('disconnect')");
     if((await page.executeJavaScript("window.ethereum.request({method:'eth_accounts'})")).length)throw Error('Disconnect did not clear accounts');
     await window.webContents.executeJavaScript("window.nexus.invoke('lock')");
     console.log('PASS real KaspaCom picker initiated account permission; disconnect cleared accounts. Ephemeral empty wallet only; all other approvals denied.');
    }
   }
   finish();
  }catch(error){finish(error);}
 });
});
require('../desktop/main.cjs');
