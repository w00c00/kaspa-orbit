const tokenSection=document.createElement('section');
tokenSection.innerHTML='<h2>代币 / Tokens</h2><p>KRC20 · Kasplex 索引器 / Indexer</p><button id="krc20-load" class="secondary">加载 KRC20 / Load KRC20</button><div id="krc20-list"></div><button id="krc20-next" class="secondary" hidden>下一页 / Next page</button><form id="erc20-form"><label>ERC20 · 当前 EVM 网络 / Current network</label><input id="erc20-contract" required placeholder="0x… 合约地址 / Contract address"><button>查询代币 / Inspect token</button></form><div id="erc20-result"></div>';
document.getElementById('accounts').append(tokenSection);
let krcCursor='';
function tokenRow(token){const row=document.createElement('p');row.textContent=`${token.symbol}: ${token.balance}${token.lockedBalance?' · 锁定 / Locked: '+token.lockedBalance:''}`;if(token.kind==='krc20'){const button=document.createElement('button');button.textContent='发送 / Send';button.onclick=()=>showKrcTransfer(token);row.append(button);}return row;}
async function loadKrc(next=''){
 const context=displayedContext,seen=new Set(),tokens=[];
 do{
  if(seen.has(next)||seen.size>=100)throw Error('KRC20 分页异常，未完成查询 / Pagination incomplete');
  seen.add(next);const result=await window.nexus.invoke('krc20-holdings',{next});
  if(context!==displayedContext)throw Error('钱包或网络已切换 / Wallet or network changed');
  tokens.push(...result.tokens);next=result.next;
 }while(next);
 $('krc20-list').replaceChildren(...tokens.map(tokenRow));
 if(!tokens.length)$('krc20-list').textContent='没有持仓 / No holdings';
 krcCursor='';$('krc20-next').hidden=true;
}
$('krc20-load').onclick=()=>action(()=>loadKrc());$('krc20-next').onclick=()=>action(()=>loadKrc(krcCursor));
$('erc20-form').onsubmit=e=>{e.preventDefault();action(async()=>{const token=await window.nexus.invoke('erc20-holding',{contract:$('erc20-contract').value.trim()});$('erc20-result').replaceChildren(tokenRow(token));
 const form=document.createElement('form');const recipient=document.createElement('input');recipient.required=true;recipient.placeholder='接收地址 / Recipient';const amount=document.createElement('input');amount.required=true;amount.inputMode='decimal';amount.placeholder='代币数量 / Token amount';const submit=document.createElement('button');submit.textContent='审核代币转账 / Review token transfer';const status=document.createElement('p');form.append(recipient,amount,submit,status);$('erc20-result').append(form);
 form.onsubmit=event=>{event.preventDefault();action(async()=>{submit.disabled=true;try{const result=await window.nexus.invoke('send',{family:'erc20',contract:token.contract,chainId:token.chainId,decimals:token.decimals,recipient:recipient.value.trim(),amount:amount.value.trim()});status.textContent='已广播 / Broadcast: ';const link=document.createElement('button');link.className='address';link.textContent=result.hash;link.type='button';link.onclick=()=>action(()=>window.nexus.invoke('browse',{url:result.url}));status.append(link);}finally{submit.disabled=false;}});};
 });};
const recovery=document.createElement('section');recovery.innerHTML='<h2>KRC20 操作恢复 / Recovery</h2><button id="krc-recover-load" class="secondary">查看未完成操作 / View operations</button><div id="krc-recover-list"></div><div id="krc-send-panel"></div>';tokenSection.append(recovery);
function showKrcTransfer(token){const network=current.kaspaNetwork;const form=document.createElement('form');const title=document.createElement('p');title.textContent=`${token.symbol} · ${network}`;const recipient=document.createElement('input');recipient.placeholder='接收地址 / Recipient';recipient.required=true;const amount=document.createElement('input');amount.placeholder='代币数量 / Token amount';amount.required=true;const button=document.createElement('button');button.textContent='审核两步转账 / Review transfer';form.append(title,recipient,amount,button);$('krc-send-panel').replaceChildren(form);form.onsubmit=event=>{event.preventDefault();action(async()=>{button.disabled=true;try{await window.nexus.invoke('krc20-send',{network,symbol:token.symbol,contract:token.contract,recipient:recipient.value.trim(),amount:amount.value.trim()});}finally{button.disabled=false;await loadKrcOperations();}});};}
async function loadKrcOperations(){const records=await window.nexus.invoke('krc20-operations');$('krc-recover-list').replaceChildren();for(const record of records){const row=document.createElement('p');row.textContent=`${record.createdAt} · ${record.state}\n${record.revealId}`;row.style.overflowWrap='anywhere';if(record.state!=='revealed'){const resume=document.createElement('button');resume.textContent='检查 / 继续 · Check / Resume';resume.onclick=()=>action(async()=>{try{await window.nexus.invoke('krc20-resume',{id:record.id});}finally{await loadKrcOperations();}});row.append(resume);}$('krc-recover-list').append(row);}if(!records.length)$('krc-recover-list').textContent='没有操作 / No operations';}
$('krc-recover-load').onclick=()=>action(loadKrcOperations);
