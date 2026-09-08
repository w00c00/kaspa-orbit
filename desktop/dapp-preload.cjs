const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('__nexusTransport',{
  request:(family,method,params)=>ipcRenderer.invoke('dapp-request',{family,method,params}),
  listen:callback=>{ipcRenderer.on('provider-event',(_event,data)=>callback(data));},
});
contextBridge.executeInMainWorld({func:()=>{
  const transport=window.__nexusTransport;
  const providers={};
  function provider(family){
    const listeners=new Map();
    const api={isNexus:true,
      async request({method,params=[]}){
        if(typeof method!=='string'||!Array.isArray(params))throw Object.assign(new Error('Invalid request'),{code:-32602});
        const response=await transport.request(family,method,params);
        if(response.error)throw Object.assign(new Error(response.error.message),{code:response.error.code});
        return response.result;
      },
      on(event,fn){if(typeof fn!=='function')throw new TypeError('Listener must be a function');const list=listeners.get(event)||[];list.push(fn);listeners.set(event,list);return api;},
      removeListener(event,fn){const list=listeners.get(event)||[];const i=list.lastIndexOf(fn);if(i>=0)list.splice(i,1);return api;},
    };
    providers[family]={api,emit(event,value){for(const fn of [...(listeners.get(event)||[])]){try{fn(value);}catch{}}}};
    return api;
  }
  const ethereum=provider('evm');
  ethereum.sendAsync=(payload,callback)=>ethereum.request(payload).then(result=>callback(null,{id:payload.id,jsonrpc:'2.0',result}),error=>callback(error,null));
  ethereum.enable=()=>ethereum.request({method:'eth_requestAccounts'});
  const kasware=provider('kaspa');kasware.isKasware=true;
  ethereum.isKasWare=true;
  Object.defineProperty(kasware,'ethereum',{value:ethereum,writable:false,configurable:false,enumerable:true});
  for(const name of ['requestAccounts','getAccounts','getPublicKey','getNetwork','getBalance','disconnect'])kasware[name]=()=>kasware.request({method:name});
  kasware.switchNetwork=network=>kasware.request({method:'switchNetwork',params:[network]});
  kasware.sendKaspa=(recipient,sompi,options={})=>kasware.request({method:'sendKaspa',params:[recipient,sompi,options]});
  kasware.signMessage=(message,options={})=>kasware.request({method:'signMessage',params:[message,options]});
  kasware.signPskt=request=>kasware.request({method:'signPskt',params:[request]});
  kasware.signKRC20Transaction=(inscription,type,destination,priorityFee=0)=>kasware.request({method:'signKRC20Transaction',params:[inscription,type,destination,priorityFee]});
  kasware.getVersion=()=>Promise.resolve('0.1.0');
  Object.defineProperty(window,'ethereum',{value:ethereum,writable:false,configurable:false});
  Object.defineProperty(window,'kasware',{value:kasware,writable:false,configurable:false});
  transport.listen(({family,event,value})=>providers[family]?.emit(event,value));
  const info=Object.freeze({uuid:crypto.randomUUID(),name:'Kaspa Orbit',rdns:'org.kaspa.nexus',icon:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect x="48" y="48" width="928" height="928" rx="224" fill="#102a2d"/><path d="M280 272h104v480H280zM574 272h142L500 506l230 246H584L354 506z" fill="#80dbcb"/><path d="M731 423h58v58h-58zM790 499h42v42h-42zM731 559h58v58h-58z" fill="#70cfbe"/></svg>')});
  const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:Object.freeze({info,provider:ethereum})}));
  window.addEventListener('eip6963:requestProvider',announce);announce();
  const kaspaInfo=Object.freeze({...info,id:'org.kaspa.nexus',methods:Object.freeze(['kaspa:requestAccounts','kaspa:getAccounts','kaspa:getNetwork','kaspa:getPublicKey','kaspa:signMessage','kaspa:signPskt'])});
  const announceKaspa=()=>window.dispatchEvent(new CustomEvent('kaspa:provider',{detail:Object.freeze({info:kaspaInfo,provider:kasware})}));
  window.addEventListener('kaspa:requestProvider',announceKaspa);announceKaspa();
}});
