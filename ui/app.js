const $=id=>document.getElementById(id);let current;
async function action(fn){try{$('status').textContent='';await fn();}catch(e){$('status').textContent=e.message;}}
async function refresh(){current=await window.nexus.invoke('status');$('onboarding').hidden=!current.locked;$('accounts').hidden=current.locked;$('import').hidden=current.exists;$('submit').textContent=current.exists?'解锁钱包 / Unlock wallet':'创建钱包 / Create wallet';if(current.accounts){$('kaspa-address').textContent=current.accounts.kaspa.address;$('evm-address').textContent=current.accounts.evm;}}
$('wallet-form').onsubmit=e=>{e.preventDefault();action(async()=>{const password=$('password').value,phrase=$('import').value;$('password').value='';$('import').value='';if(current.exists)await window.nexus.invoke('unlock',{password});else{const result=await window.nexus.invoke('create',{password,phrase});if(result.phrase){$('phrase').textContent=result.phrase;$('recovery').hidden=false;}}await refresh();});};
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
