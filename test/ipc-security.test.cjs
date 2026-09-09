const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const wasm=require('@kluster/kaspa-wasm');const {createRequire}=require('node:module');
const entry=require.resolve('../desktop/main.cjs'),localRequire=createRequire(entry);
function harness(){
 const handlers=new Map(),events=[];let prepared=0,broadcast=0,approved=0;
 const key=new wasm.PrivateKey(crypto.randomBytes(32).toString('hex'));let address;try{address=key.toAddress('mainnet').toString();}finally{key.free();}
 const frame={url:'https://example.test/dapp'};const wc={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url,send:(...args)=>events.push(args)};const view={webContents:wc};
 const identity={address,publicKey:''};const fakeVault={locked:false,accounts:()=>({kaspa:identity,evm:'0x0000000000000000000000000000000000000001'}),kaspaIdentity:()=>identity};
 let response=0;
 const electron={app:{whenReady:()=>({then:()=>{}}),on:()=>{}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showMessageBox:async()=>{approved++;return {response};}}};
 class Service {constructor(){this.network='mainnet';this.revision=0;}async prepare(input){prepared++;return {...input,summary:'reviewed'};}async broadcast(_p,_v,valid){assert.ok(valid());broadcast++;return 'test-hash';}}
 const context=vm.createContext({require:name=>name==='electron'?electron:name==='./kaspa.cjs'?{...localRequire(name),KaspaService:Service}:localRequire(name),__dirname:path.dirname(entry),Buffer,setInterval,clearInterval,console,URL,fetch,AbortSignal,view,fakeVault});
 vm.runInContext(fs.readFileSync(entry,'utf8'),context);
 vm.runInContext("vault=fakeVault;window={webContents:{send:()=>{}}};tabs={tabs:new Map([['one',{view}]]),active:view,emit:()=>{}};",context);
 return {callEvm:(method,params=[])=>handlers.get('dapp-request')({sender:wc,senderFrame:frame},{family:'evm',method,params}),context,frame,wc,address,events,fakeVault,allow:()=>{response=1;},grant:()=>vm.runInContext("permissions.grant('https://example.test','kaspa')",context),call:(method,params=[],senderFrame=frame)=>handlers.get('dapp-request')({sender:wc,senderFrame},{family:'kaspa',method,params}),counts:()=>({prepared,broadcast,approved})};
}
test('wallet rename preserves unlock and dApp permissions, including rejected names',async()=>{
 const h=harness();h.grant();
 vm.runInContext(`
  window.webContents.mainFrame={url:pathToFileURL(shellFile).href};
  wallets={rename:async name=>{if(name!=='Renamed')throw Error('Invalid name');}};
  permissions.grant('https://example.test','evm');
 `,h.context);
 const call=name=>{h.context.renameName=name;return vm.runInContext("walletUi({sender:window.webContents,senderFrame:window.webContents.mainFrame},'wallet-rename',{name:renameName})",h.context);};
 const generation=vm.runInContext('generation',h.context);
 await call('Renamed');await assert.rejects(call(''),/Invalid name/);
 assert.equal(h.fakeVault.locked,false);
 assert.equal(vm.runInContext('generation',h.context),generation);
 assert.equal(vm.runInContext("permissions.has('https://example.test','evm')&&permissions.has('https://example.test','kaspa')",h.context),true);
 assert.equal(vm.runInContext('walletBusy',h.context),false);
 vm.runInContext('approvalBusy=true',h.context);await assert.rejects(call('Renamed'),/pending/);
});
test('EVM revocation is scoped to requesting origin and works while locked',async()=>{
 const h=harness();h.grant();vm.runInContext("permissions.grant('https://example.test','evm');permissions.grant('https://other.test','evm')",h.context);
 const listed=(await h.callEvm('wallet_getPermissions')).result;assert.equal(listed.length,1);assert.equal(listed[0].invoker,'https://example.test');assert.equal(listed[0].parentCapability,'eth_accounts');assert.equal(listed[0].caveats.length,0);
 assert.equal((await h.callEvm('wallet_getPermissions',[{}])).error.code,-32602);
 for(const params of [[],[{}],[{eth_accounts:null}],[{eth_accounts:{extra:true}}],[{eth_accounts:{},other:{}}]])assert.equal((await h.callEvm('wallet_revokePermissions',params)).error.code,-32602);
 assert.equal(vm.runInContext("permissions.has('https://example.test','evm')",h.context),true);
 h.fakeVault.locked=true;
 assert.equal((await h.callEvm('wallet_getPermissions')).result.length,0);
 assert.equal((await h.callEvm('wallet_revokePermissions',[{eth_accounts:{}}])).result,null);
 assert.equal(vm.runInContext("permissions.has('https://example.test','evm')",h.context),false);
 assert.equal(vm.runInContext("permissions.has('https://other.test','evm')",h.context),true);
 assert.equal(vm.runInContext("permissions.has('https://example.test','kaspa')",h.context),true);
 assert.equal(h.counts().approved,0);assert.equal(h.events.at(-1)[1].event,'accountsChanged');assert.equal(h.events.at(-1)[1].value.length,0);
});
test('EVM account permission requests require approval and reject expanded authority',async()=>{
 const h=harness();h.fakeVault.evm=()=>({address:'0x0000000000000000000000000000000000000001'});
 for(const params of [[{eth_sendTransaction:{}}],[{eth_accounts:{requiredMethods:['eth_sendTransaction']}}],[{eth_accounts:{},eth_sign:{}}]])assert.equal((await h.callEvm('wallet_requestPermissions',params)).error.code,-32602);
 assert.equal(h.counts().approved,0);
 assert.equal((await h.callEvm('wallet_requestPermissions',[{eth_accounts:{}}])).error.code,4001);
 assert.equal((await h.callEvm('wallet_getPermissions')).result.length,0);
 h.allow();const result=await h.callEvm('wallet_requestPermissions',[{eth_accounts:{}}]);assert.equal(result.result[0].parentCapability,'eth_accounts');
 assert.equal((await h.callEvm('wallet_getPermissions')).result.length,1);
 assert.equal(vm.runInContext("permissions.has('https://example.test','kaspa')",h.context),false);
 assert.equal(h.counts().broadcast,0);
});
test('real IPC route rejects iframe, locked, unauthorized and cancelled dApp sends',async()=>{
 const h=harness();assert.equal((await h.call('sendKaspa',[h.address,1],{url:h.frame.url})).error.message,'Unauthorized frame');
 h.fakeVault.locked=true;assert.match((await h.call('sendKaspa',[h.address,1])).error.message,/Unlock/);h.fakeVault.locked=false;
 assert.equal((await h.call('sendKaspa',[h.address,1])).error.code,4100);assert.deepEqual(h.counts(),{prepared:0,broadcast:0,approved:0});
 h.grant();assert.equal((await h.call('sendKaspa',[h.address,1])).error.code,4001);assert.deepEqual(h.counts(),{prepared:1,broadcast:0,approved:1});
 h.allow();assert.equal((await h.call('sendKaspa',[h.address,1])).result,'test-hash');assert.equal(h.counts().broadcast,1);
 await h.call('disconnect');assert.equal((await h.call('getAccounts')).result.length,0);assert.equal((await h.call('sendKaspa',[h.address,1])).error.code,4100);assert.equal(h.counts().broadcast,1);
});
test('background tabs cannot approve sending and concurrent sends are rejected before construction',async()=>{
 const h=harness();h.grant();h.allow();vm.runInContext('tabs.active=null',h.context);
 assert.match((await h.call('sendKaspa',[h.address,1])).error.message,/context changed/);assert.equal(h.counts().prepared,0);
 vm.runInContext('tabs.active=view;transactionBusy=true',h.context);
 assert.equal((await h.call('sendKaspa',[h.address,1])).error.code,-32002);assert.equal(h.counts().prepared,0);
});
test('message IPC rejects unsupported formats before approval and preserves explicit Schnorr options',async()=>{
 const h=harness();h.grant();h.allow();let signed=0;
 h.fakeVault.signKaspaMessage=(message,options)=>{assert.equal(message,'hello');assert.equal(options.type,'schnorr');assert.equal(options.noAuxRand,true);signed++;return 'signature';};
 assert.equal((await h.call('signMessage',['hello',{type:'ecdsa'}])).error.code,4200);
 for(const params of [['hello',{noAuxRand:'true'}],['hello',{unknown:1}],['hello',{},'ignored'],[42]])assert.equal((await h.call('signMessage',params)).error.code,-32602);
 assert.equal(h.counts().approved,0);assert.equal(signed,0);
 assert.equal((await h.call('signMessage',['hello',{type:'schnorr',noAuxRand:true}])).result,'signature');assert.equal(signed,1);
 vm.runInContext('tabs.active=null',h.context);
 assert.match((await h.call('signMessage',['hello',{noAuxRand:true}])).error.message,/Select the requesting tab/);assert.equal(signed,1);
});
test('KRC20 IPC requires origin permission and rejects unsupported operations or concurrent sends',async()=>{
 const h=harness();assert.equal((await h.call('signKRC20Transaction',['{}',4])).error.code,4100);
 h.grant();h.allow();assert.equal((await h.call('signKRC20Transaction',['{}',3])).error.code,4200);
 assert.equal(h.counts().approved,0);assert.equal(vm.runInContext('transactionBusy',h.context),false);
 vm.runInContext('transactionBusy=true',h.context);assert.equal((await h.call('signKRC20Transaction',['{}',4])).error.code,-32002);
 vm.runInContext('transactionBusy=false',h.context);h.fakeVault.locked=true;assert.match((await h.call('signKRC20Transaction',['{}',4])).error.message,/Unlock/);
});
