// Own the disposable profile outside Electron. Windows can retain Chromium
// handles during the exit event; never delete its profile inside that event.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
async function main(){
 const electron=require('electron');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-smoke-'));
 try{
  const args=process.argv.slice(2),live=args[0]==='--live';
  const result=spawnSync(electron,[path.join(__dirname,live?'electron-live-readonly.cjs':'electron-smoke.cjs'),...(live?args.slice(1):args)],{
   stdio:'inherit',env:{...process.env,ORBIT_SMOKE_PROFILE:profile},timeout:60000,killSignal:'SIGKILL'
  });
  if(result.error)throw result.error;
  if(result.signal||result.status!==0)throw Error('Desktop smoke process failed: '+(result.signal||result.status));
  console.log('PASS desktop smoke process exited normally');
 }finally{
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  console.log('SMOKE temporary profile removed after Electron exit');
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
