const $=id=>document.getElementById(id);let current;
let addingWallet=false;
const manager=document.createElement('section');
manager.innerHTML='<h2>钱包管理 / Wallets</h2><select id="wallet-select" aria-label="选择钱包 / Select wallet"></select><button id="wallet-add" class="secondary">＋ 新建或导入 / Add wallet</button><form id="wallet-rename-form"><input id="wallet-label" maxlength="50" required placeholder="钱包名称 / Wallet name"><button>重命名 / Rename</button></form>';
$('onboarding').before(manager);
const walletName=document.createElement('input');walletName.id='wallet-name';walletName.maxLength=50;walletName.placeholder='新钱包名称 / New wallet name';$('wallet-form').prepend(walletName);
const confirmPassword=document.createElement('input');confirmPassword.id='password-confirm';confirmPassword.type='password';confirmPassword.placeholder='再次输入密码 / Confirm password';$('password').after(confirmPassword);
const cancelAdd=document.createElement('button');cancelAdd.type='button';cancelAdd.textContent='取消添加 / Cancel';cancelAdd.hidden=true;$('wallet-form').append(cancelAdd);
const recoveryForm=document.createElement('form');recoveryForm.innerHTML='<details><summary>重新备份助记词 / Recovery phrase</summary><p>请在私密环境操作，切勿分享给网站或他人。<br>Keep private. Never share with websites or anyone.</p><input id="recovery-password" type="password" minlength="10" required placeholder="验证当前钱包密码 / Current wallet password"><button>验证并显示 / Verify & reveal</button></details>';manager.append(recoveryForm);
recoveryForm.onsubmit=e=>{e.preventDefault();action(async()=>{const password=$('recovery-password').value;$('recovery-password').value='';const result=await window.nexus.invoke('wallet-recovery',{password});$('phrase').textContent=result.phrase;$('recovery').hidden=false;});};
function clearSecrets(){$('password').value='';$('password-confirm').value='';$('import').value='';$('phrase').textContent='';$('recovery').hidden=true;}
cancelAdd.onclick=()=>{addingWallet=false;clearSecrets();action(refresh);};
$('wallet-add').onclick=()=>{addingWallet=true;clearSecrets();$('wallet-name').value='';action(refresh);};
$('wallet-select').onchange=()=>action(async()=>{addingWallet=false;clearSecrets();await window.nexus.invoke('wallet-select',{id:$('wallet-select').value});await refresh();});
$('wallet-rename-form').onsubmit=e=>{e.preventDefault();action(async()=>{await window.nexus.invoke('wallet-rename',{name:$('wallet-label').value});await refresh();});};
async function action(fn){try{$('status').textContent='';await fn();}catch(e){$('status').textContent=e.message;}}
async function refresh(){current=await window.nexus.invoke('status');const adding=addingWallet||!current.exists;$('onboarding').hidden=!current.locked&&!adding;$('accounts').hidden=current.locked||adding;$('import').hidden=!adding;$('wallet-name').hidden=!adding;$('wallet-name').required=adding;$('password-confirm').hidden=!adding;$('password-confirm').required=adding;cancelAdd.hidden=!addingWallet;$('submit').textContent=adding?'创建 / 导入 · Create / Import':'解锁钱包 / Unlock wallet';$('wallet-select').replaceChildren(...(current.wallets||[]).map(w=>{const o=document.createElement('option');o.value=w.id;o.textContent=w.name;o.selected=w.id===current.walletId;return o;}));$('wallet-rename-form').hidden=!(current.wallets||[]).length;$('wallet-label').value=(current.wallets||[]).find(w=>w.id===current.walletId)?.name||'';if(current.accounts){$('kaspa-address').textContent=current.accounts.kaspa.address;$('evm-address').textContent=current.accounts.evm;}}
$('wallet-form').onsubmit=e=>{e.preventDefault();action(async()=>{const password=$('password').value,phrase=$('import').value,adding=addingWallet||!current.exists;if(adding&&password!==$('password-confirm').value)throw Error('两次密码不一致 / Passwords do not match');const name=$('wallet-name').value;clearSecrets();$('submit').disabled=true;try{if(!adding)await window.nexus.invoke('unlock',{password});else{const result=await window.nexus.invoke('wallet-add',{name,password,phrase});addingWallet=false;if(result.phrase){$('phrase').textContent=result.phrase;$('recovery').hidden=false;}$('status').textContent='钱包已保存，请备份后解锁 / Wallet saved. Back up, then unlock.';}await refresh();}finally{$('submit').disabled=false;}});};
$('backed-up').onclick=()=>{$('phrase').textContent='';$('recovery').hidden=true;};
$('lock').onclick=()=>action(async()=>{await window.nexus.invoke('lock');$('phrase').textContent='';$('recovery').hidden=true;await refresh();});
$('disconnect').onclick=()=>action(async()=>{await window.nexus.invoke('disconnect');$('status').textContent='已断开所有网站 / All sites disconnected';});
for(const id of ['kaspa-address','evm-address'])$(id).onclick=()=>action(async()=>{await navigator.clipboard.writeText($(id).textContent);$('status').textContent='已复制 / Copied';});
$('browser-form').onsubmit=e=>{e.preventDefault();action(()=>window.nexus.invoke('browse',{url:$('url').value.includes('://')?$('url').value:`https://${$('url').value}`}));};
const originalRefresh=refresh;
let displayedContext='';
function syncNetworkContext(){
 const context=JSON.stringify([current.kaspaNetwork,current.network.id,current.locked,current.accounts?.kaspa.address]);
 if(displayedContext!==context){
  displayedContext=context;
  for(const id of ['krc20-list','kcc20-list','erc20-result','krc-send-panel','krc-recover-list','transfer-result','history-list'])$(id)?.replaceChildren();
  for(const id of ['balance','kaspa-balance'])if($(id))$(id).textContent='—';
  if($('krc20-next'))$('krc20-next').hidden=true;
  if($('kcc20-send-form'))$('kcc20-send-form').reset();
  if($('kcc20-send-status'))$('kcc20-send-status').textContent='';
 }
 if($('network-note'))$('network-note').textContent=current.kaspaNetwork==='mainnet'?'主网 · 真实资产，请核对交易 / Mainnet · Real funds':'TN10 · 仅测试资产 / Test assets only';
}
refresh=async()=>{await originalRefresh();syncNetworkContext();const label=current.kaspaNetwork==='mainnet'?'Kaspa 主网 / Mainnet':'Kaspa TN10 / Testnet';document.querySelector('.badge').textContent=label+' · Development';document.querySelector('#accounts label').textContent=label;if($('kaspa-network'))$('kaspa-network').value=current.kaspaNetwork;$('network').replaceChildren(...current.networks.map(network=>{const option=document.createElement('option');option.value='0x'+network.chainId.toString(16);option.textContent=network.name;option.selected=network.id===current.network.id;return option;}));};
$('network').onchange=()=>action(async()=>{try{await window.nexus.invoke('network',{chainId:$('network').value});$('balance').textContent='—';}finally{await refresh();}});
$('refresh-balance').onclick=()=>action(async()=>{$('balance').textContent='查询中 / Loading…';try{const result=await window.nexus.invoke('balance');$('balance').textContent=`${result.balance} ${result.symbol}`;}catch(e){$('balance').textContent='不可用 / Unavailable';throw e;}});
for(const id of ['back','forward','reload'])$(id).onclick=()=>action(()=>window.nexus.invoke(id));
window.nexus.onBrowser(({url})=>{$('url').value=url;});
action(refresh);
const browserScript=document.createElement('script');browserScript.src='browser.js';document.head.append(browserScript);
const kccScript=document.createElement('script');kccScript.src='kcc20.js';document.head.append(kccScript);
const historyScript=document.createElement('script');historyScript.src='history.js';const pollerScript=document.createElement('script');pollerScript.src='poller.js';pollerScript.onload=()=>document.head.append(historyScript);document.head.append(pollerScript);
const nodeScript=document.createElement('script');nodeScript.src='nodes.js';document.head.append(nodeScript);
