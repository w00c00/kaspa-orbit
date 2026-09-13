// One refresh per protocol at a time. Old contexts never publish success/errors.
(function(root){
 class Discovery{
  constructor({context,load,publish,now=Date.now,interval=30000}){Object.assign(this,{context,load,publish,now,interval});this.jobs=new Map();this.last=new Map();}
  async tick(kind,force=false){
   const context=this.context();if(!context||this.jobs.has(kind))return;
   const prior=this.last.get(kind);if(!force&&prior?.context===context&&this.now()-prior.time<this.interval)return;
   const job={context};this.jobs.set(kind,job);this.publish(kind,'loading');
   try{await this.load(kind);if(this.context()===context)this.publish(kind,'success');}
   catch(error){if(this.context()===context)this.publish(kind,'error',error.message);}
   finally{const active=this.context()===context;if(active)this.last.set(kind,{context,time:this.now()});else{this.last.delete(kind);this.publish(kind,'idle');}this.jobs.delete(kind);if(this.context()&&this.context()!==context)queueMicrotask(()=>this.tick(kind));}
  }
 }
 if(typeof module!=='undefined'){module.exports={Discovery};return;}
 const statusNodes={};
 const buttons={krc20:'krc20-load',kcc20:'kcc20-load',kaspa:'kaspa-refresh',evm:'refresh-balance'};
 const discovery=new Discovery({
  context:()=>current&&!current.locked&&!addingWallet&&!document.hidden?displayedContext:null,
  load:async kind=>{
   if(kind==='krc20')return loadKrc();if(kind==='kcc20')return loadKcc();
   const context=displayedContext;
   const result=await window.nexus.invoke(kind==='kaspa'?'kaspa-balance':'balance');
   if(context!==displayedContext)return;
   $(kind==='kaspa'?'kaspa-balance':'balance').textContent=`${result.balance} ${result.symbol}`;
  },
  publish:(kind,state,error)=>{
   const button=$(buttons[kind]);if(!button)return;
   let node=statusNodes[kind];if(!node){node=document.createElement('p');node.setAttribute('role','status');button.after(node);statusNodes[kind]=node;}
   button.disabled=state==='loading';
   if(state==='idle'){node.textContent='';return;}
   node.hidden=(kind==='kaspa'&&walletFamily!=='kaspa')||(kind==='evm'&&walletFamily!=='evm');
   node.textContent=state==='loading'?'正在自动检索资产 / Discovering assets…':state==='error'?`查询失败，不代表没有资产 / Query failed, not zero holdings: ${error}`:`已更新 / Updated · ${new Date().toLocaleTimeString()}`;
  }
 });
 function tick(){
  for(const kind of ['kaspa','evm'])if(statusNodes[kind])statusNodes[kind].hidden=walletFamily!==kind;
  for(const kind of ['krc20','kcc20',walletFamily]){const button=$(buttons[kind]);if(!button)continue;button.textContent='刷新 / Refresh '+(kind==='kaspa'?(current?.kaspaNetwork==='testnet-10'?'tKAS':'KAS'):kind==='evm'?(current?.network.symbol||'Native'):kind.toUpperCase());button.onclick=()=>discovery.tick(kind,true);discovery.tick(kind);}
 }
 window.addEventListener('wallet-context',tick);document.addEventListener('visibilitychange',tick);
 const timer=setInterval(tick,30000);window.addEventListener('beforeunload',()=>clearInterval(timer));tick();
})(globalThis);
