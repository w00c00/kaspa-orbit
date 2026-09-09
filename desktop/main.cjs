const {app,BrowserWindow,WebContentsView,ipcMain,dialog,session,powerMonitor}=require('electron');
const {BrowserTabs}=require('./tabs.cjs');
const {Settings}=require('./settings.cjs');
const {endpoint}=require('./rpc-config.cjs');
const {History}=require('./history.cjs');
const {evmReceipt}=require('./receipts.cjs');
const {kaspaReceipt}=require('./kaspa-receipts.cjs');
const {sendKaspa,messageRequest}=require('./kaspa-provider.cjs');
const {sendKrc20}=require('./krc20-provider.cjs');
const {inspectPskt,signSelected,authorizePskt}=require('./pskt.cjs');
const {prepareKrc20,signKrc20}=require('./krc20.cjs');
const {Krc20Operations}=require('./operations.cjs');
const {Kcc20Source}=require('./kcc20.cjs');
const kcc20Source=new Kcc20Source();
const {prepareTransferRequest}=require('./kcc20-request.cjs');
const {authorizeAddressTransfer}=require('./kcc20-authorize.cjs');
const {submitAddressTransfer}=require('./kcc20-submit.cjs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Vault}=require('./vault.cjs');
const {Wallets}=require('./wallets.cjs');
const {Permissions,originOf}=require('./policy.cjs');
const {EvmService,NETWORKS,READ_METHODS,hex,personalMessage}=require('./evm.cjs');
const {formatEther,parseEther,getAddress,TypedDataEncoder}=require('ethers');
const {KaspaService,formatKas}=require('./kaspa.cjs');
const kaspaService=new KaspaService();
const {erc20Holding,krc20Holdings,prepareErc20Transfer}=require('./tokens.cjs');
const evm=new EvmService();
let generation=0, approvalBusy=false, transactionBusy=false,networkBusy=false,settings;
async function switchNetwork(family,target){
 if(networkBusy||transactionBusy||approvalBusy)throw Error('Finish pending approval or transaction first / 请先完成待处理的授权或交易');
 networkBusy=true;disconnect();
 try{
  if(family==='kaspa'){await kaspaService.switch(target);settings.update({kaspaNetwork:kaspaService.network});emit('kaspa','networkChanged',kaspaService.network);}
  else{await evm.switch(target);settings.update({evmNetwork:evm.network.id});emit('evm','chainChanged',hex(evm.network.chainId));}
 }finally{changed();networkBusy=false;window.webContents.send('wallet-state');}
}
function changed(){generation++;}
function emit(family,event,value){tabs?.emit(family,event,value,permissions);}
function disconnect(){permissions.clear();changed();emit('evm','accountsChanged',[]);emit('kaspa','accountsChanged',[]);}
async function approve(origin,detail,valid){
  if(!valid())throw Error('Select the requesting tab and unlock the wallet / 请选中请求的标签并解锁钱包');
  if(networkBusy)throw Error('Network switch in progress / 正在切换网络');
  if(approvalBusy)throw Object.assign(Error('Another approval is pending'),{code:-32002});
  approvalBusy=true;
  try{const {response}=await dialog.showMessageBox(window,{type:'question',title:'Kaspa Orbit · Authorization / 授权',message:origin,detail,buttons:['Cancel / 取消','Approve / 确认'],defaultId:0,cancelId:0});if(response!==1)throw Object.assign(Error('User rejected request'),{code:4001});if(!valid())throw Error('Wallet, page or network changed; retry / 状态已改变，请重试');}
  finally{approvalBusy=false;}
}
let window, tabs, vault, wallets, walletBusy=false, operations, lastActivity=Date.now();
function lockWallet(){vault.lock();disconnect();window.webContents.send('wallet-state');}
const permissions=new Permissions();
const shellFile=path.join(__dirname,'../ui/index.html');
function trusted(event){return event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && event.senderFrame.url===pathToFileURL(shellFile).href;}
async function browse(url,newTab=false){await tabs.open(url,newTab);}
app.whenReady().then(async()=>{
  require('./profile.cjs').preserveProfile(app);
  kaspaService.history=evm.history=new History(path.join(app.getPath('userData'),'transaction-history'));
  settings=new Settings(path.join(app.getPath('userData'),'settings.json'));
  kaspaService.network=settings.value.kaspaNetwork;evm.network=NETWORKS.find(n=>n.id===settings.value.evmNetwork);
  kaspaService.rpcOverrides=evm.rpcOverrides=Object.freeze({...settings.value.rpcOverrides});
  wallets=await new Wallets(app.getPath('userData')).init();vault=wallets.vault;
  operations=new Krc20Operations(path.join(app.getPath('userData'),'krc20-operations'),kaspaService);
  session.fromPartition('persist:dapps').setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
  session.fromPartition('persist:dapps').setPermissionCheckHandler(()=>false);
  if(process.platform==='darwin'&&app.dock)app.dock.setIcon(path.join(__dirname,'../ui/icon.png'));
  window=new BrowserWindow({icon:path.join(__dirname,'../ui/icon.png'),width:1320,height:880,minWidth:1000,minHeight:680,backgroundColor:'#101b20',webPreferences:{preload:path.join(__dirname,'shell-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  tabs=new BrowserTabs({window,createView:()=>new WebContentsView({webPreferences:{preload:path.join(__dirname,'dapp-preload.cjs'),partition:'persist:dapps',sandbox:true,contextIsolation:true,nodeIntegration:false}}),onNavigate:changed,onInput:()=>{lastActivity=Date.now();},onChange:state=>{if(!window.webContents.isDestroyed())window.webContents.send('browser-state',{tabs:state,url:state.find(t=>t.active)?.url||''});}});
  window.on('resize',()=>tabs.layout());
  window.webContents.on('before-input-event',()=>{lastActivity=Date.now();});
  powerMonitor.on('suspend',lockWallet);powerMonitor.on('lock-screen',lockWallet);
  const idle=setInterval(()=>{if(!vault.locked&&Date.now()-lastActivity>300000)lockWallet();},5000);
  window.on('closed',()=>{clearInterval(idle);vault.lock();tabs.destroy();});
  await window.loadFile(shellFile);
});
async function walletUi(event,method,args={}){
  if(!trusted(event))throw Error('Unauthorized');
  switch(method){
    case 'status': return {walletId:wallets?.id,wallets:wallets?await wallets.list():[],exists:await vault.exists(),locked:vault.locked,accounts:vault.accounts(kaspaService.network),kaspaNetwork:kaspaService.network,networks:NETWORKS,network:evm.network};
    case 'wallet-add':case 'wallet-select':case 'wallet-rename':{
      if(walletBusy||networkBusy||transactionBusy||approvalBusy)throw Error('Finish pending requests first / 请先完成待处理请求');
      walletBusy=true;disconnect();vault.lock();
      try{
        let phrase=null;
        if(method==='wallet-add')phrase=await wallets.add(args.name,args.password,args.phrase);
        else if(method==='wallet-select')await wallets.select(args.id);
        else await wallets.rename(args.name);
        vault=wallets.vault;lastActivity=Date.now();return {phrase};
      }finally{vault=wallets.vault;walletBusy=false;changed();window.webContents.send('wallet-state');}
    }
    case 'history':{
      if(vault.locked)throw Error('Unlock wallet first / 请先解锁钱包');
      const records=[...kaspaService.history.list(kaspaService.network,vault.kaspaIdentity(kaspaService.network).address),...evm.history.list(evm.network.id,vault.evm().address)];
      return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>({...r,url:r.family==='evm'?NETWORKS.find(n=>n.id===r.network).explorer+'/tx/'+r.hash:(r.network==='mainnet'?'https://explorer.kaspa.org/txs/':'https://explorer-tn10.kaspa.org/txs/')+r.hash}));
    }
    case 'create': {
      if(walletBusy||networkBusy||transactionBusy||approvalBusy)throw Error('Finish pending requests first');
      walletBusy=true;try{return {phrase:await vault.create(args.password,args.phrase)};}finally{walletBusy=false;}
    }
    case 'wallet-recovery':{
      if(walletBusy||networkBusy||transactionBusy||approvalBusy)throw Error('Finish pending requests first');
      walletBusy=true;const revision=generation;
      try{const phrase=await vault.recovery(args.password);if(revision!==generation)throw Error('Wallet changed / 钱包状态已改变');return {phrase};}finally{walletBusy=false;}
    }
    case 'rpc-settings':return {...settings.value.rpcOverrides};
    case 'rpc-save':{
      if(networkBusy||transactionBusy||approvalBusy)throw Error('Finish pending requests first / 请先完成待处理请求');
      const url=endpoint(args.network,args.url);networkBusy=true;disconnect();
      try{
        const next={...settings.value.rpcOverrides};if(url)next[args.network]=url;else delete next[args.network];
        if(['mainnet','testnet-10'].includes(args.network)){const probe=new KaspaService();probe.rpcOverrides=next;await probe.withRpc(()=>true,args.network);}
        else{const probe=new EvmService();probe.rpcOverrides=next;await probe.verify(NETWORKS.find(n=>n.id===args.network));}
        settings.update({rpcOverrides:next});kaspaService.rpcOverrides=evm.rpcOverrides=Object.freeze(next);kaspaService.revision++;evm.revision++;return true;
      }finally{changed();networkBusy=false;window.webContents.send('wallet-state');}
    }
    case 'history-check':{
      if(vault.locked)throw Error('Unlock wallet first / 请先解锁钱包');
      if(args.network===kaspaService.network){
        const revision=generation,record=kaspaService.history.get(args.network,args.hash,vault.kaspaIdentity(kaspaService.network).address);
        const observation=await kaspaReceipt(kaspaService,record);
        if(vault.locked||revision!==generation)throw Error('Wallet or network changed');
        kaspaService.history.observation(record,observation);return observation;
      }
      if(args.network!==evm.network.id)throw Error('Select the matching EVM network / 请切换到对应 EVM 网络');
      const revision=generation,record=evm.history.get(args.network,args.hash,vault.evm().address);
      const observation=await evmReceipt(evm,record);
      if(vault.locked||revision!==generation)throw Error('Wallet or network changed');
      evm.history.observation(record,observation);return observation;
    }
    case 'unlock': {
      if(walletBusy)throw Error('Wallet operation pending / 钱包操作进行中');
      walletBusy=true;try{await vault.unlock(args.password);lastActivity=Date.now();return true;}finally{walletBusy=false;}
    }
    case 'lock': lockWallet();return true;
    case 'browse': await browse(args.url);return true;
    case 'tab-new':await browse(args.url||'https://kascov.io',true);return true;
    case 'tab-select':tabs.select(args.id);return true;
    case 'tab-close':tabs.close(args.id);return true;
    case 'permissions':return permissions.list();
    case 'revoke':permissions.revoke(args.origin,args.family);changed();for(const {view} of tabs.tabs.values()){try{if(originOf(view.webContents.getURL())===originOf(args.origin))view.webContents.send('provider-event',{family:args.family,event:'accountsChanged',value:[]});}catch{}}return true;
    case 'disconnect':disconnect();return true;
    case 'network':await switchNetwork('evm',args.chainId);return true;
    case 'balance':if(vault.locked)throw Error('Unlock wallet first');return {balance:formatEther(await evm.read('eth_getBalance',[vault.evm().address,'latest'])),symbol:evm.network.symbol};
    case 'kaspa-balance':if(vault.locked)throw Error('Unlock wallet first');return kaspaService.balance(vault.kaspaIdentity(kaspaService.network).address);
    case 'krc20-holdings':if(vault.locked)throw Error('Unlock wallet first');return krc20Holdings(kaspaService.network,vault.kaspaIdentity(kaspaService.network).address,args.next);
    case 'erc20-holding':if(vault.locked)throw Error('Unlock wallet first');return erc20Holding(evm,args.contract,vault.evm().address);
    case 'kcc20-send':{
      if(vault.locked)throw Error('Unlock wallet first / 请先解锁钱包');
      if(walletBusy||networkBusy||transactionBusy||approvalBusy)throw Error('Finish pending requests first / 请先完成待处理请求');
      if(kaspaService.network!=='testnet-10')throw Error('KCC20 experimental transfers require TN10 / 请切换到 TN10 测试网');
      transactionBusy=true;const revision=generation,activeVault=vault;
      const valid=()=>vault===activeVault&&!vault.locked&&generation===revision&&kaspaService.network==='testnet-10';
      try{
        const identity=vault.kaspaIdentity('testnet-10');
        const {prepared,request}=await prepareTransferRequest({service:kaspaService,source:kcc20Source,identity,args,valid});
        const signed=await authorizeAddressTransfer({service:kaspaService,prepared,vault,valid,approve:(summary,check)=>{
          const review=JSON.parse(summary);
          const detail=[`Network / 网络: TN10 (test assets only / 仅测试资产)`,`Covenant ID: ${review.covenantId}`,`Recipient / 收款地址: ${request.recipientAddress}`,`Transfer / 转出: ${request.amount} atomic units / 基础单位`,`Fee / 手续费: ${formatKas(review.feeSompi)} tKAS`,`KAS change / KAS 找零: ${formatKas(review.kasChangeSompi)} tKAS`,`Token outputs / 代币输出:`,...review.tokenOutputs.map((output,i)=>`${i+1}. ${output.atomicAmount} units → ${output.owner}`),`Carrier values / 输出承载 KAS: ${review.carrierSompi.map(formatKas).join(', ')} tKAS`].join('\n');
          return approve('KCC20 · TN10 Experimental / 实验转账',detail,check);
        }});
        return await submitAddressTransfer({service:kaspaService,signed,address:identity.address,valid});
      }finally{transactionBusy=false;}
    }
    case 'kcc20-holdings':if(vault.locked)throw Error('Unlock wallet first');return kcc20Source.holdings(kaspaService.network,vault.kaspaIdentity(kaspaService.network).address);
    case 'kcc20-detail':return kcc20Source.token(kaspaService.network,args.covenantId);
    case 'krc20-operations':if(vault.locked)throw Error('Unlock wallet first');return operations.list(vault.kaspaIdentity(kaspaService.network).address,kaspaService.network);
    case 'krc20-resume':{
      if(vault.locked||transactionBusy)throw Error('Unlock wallet and finish pending transaction first');
      const record=await operations.get(args.id),revision=generation;
      const valid=()=>!vault.locked&&generation===revision&&vault.kaspaIdentity(kaspaService.network).address===record.prepared.address;
      transactionBusy=true;try{await approve('Resume KRC20 / 继续 KRC20 操作',record.prepared.summary,valid);await operations.run(args.id,valid);return true;}finally{transactionBusy=false;}
    }
    case 'krc20-send':{
      if(vault.locked||transactionBusy)throw Error('Unlock wallet and finish pending transaction first');
      const network=kaspaService.network,identity=vault.kaspaIdentity(network),revision=generation,valid=()=>!vault.locked&&generation===revision;
      if(args.network!==network)throw Error('KRC20 network changed; reload holdings');
      transactionBusy=true;
      try{
       let next='',holding;do{const page=await krc20Holdings(network,identity.address,next);holding=page.tokens.find(t=>t.symbol===args.symbol&&t.contract===(args.contract||null));next=page.next;}while(!holding&&next);
       if(!holding)throw Error('KRC20 holding not found');
       const prepared=await kaspaService.withRpc(async rpc=>{const {entries}=await rpc.getUtxosByAddresses({addresses:[identity.address]});return prepareKrc20({network,...identity,entries:entries.filter(e=>!e.isCoinbase),transfer:{tick:holding.symbol,ca:holding.contract,recipient:args.recipient,amount:args.amount,decimals:holding.decimals}});},network);
       if(BigInt(prepared.data.amt)>BigInt(holding.amount))throw Error('Insufficient KRC20 balance');
       await approve('KRC20 transfer / 转账',prepared.summary,valid);
       const signed=signKrc20(prepared,vault),record=await operations.create(prepared,signed);
       try{await operations.run(record.id,valid);}catch(error){throw Error(`${error.message}\nSaved for recovery / 已保存恢复记录: ${record.id}`);}
       return {id:record.id,hash:signed.revealId};
      }finally{transactionBusy=false;}
    }
    case 'kaspa-network':await switchNetwork('kaspa',args.network);return true;
    case 'send':{
      if(vault.locked)throw Error('Unlock wallet first / 请先解锁钱包');
      if(transactionBusy)throw Error('Another transaction is pending');
      const revision=generation,valid=()=>!vault.locked&&generation===revision;
      transactionBusy=true;
      try{let hash,explorer;
        if(args.family==='kaspa'){
          const prepared=await kaspaService.prepare({address:vault.kaspaIdentity(kaspaService.network).address,recipient:args.recipient,amount:args.amount});
          await approve('Kaspa Orbit · Transfer / 转账',prepared.summary,valid);
          hash=await kaspaService.broadcast(prepared,vault,valid);
          explorer=prepared.network==='mainnet'?'https://explorer.kaspa.org/txs/':'https://explorer-tn10.kaspa.org/txs/';
        }else if(args.family==='erc20'){
          const prepared=await prepareErc20Transfer(evm,args,vault.evm().address);
          await approve('Kaspa Orbit · Token transfer / 代币转账',prepared.summary,valid);
          hash=await evm.broadcast(prepared,vault.evm(),valid);explorer=prepared.network.explorer+'/tx/';
        }else if(args.family==='evm'){
          if(typeof args.amount!=='string'||! /^(0|[1-9]\d*)(\.\d{1,18})?$/.test(args.amount)||parseEther(args.amount)<=0n)throw Error('Invalid transfer amount');
          const prepared=await evm.prepare({from:vault.evm().address,to:args.recipient,value:hex(parseEther(args.amount))},vault.evm().address);
          await approve('Kaspa Orbit · Transfer / 转账',prepared.summary,valid);
          hash=await evm.broadcast(prepared,vault.evm(),valid);explorer=prepared.network.explorer+'/tx/';
        }else throw Error('Unknown transfer network');
        return {hash,url:explorer+hash};
      }finally{transactionBusy=false;}
    }
    case 'back':if(tabs.active?.webContents.navigationHistory.canGoBack())tabs.active.webContents.navigationHistory.goBack();return true;
    case 'forward':if(tabs.active?.webContents.navigationHistory.canGoForward())tabs.active.webContents.navigationHistory.goForward();return true;
    case 'reload':tabs.active?.webContents.reload();return true;
    default:throw Error('Unknown action');
  }
}
ipcMain.handle('wallet-ui',async(event,method,args={})=>{
 const revision=generation;
 const result=await walletUi(event,method,args);
 if(['balance','kaspa-balance','krc20-holdings','erc20-holding','kcc20-holdings','kcc20-detail','krc20-operations'].includes(method)&&revision!==generation)throw Error('Wallet or network changed; reload / 钱包或网络已改变，请重新加载');
 return result;
});
ipcMain.handle('dapp-request',async(event,{family,method,params})=>{
  try{
    const browser=[...tabs.tabs.values()].find(t=>t.view.webContents===event.sender)?.view;
    if(!browser||event.sender!==browser.webContents||event.senderFrame!==browser.webContents.mainFrame)throw Error('Unauthorized frame');
    const origin=originOf(event.senderFrame.url);
    const revision=generation,frame=event.senderFrame;
    const valid=()=>!vault.locked&&generation===revision&&event.senderFrame===frame&&browser&&tabs.active===browser&&!browser.webContents.isDestroyed()&&browser.webContents.mainFrame===frame&&originOf(frame.url)===origin;
    if(!['kaspa','evm'].includes(family))throw Error('Unknown provider');
    if(family==='kaspa'&&method==='disconnect'){
      permissions.revoke(origin,family);changed();
      for(const {view} of tabs.tabs.values()){try{if(originOf(view.webContents.getURL())===origin)view.webContents.send('provider-event',{family,event:'accountsChanged',value:[]});}catch{}}
      return {result:null};
    }
    if(family==='evm'&&method==='eth_chainId')return {result:hex(evm.network.chainId)};
    if(family==='evm'&&method==='net_version')return {result:String(evm.network.chainId)};
    if(family==='evm'&&READ_METHODS.has(method))return {result:await evm.read(method,params)};
    if(params!==undefined&&!Array.isArray(params))throw Object.assign(Error('This wallet method requires positional parameters'),{code:-32602});
    const accountMethods=family==='evm'?['eth_accounts','eth_requestAccounts']:['getAccounts','requestAccounts'];
    if(method===accountMethods[0]&&(!permissions.has(origin,family)||vault.locked))return {result:[]};
    if(vault.locked)throw Error('Unlock wallet in the sidebar / 请在侧栏解锁钱包');
    if(method===accountMethods[1]&&!permissions.has(origin,family)){
      await approve(origin,`Allow this site to see your ${family} address? / 允许网站查看钱包地址？`,valid);
      permissions.grant(origin,family);
      emit(family,'accountsChanged',[family==='evm'?vault.evm().address:vault.kaspaIdentity(kaspaService.network).address]);
    }
    if(!permissions.has(origin,family))return {error:{code:4100,message:'Connect wallet first'}};
    const accounts=vault.accounts(kaspaService.network);
    if(accountMethods.includes(method))return {result:[family==='kaspa'?accounts.kaspa.address:accounts.evm]};
    if(family==='kaspa'&&method==='getPublicKey')return {result:accounts.kaspa.publicKey};
    if(family==='kaspa'&&method==='getNetwork')return {result:kaspaService.network};
    if(family==='kaspa'&&method==='switchNetwork'){
      const next=params?.[0];if(!['mainnet','testnet-10'].includes(next))throw Object.assign(Error('Unsupported Kaspa network'),{code:4902});
      await approve(origin,`Switch Kaspa network / 切换 Kaspa 网络: ${next}\nSites will be disconnected / 网站将断开连接`,valid);
      await switchNetwork('kaspa',next);return {result:kaspaService.network};
    }
    if(family==='kaspa'&&method==='getBalance'){const balance=await kaspaService.balance(accounts.kaspa.address);const amount=Number(balance.balanceSompi);if(!Number.isSafeInteger(amount))throw Error('Balance exceeds safe integer range');return {result:{confirmed:amount,unconfirmed:0,total:amount}};}
    if(family==='kaspa'&&method==='signMessage'){
      const {message,options}=messageRequest(params);
      await approve(origin,`Sign Kaspa message / 签署 Kaspa 消息\nKIP-5 · Schnorr (hex)\n${accounts.kaspa.address}\n${message}`,valid);
      return {result:vault.signKaspaMessage(message,options)};
    }
    if(family==='kaspa'&&method==='sendKaspa'){
      if(transactionBusy||networkBusy)throw Object.assign(Error('Another transaction or network switch is pending'),{code:-32002});
      transactionBusy=true;
      try{return {result:await sendKaspa({params,service:kaspaService,address:accounts.kaspa.address,vault,valid,approve:(summary,check)=>approve(origin,summary,check)})};}
      finally{transactionBusy=false;}
    }
    if(family==='kaspa'&&method==='signKRC20Transaction'){
      if(transactionBusy||networkBusy)throw Object.assign(Error('Another transaction or network switch is pending'),{code:-32002});
      transactionBusy=true;
      try{return {result:await sendKrc20({params,service:kaspaService,identity:accounts.kaspa,vault,operations,valid,approve:(summary,check)=>approve(origin,summary,check)})};}
      finally{transactionBusy=false;}
    }
    if(family==='kaspa'&&method==='signPskt'){
      const prepared=inspectPskt(params?.[0],accounts.kaspa.address);
      return {result:await authorizePskt({prepared,service:kaspaService,valid,
        approve:summary=>approve(origin,`${kaspaService.network}\n${summary}`,valid),
        sign:reviewed=>vault.withKaspaKey(key=>signSelected(reviewed,key))})};
    }
    if(family==='evm'&&method==='wallet_switchEthereumChain'){
      const next=NETWORKS.find(n=>hex(n.chainId)===String(params?.[0]?.chainId).toLowerCase());
      if(!next)throw Object.assign(Error('Unknown chain'),{code:4902});
      await approve(origin,`Switch network / 切换网络: ${next.name}`,valid);
      await switchNetwork('evm',hex(next.chainId));return {result:null};
    }
    if(family==='evm'&&method==='personal_sign'){
      const bytes=personalMessage(params,accounts.evm);
      await approve(origin,`Sign message / 签署消息\nAccount: ${accounts.evm}\n${Buffer.from(bytes).toString('utf8')}\n\nHex: ${params[0]}`,valid);
      return {result:await vault.evm().signMessage(bytes)};
    }
    if(family==='evm'&&method==='eth_signTypedData_v4'){
      if(getAddress(params?.[0])!==getAddress(accounts.evm)||typeof params[1]!=='string'||params[1].length>65536)throw Error('Invalid typed data request');
      const typed=JSON.parse(params[1]);
      if(typed.domain?.chainId===undefined||BigInt(typed.domain.chainId)!==BigInt(evm.network.chainId))throw Error('Typed data chain mismatch');
      const types={...typed.types};delete types.EIP712Domain;
      if(TypedDataEncoder.from(types).primaryType!==typed.primaryType)throw Error('Typed data primary type mismatch');
      TypedDataEncoder.hash(typed.domain,types,typed.message);
      await approve(origin,`Sign typed data / 签署结构化数据\n${evm.network.name}\n${JSON.stringify(typed,null,2)}`,valid);
      return {result:await vault.evm().signTypedData(typed.domain,types,typed.message)};
    }
    if(family==='evm'&&method==='eth_sendTransaction'){
      if(transactionBusy)throw Object.assign(Error('Another transaction is pending'),{code:-32002});
      transactionBusy=true;
      try{const prepared=await evm.prepare(params?.[0],accounts.evm);
        if(!valid())throw Error('Request context changed');
        await approve(origin,prepared.summary,valid);
        return {result:await evm.broadcast(prepared,vault.evm(),valid)};
      }finally{transactionBusy=false;}
    }
    return {error:{code:4200,message:`Unsupported method: ${method}`}};
  }catch(error){return {error:{code:Number.isInteger(error.code)?error.code:-32603,message:error.message,...(Object.hasOwn(error,'data')?{data:error.data}:{})}};}
});
app.on('window-all-closed',()=>app.quit());
