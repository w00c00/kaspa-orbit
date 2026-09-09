// Run against an explicit, clean pinned upstream checkout. No wallet RPC/broadcast.
// Cargo may download locked build dependencies when absent from its cache.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const PIN='158534d606e9d5541e932c7575ff331e12699fb5';
const root=path.resolve(__dirname,'..'),upstream=process.argv[2]&&path.resolve(process.argv[2]);
function git(...args){const r=spawnSync('git',['-C',upstream,...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'Git failed');return r.stdout.trim();}
if(!upstream)throw Error('Usage: node scripts/run-kcc20-engine.cjs /path/to/silverscript');
if(git('rev-parse','HEAD')!==PIN)throw Error('Expected SilverScript commit '+PIN);
if(git('diff','HEAD','--name-only'))throw Error('Upstream tracked files must be clean');
const target=path.join(upstream,'silverscript-lang/tests/orbit_wallet_repro.rs');
fs.writeFileSync(target,fs.readFileSync(path.join(root,'test/engine/orbit_live_token.rs')),{flag:'wx'});
try{
 const run=spawnSync('cargo',['test','--locked','--manifest-path',path.join(upstream,'Cargo.toml'),'-p','silverscript-lang','--test','orbit_wallet_repro','orbit_','--','--nocapture'],{stdio:'inherit',env:{...process.env,ORBIT_WALLET_ROOT:root}});
 if(run.error)throw run.error;
 process.exitCode=run.status??1;
}finally{fs.unlinkSync(target);}
