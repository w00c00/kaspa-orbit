// Compare packaged desktop/UI bytes with an explicit Git revision, not the working tree.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function git(args){
 const result=spawnSync('git',args,{cwd:root,maxBuffer:20*1024*1024});
 if(result.status!==0)throw Error(result.stderr.toString()||'Git failed');
 return result.stdout;
}
function verifyPackagedSource(archive,revision,asar=require('@electron/asar')){
 const commit=git(['rev-parse','--verify',revision+'^{commit}']).toString().trim();
 const files=git(['ls-tree','-r','--name-only',commit,'--','desktop','ui']).toString().trim().split('\n').filter(Boolean);
 if(!files.length)throw Error('Revision has no desktop/UI source');
 const expected=new Set(files);
 for(const file of files){
  const packaged=asar.extractFile(archive,file);
  if(!packaged.equals(git(['show',commit+':'+file])))throw Error('Packaged source mismatch: '+file);
 }
 for(const entry of asar.listPackage(archive)){
  const file=entry.replace(/^[/\\]+/,'').replaceAll('\\','/');
  if(!/^(desktop|ui)\//.test(file))continue;
  const stat=asar.statFile(archive,file);
  if(!stat.files&&!expected.has(file))throw Error('Unexpected packaged source: '+file);
 }
 return {commit,files:files.length};
}
if(require.main===module){
 let [archive,revision]=process.argv.slice(2);
 if(!archive||!revision)throw Error('Usage: node scripts/verify-packaged-source.cjs /path/to/app.asar COMMIT');
 if(archive==='--dist'){
  const fs=require('node:fs');
  const archives=[];
  function find(dir,depth=0){
   if(depth>5)return;
   for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isFile()&&entry.name==='app.asar')archives.push(file);
    else if(entry.isDirectory()&&entry.name!=='node_modules'&&entry.name!=='app.asar.unpacked')find(file,depth+1);
   }
  }
  find(path.join(root,'dist'));
  if(!archives.length)throw Error('No packaged app.asar found in dist');
  for(const file of archives)console.log('PASS packaged source:',file,verifyPackagedSource(file,revision));
 }else{
 console.log('PASS packaged source:',verifyPackagedSource(path.resolve(archive),revision));
 }
}
module.exports={verifyPackagedSource};
