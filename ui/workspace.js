// Presentation state is separate from the backend's two network connections.
// Never infer a transfer network from an address or a token ticker.
let walletPage='assets',assetKind='native',walletFamily='kaspa';
const walletNav=document.createElement('nav');walletNav.className='wallet-nav';walletNav.setAttribute('aria-label','钱包页面 / Wallet pages');
for(const [key,label] of [['assets','资产 / Assets'],['activity','记录 / Activity'],['settings','设置 / Settings']]){const button=document.createElement('button');button.textContent=label;button.dataset.page=key;button.onclick=()=>{walletPage=key;renderWorkspace();};walletNav.append(button);}
$('accounts').before(walletNav);
const pages={};for(const key of ['assets','activity','settings']){const section=document.createElement('div');section.id='wallet-'+key;pages[key]=section;$('accounts').append(section);}
const familyLabel=document.createElement('label');familyLabel.textContent='当前资产网络 / Asset network';
const familySelect=document.createElement('select');familySelect.id='wallet-family';familySelect.innerHTML='<option value="kaspa">Kaspa L1 · KAS / KRC20 / KCC20</option><option value="evm">EVM · Igra / Kasplex</option>';
networkPanel.prepend(familyLabel,familySelect);networkHeading.hidden=true;
const evmNetworkLabel=$('evm-address').previousElementSibling.previousElementSibling;evmNetworkLabel.hidden=true;
networkPanel.append($('network'));
const contextLabel=document.createElement('p');contextLabel.id='asset-context';pages.assets.append(contextLabel);
const kaspaLabel=$('kaspa-address').previousElementSibling;kaspaLabel.id='kaspa-account-label';
pages.assets.append(kaspaLabel,$('kaspa-address'),$('evm-address'),$('kaspa-balance'),$('kaspa-refresh'),$('balance'),$('refresh-balance'));
const receiveHint=document.createElement('p');receiveHint.textContent='点击地址接收 · 请核对网络 / Copy address to receive · Check network';pages.assets.append(receiveHint);
const assetNav=document.createElement('nav');assetNav.className='asset-nav';pages.assets.append(assetNav);
for(const [key,label] of [['native','KAS'],['krc20','KRC20'],['kcc20','KCC20'],['erc20','ERC20']]){const button=document.createElement('button');button.dataset.asset=key;button.textContent=label;button.onclick=()=>{assetKind=key;renderWorkspace();};assetNav.append(button);}
const ercPanel=document.createElement('section');ercPanel.append($('erc20-form'),$('erc20-result'));pages.assets.append(controls,tokenSection,ercPanel);
tokenSection.querySelector('h2').textContent='KRC20 · Kaspa L1';tokenSection.querySelector('p').textContent='Kaspa L1 资产，由 Kasplex 索引器查询；不是 Kasplex EVM 链。 / Kaspa L1 assets via the Kasplex indexer, not the Kasplex EVM chain.';
$('send-family').hidden=true;
const manage=document.createElement('details');manage.className='wallet-management';const summary=document.createElement('summary');summary.textContent='＋ 添加 / 管理钱包 · Add / Manage';manage.append(summary,$('wallet-add'),$('wallet-rename-form'),recoveryForm);manager.append(manage);document.querySelector('.badge').before(manager);manager.className='wallet-manager';
pages.settings.append($('disconnect'));pages.settings.append(buildLabel);
const lockRow=document.createElement('div');lockRow.className='lock-row';lockRow.append($('lock'));$('accounts').after(lockRow);
// Remove obsolete headings/copy hints after the existing controls have moved.
for(const child of [...$('accounts').children])if(['H2','LABEL','P'].includes(child.tagName))child.remove();
familySelect.onchange=()=>{walletFamily=familySelect.value;assetKind='native';$('send-form').reset();$('transfer-result').replaceChildren();renderWorkspace();};
function mountWorkspaceModules(){
 for(const [id,target] of [['history-load',pages.activity],['sites-refresh',pages.settings],['rpc-form',pages.settings],['kcc20-load',pages.assets]]){const element=$(id);if(element){const section=element.closest('section,details');if(section&&section.parentElement!==target)target.append(section);}}
 renderWorkspace();
}
function renderWorkspace(){
 if(!current)return;
 const kaspa=walletFamily==='kaspa';const visible=!current.locked&&!addingWallet;
 walletNav.hidden=!visible;lockRow.hidden=!visible;
 for(const [key,page] of Object.entries(pages))page.hidden=walletPage!==key;
 for(const button of walletNav.children)button.setAttribute('aria-pressed',String(button.dataset.page===walletPage));
 $('kaspa-network').hidden=!kaspa;$('network').hidden=kaspa;
 const network=kaspa?(current.kaspaNetwork==='mainnet'?'Kaspa Mainnet':'Kaspa TN10'):current.network.name;
 const test=kaspa?current.kaspaNetwork!=='mainnet':current.network.id==='igra-testnet';
 document.querySelector('.badge').textContent=network+(test?' · 测试网 / Testnet':' · 主网 / Mainnet');
 $('network-note').textContent=test?'仅测试资产 / Test assets only':'真实资产，请核对网络 / Real funds — verify network';
 contextLabel.textContent=network+' · '+(kaspa?'Kaspa L1':'EVM');
 assetNav.querySelector('[data-asset="native"]').textContent=kaspa?(test?'tKAS':'KAS'):current.network.symbol;
 for(const id of ['kaspa-account-label','kaspa-address','kaspa-balance','kaspa-refresh'])$(id).hidden=!kaspa;
 for(const id of ['evm-address','balance','refresh-balance'])$(id).hidden=kaspa;
 for(const button of assetNav.children){const key=button.dataset.asset;button.hidden=kaspa?key==='erc20':['krc20','kcc20'].includes(key);button.setAttribute('aria-pressed',String(key===assetKind));}
 controls.hidden=assetKind!=='native';tokenSection.hidden=!kaspa||assetKind!=='krc20';ercPanel.hidden=kaspa||assetKind!=='erc20';
 $('send-family').value=kaspa?'kaspa':'evm';
 if($('kcc20-load')){const section=$('kcc20-load').closest('section');section.hidden=!kaspa||assetKind!=='kcc20';const transfer=$('kcc20-send-form').closest('details');transfer.hidden=current.kaspaNetwork!=='testnet-10';let note=$('kcc20-network-note');if(!note){note=document.createElement('p');note.id='kcc20-network-note';section.prepend(note);}note.textContent=current.kaspaNetwork==='mainnet'?'主网：仅查询，转账尚未开放 / Mainnet: view only; transfers unavailable':'TN10：实验转账，仅测试资产 / Experimental transfers, test assets only';}
 window.dispatchEvent(new Event('wallet-context'));
}
const discoveryScript=document.createElement('script');discoveryScript.src='discovery.js';document.head.append(discoveryScript);
const workspaceRefresh=refresh;refresh=async()=>{await workspaceRefresh();renderWorkspace();};
for(const script of [browserScript,kccScript,historyScript,nodeScript])script.addEventListener('load',mountWorkspaceModules);
mountWorkspaceModules();
