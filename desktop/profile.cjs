const path=require('node:path');
// Branding must never change wallet location. Respect explicit test profiles.
function preserveProfile(app,ensureDirectory=p=>require('node:fs').mkdirSync(p,{recursive:true,mode:0o700})){
 const current=app.getPath('userData');
 if(path.resolve(current)!==path.resolve(app.getPath('appData'),app.getName()))return;
 const stable=path.join(app.getPath('appData'),'kaspa-nexus');
 const session=app.getPath('sessionData');
 ensureDirectory(stable);
 app.setPath('userData',stable);
 if(path.resolve(session)===path.resolve(current))app.setPath('sessionData',stable);
}
module.exports={preserveProfile};
