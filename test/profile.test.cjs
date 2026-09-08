const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {preserveProfile}=require('../desktop/profile.cjs');
test('branding retains legacy profile and respects isolated profiles',()=>{
 const base=path.resolve('fake-app-data');
 for(const name of ['kaspa-orbit','Kaspa Orbit','kaspa-nexus']){
  const paths={appData:base,userData:path.join(base,name),sessionData:path.join(base,name)};
  preserveProfile({getName:()=>name,getPath:k=>paths[k],setPath:(k,v)=>paths[k]=v},()=>{});
  assert.equal(paths.userData,path.join(base,'kaspa-nexus'));
  assert.equal(paths.sessionData,paths.userData);
 }
 const isolated={appData:base,userData:path.resolve('isolated-smoke'),sessionData:path.resolve('isolated-session')};
 const before={...isolated};
 preserveProfile({getName:()=>'Kaspa Orbit',getPath:k=>isolated[k],setPath:(k,v)=>isolated[k]=v});
 assert.deepEqual(isolated,before);
});
