const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function shell(){let api;const handlers={},pending=[];const electron={contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},ipcRenderer:{on:(name,fn)=>{(handlers[name]??=[]).push(fn);},invoke:(_channel,method)=>new Promise(resolve=>pending.push({method,resolve}))}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/shell-preload.cjs'),'utf8'),{require:()=>electron});return {api,pending,event:()=>handlers['wallet-state'].forEach(fn=>fn())};}
test('late balance and status responses cannot cross wallet or network changes',async()=>{
 for(const method of ['balance','kaspa-balance','status','krc20-holdings','history']){
  const s=shell(),old=s.api.invoke(method);s.event();s.pending[0].resolve({old:true});await assert.rejects(old,/changed/);
  const fresh=s.api.invoke(method);s.pending[1].resolve({fresh:true});assert.equal((await fresh).fresh,true);
 }
});
test('initiating wallet selection invalidates pending reads before backend notification',async()=>{
 const s=shell(),old=s.api.invoke('balance'),switching=s.api.invoke('wallet-select',{id:'example'});
 s.pending[0].resolve({balance:'old'});await assert.rejects(old,/changed/);s.pending[1].resolve(true);assert.equal(await switching,true);
});
test('disconnect and revoke invalidate pending permission reads',async()=>{
 for(const method of ['disconnect','revoke']){
  const s=shell(),old=s.api.invoke('permissions'),change=s.api.invoke(method);
  s.pending[0].resolve([{origin:'https://previous.test',family:'evm'}]);
  await assert.rejects(old,/changed/);
  s.pending[1].resolve(true);await change;
  const fresh=s.api.invoke('permissions');s.pending[2].resolve([]);assert.equal((await fresh).length,0);
 }
});
test('late recovery response is discarded after lock or wallet switch',async()=>{
 for(const method of ['lock','wallet-select']){
  const s=shell(),recovery=s.api.invoke('wallet-recovery'),change=s.api.invoke(method);
  s.pending[0].resolve({phrase:'synthetic marker, not a seed'});await assert.rejects(recovery,/changed/);
  s.pending[1].resolve(true);await change;
 }
});
