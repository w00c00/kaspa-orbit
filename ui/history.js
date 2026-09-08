const historySection=document.createElement('section');historySection.innerHTML='<h2>本机发送记录 / Sent from this wallet</h2><p>已广播不等于链上确认。KRC20 请查看操作恢复。<br>Broadcast is not confirmation. KRC20 has separate recovery records.</p><button id="history-load" class="secondary">刷新记录 / Refresh history</button><div id="history-list"></div>';$('accounts').append(historySection);
const autoLabel=document.createElement('label'),auto=document.createElement('input');auto.type='checkbox';auto.id='history-auto';autoLabel.append(auto,' 自动查询最近 5 笔 / Auto-check latest 5 (30s)');$('history-load').after(autoLabel);const autoStatus=document.createElement('p');autoLabel.after(autoStatus);
const historyRows=new Map();
const historyPoller=new window.NexusPoller({enabled:()=>auto.checked&&!document.hidden&&current&&!current.locked,context:()=>displayedContext,run:async valid=>{
 const records=await window.nexus.invoke('history');if(!valid())return;
 for(const record of records.slice(0,5)){
  if(!valid())return;
  try{const result=await window.nexus.invoke('history-check',{network:record.network,hash:record.hash});if(!valid())return;const status=historyRows.get(record.network+record.hash);if(status)status.textContent=observationText(result);}
  catch{if(valid())autoStatus.textContent='部分查询失败，保留上次结果及时间 / Some checks failed; previous timestamped result retained';}
 }
},onError:()=>{autoStatus.textContent='暂时无法刷新 / Refresh unavailable';}});
historyPoller.tick();window.addEventListener('beforeunload',()=>historyPoller.stop());
auto.onchange=()=>{autoStatus.textContent=auto.checked?'每轮完成后等待 30 秒；锁定或隐藏时暂停 / 30s after each round; pauses when locked or hidden':'自动查询已关闭 / Auto-check off';if(auto.checked)$('history-load').click();};
function observationText(o){if(!o)return '';const labels={'no-checkpoint':'旧记录没有检查点，无法验证 / No saved checkpoint','not-observed':'本次查询未观察到接受记录，不代表失败 / Acceptance not observed; not proof of failure','kaspa-accepted':'节点虚拟链报告已接受，非最终性保证 / Accepted per node virtual chain; not finality','not-found':'尚未查到，不代表失败 / Not found; not proof of failure','reorg-or-inconsistent':'区块变化或节点不一致，请重查 / Block changed or inconsistent RPC',executed:'节点报告执行成功 / Execution succeeded per node',reverted:'节点报告执行回滚 / Execution reverted per node'};return `${labels[o.status]||'未知 / Unknown'}${o.confirmations?` · ${o.confirmations} 个区块确认 / block confirmations（非最终性保证 / not finality）`:''}\n${o.checkedAt}`;}
$('history-load').onclick=()=>action(async()=>{
 const context=displayedContext;const records=await window.nexus.invoke('history');await refresh();if(context!==displayedContext)throw Error('Network or wallet changed / 网络或钱包已改变');const list=$('history-list');list.replaceChildren();historyRows.clear();
 for(const record of records){
  const row=document.createElement('article');row.className='token-card';const title=document.createElement('p');title.textContent=`${record.network} · ${record.createdAt}\n${record.state==='broadcast'?'已广播 / Broadcast':'广播结果未知，请查询后再操作 / Broadcast unknown; check before retrying'}`;
  const link=document.createElement('button');link.className='address';link.textContent=record.hash;link.onclick=()=>action(()=>window.nexus.invoke('tab-new',{url:record.url}));const status=document.createElement('p');status.textContent=observationText(record.observation);row.append(title,link,status);
  {const check=document.createElement('button');check.textContent='查询链上状态 / Check on-chain';check.onclick=()=>action(async()=>{check.disabled=true;try{const result=await window.nexus.invoke('history-check',{network:record.network,hash:record.hash});if(context===displayedContext)status.textContent=observationText(result);}finally{check.disabled=false;}});row.append(check);}
  historyRows.set(record.network+record.hash,status);list.append(row);
 }if(!records.length)list.textContent='暂无记录 / No records';
});
