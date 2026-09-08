const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('nexus',{
  invoke:(method,args)=>ipcRenderer.invoke('wallet-ui',method,args),
  onBrowser:callback=>{ipcRenderer.on('browser-state',(_event,data)=>callback(data));},
  onWallet:callback=>{ipcRenderer.on('wallet-state',()=>callback());},
});
