const {contextBridge,ipcRenderer}=require('electron');
let context=0;
ipcRenderer.on('wallet-state',()=>{context++;});
const reads=new Set(['balance','kaspa-balance','krc20-holdings','erc20-holding','kcc20-holdings','kcc20-detail','krc20-operations','history','history-check','permissions']);
const changes=new Set(['wallet-add','wallet-select','wallet-rename','lock','unlock','network','kaspa-network','rpc-save']);
contextBridge.exposeInMainWorld('nexus',{
  invoke:async(method,args)=>{if(changes.has(method))context++;const revision=context;const result=await ipcRenderer.invoke('wallet-ui',method,args);if(reads.has(method)&&revision!==context)throw Error('Wallet or network changed; refresh / 钱包或网络已改变，请刷新');return result;},
  onBrowser:callback=>{ipcRenderer.on('browser-state',(_event,data)=>callback(data));},
  onWallet:callback=>{ipcRenderer.on('wallet-state',()=>callback());},
});
