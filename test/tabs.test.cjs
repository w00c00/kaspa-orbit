const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {BrowserTabs}=require('../desktop/tabs.cjs');const {Permissions}=require('../desktop/policy.cjs');
function setup(){const views=[],changes=[];const window={contentView:{addChildView(){},removeChildView(){}},getContentSize:()=>[1200,800]};const tabs=new BrowserTabs({window,onNavigate(){},onChange:s=>changes.push(s),createView:()=>{const wc=new EventEmitter();Object.assign(wc,{url:'',sent:[],getTitle:()=>wc.url,getURL:()=>wc.url,loadURL:async url=>{wc.url=url;},setWindowOpenHandler:fn=>wc.popup=fn,send:(channel,data)=>wc.sent.push(data),close:()=>{wc.closed=true;},isDestroyed:()=>!!wc.closed});const view={webContents:wc,setVisible:v=>view.visible=v,setBounds:b=>view.bounds=b};views.push(view);return view;}});return {tabs,views,changes};}
test('loading and failures stay per-tab and ignore subframes and cancelled loads',async()=>{
 const {tabs,views}=setup();await tabs.open('https://one.example');await tabs.open('https://two.example',true);
 const wc=views[0].webContents;wc.emit('did-start-loading');assert.equal(tabs.state()[0].loading,true);assert.equal(tabs.state()[1].loading,false);
 wc.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://frame.example',false);assert.equal(tabs.state()[0].error,null);
 wc.emit('did-fail-load',{},-3,'ERR_ABORTED','https://one.example',true);assert.equal(tabs.state()[0].error,null);
 wc.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://one.example',true);assert.match(tabs.state()[0].error,/ERR_NAME/);assert.equal(tabs.state()[0].loading,false);
 wc.emit('did-start-loading');assert.equal(tabs.state()[0].error,null);wc.emit('did-stop-loading');assert.equal(tabs.state()[0].loading,false);
 tabs.close(1);assert.doesNotThrow(()=>wc.emit('did-stop-loading'));
});
test('renderer exit invalidates pending requests and exposes reload guidance',async()=>{
 const {tabs,views}=setup();await tabs.open('https://one.example');let invalidated=0;tabs.onNavigate=()=>invalidated++;
 const wc=views[0].webContents;wc.emit('did-start-loading');wc.emit('render-process-gone',{}, {reason:'crashed'});
 assert.equal(invalidated,1);assert.equal(tabs.state()[0].loading,false);assert.match(tabs.state()[0].error,/reload.*crashed/);
 wc.emit('did-start-loading');assert.equal(tabs.state()[0].error,null);
 tabs.close(1);const before=invalidated;wc.emit('render-process-gone',{}, {reason:'clean-exit'});assert.equal(invalidated,before);
});
test('tabs retain pages, select and close independent web contents',async()=>{const {tabs,views}=setup();await tabs.open('https://one.example',true);await tabs.open('https://two.example',true);assert.equal(views[0].visible,false);assert.equal(views[1].visible,true);tabs.select(1);assert.equal(tabs.active,views[0]);assert.equal(views[0].webContents.url,'https://one.example');tabs.close(1);assert.equal(views[0].webContents.closed,true);assert.equal(tabs.active,views[1]);await assert.rejects(tabs.open('file:///etc/passwd'));});
test('account events never leak to an unauthorized tab',async()=>{const {tabs,views}=setup();await tabs.open('https://one.example',true);await tabs.open('https://two.example',true);const permissions=new Permissions();permissions.grant('https://one.example','evm');tabs.emit('evm','accountsChanged',['0x123'],permissions);assert.equal(views[0].webContents.sent.length,1);assert.equal(views[1].webContents.sent.length,0);permissions.revoke('https://one.example','evm');assert.equal(permissions.list().length,0);tabs.emit('evm','accountsChanged',[],permissions);assert.equal(views[1].webContents.sent.length,1);});
test('top-level navigation invalidates requests and permissions do not follow a redirect',async()=>{
 const {tabs,views}=setup();let invalidated=0;tabs.onNavigate=()=>invalidated++;
 await tabs.open('https://one.example',true);const wc=views[0].webContents;
 const permissions=new Permissions();permissions.grant('https://one.example','evm');
 const before=invalidated;
 wc.emit('did-start-navigation',{},'https://two.example',false,false);assert.equal(invalidated,before);
 wc.emit('did-start-navigation',{},'https://two.example',false,true);assert.equal(invalidated,before+1);
 wc.url='https://two.example';tabs.emit('evm','accountsChanged',['0x123'],permissions);assert.equal(wc.sent.length,0);
 for(const event of ['will-navigate','will-redirect']){
  for(const url of ['file:///tmp/test','javascript:alert(1)','data:text/html,test']){
   let prevented=false;wc.emit(event,{preventDefault(){prevented=true;}},url);assert.equal(prevented,true);
  }
 }
 assert.equal(wc.popup({url:'file:///tmp/test'}).action,'deny');assert.equal(tabs.tabs.size,1);
});
