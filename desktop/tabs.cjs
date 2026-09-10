const {originOf}=require('./policy.cjs');
class BrowserTabs{
 constructor({window,createView,onChange,onNavigate,onInput}){Object.assign(this,{window,createView,onChange,onNavigate,onInput});this.tabs=new Map();this.activeId=null;this.sequence=0;}
 get active(){return this.tabs.get(this.activeId)?.view;}
 owns(contents){return [...this.tabs.values()].some(t=>t.view.webContents===contents);}
 state(){return [...this.tabs.values()].map(({id,view,loading=false,error=null})=>({id,title:view.webContents.getTitle()||'New tab / 新标签',url:view.webContents.getURL(),active:id===this.activeId,loading,error}));}
 notify(){this.onChange(this.state());}
 layout(){const [width,height]=this.window.getContentSize();for(const {id,view} of this.tabs.values()){view.setVisible(id===this.activeId);if(id===this.activeId)view.setBounds({x:350,y:140,width:Math.max(0,width-350),height:Math.max(0,height-140)});}}
 select(id){if(!this.tabs.has(id))throw Error('Tab not found');this.activeId=id;this.onNavigate();this.layout();this.notify();}
 async open(url,newTab=false){
  originOf(url);
  if(newTab||!this.active){
   if(this.tabs.size>=12)throw Error('Maximum 12 tabs / 最多打开 12 个标签');
   const view=this.createView(),id=++this.sequence;
   this.tabs.set(id,{id,view});this.window.contentView.addChildView(view);
   const update=values=>{const tab=this.tabs.get(id);if(tab){Object.assign(tab,values);this.notify();}};
   view.webContents.on('did-start-loading',()=>update({loading:true,error:null}));
   view.webContents.on('did-stop-loading',()=>update({loading:false}));
   view.webContents.on('did-fail-load',(_event,code,description,_url,main)=>{if(main&&code!==-3)update({loading:false,error:`${description} (${code})`});});
   view.webContents.on('before-input-event',()=>this.onInput?.());
   view.webContents.on('did-start-navigation',(_event,_url,_inPlace,main)=>{if(main)this.onNavigate();});
   for(const event of ['did-navigate','did-navigate-in-page','page-title-updated','did-stop-loading'])view.webContents.on(event,()=>this.notify());
   for(const event of ['will-navigate','will-redirect'])view.webContents.on(event,(event,url)=>{try{originOf(url);}catch{event.preventDefault();}});
   view.webContents.setWindowOpenHandler(({url})=>{try{originOf(url);void this.open(url,true).catch(()=>{});}catch{}return {action:'deny'};});
   this.select(id);
  }
  await this.active.webContents.loadURL(url);this.notify();
 }
 close(id){const tab=this.tabs.get(id);if(!tab)throw Error('Tab not found');this.tabs.delete(id);this.window.contentView.removeChildView(tab.view);tab.view.webContents.close();if(id===this.activeId)this.activeId=[...this.tabs.keys()].at(-1)??null;this.onNavigate();this.layout();this.notify();}
 emit(family,event,value,permissions){for(const {view} of this.tabs.values()){try{const origin=originOf(view.webContents.getURL());if(event==='accountsChanged'&&value.length&&!permissions.has(origin,family))continue;view.webContents.send('provider-event',{family,event,value});}catch{}}}
 destroy(){for(const {view} of this.tabs.values())if(!view.webContents.isDestroyed())view.webContents.close();this.tabs.clear();}
}
module.exports={BrowserTabs};
