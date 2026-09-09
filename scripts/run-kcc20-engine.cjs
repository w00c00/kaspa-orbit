// Run against an explicit, clean pinned upstream checkout. No wallet RPC/broadcast.
// Cargo may download locked build dependencies when absent from its cache.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const PIN='3ed973335b59269293564805cc2c58a14595ec03'; // Official SilverScript v1.0.0
const root=path.resolve(__dirname,'..'),upstream=process.argv[2]&&path.resolve(process.argv[2]);
function git(...args){const r=spawnSync('git',['-C',upstream,...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'Git failed');return r.stdout.trim();}
if(!upstream)throw Error('Usage: node scripts/run-kcc20-engine.cjs /path/to/silverscript');
if(git('rev-parse','HEAD')!==PIN)throw Error('Expected SilverScript commit '+PIN);
if(git('diff','HEAD','--name-only'))throw Error('Upstream tracked files must be clean');
const target=path.join(upstream,'silverscript-lang/tests/orbit_wallet_repro.rs');
fs.writeFileSync(target,fs.readFileSync(path.join(root,'test/engine/orbit_live_token.rs')),{flag:'wx'});
try{
 const temporary=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'orbit-v1-compile-'));
 try {
  const artifact=path.join(temporary,'artifact.json');
  const compile=spawnSync('cargo',['run','--locked','--manifest-path',path.join(upstream,'Cargo.toml'),'-p','silverscript-lang','--bin','silverc','--',path.join(root,'test/fixtures/kcc20-v1-probe.sil'),'--constructor-args',path.join(root,'test/fixtures/silverscript-v1-args.json'),'-o',artifact],{stdio:'inherit'});
  if(compile.error||compile.status!==0)throw Error('SilverScript v1 full compilation failed');
  const compiled=JSON.parse(fs.readFileSync(artifact,'utf8'));
  const contract=compiled.contracts.Kcc20,program=contract.compiled;
  const abiHash=require('node:crypto').createHash('sha256').update(JSON.stringify({schema:compiled.schema_version,structs:compiled.structs,state:contract.runtime_state,entries:contract.entries})).digest('hex');
  if(abiHash!=='386554af75e4e19143177a3cba659b2559b030276d9138243c6fba33f6dd974d')throw Error('Pinned v1 ABI changed; review dispatch, argument types and state layout');
  const hash=require('node:crypto').createHash('sha256').update(Buffer.from(program.bytecode)).digest('hex');
  if(compiled.compiler_version!=='0.1.0'||hash!=='a3e6a3525ae1dffcc1e284246c41e2b5d6c15d421999a46cc46ec8889c1b7dff'||program.state_span.offset!==1||program.state_span.len!==46)throw Error('Pinned v1 compiler artifact changed; review before updating compatibility baseline');
  console.log('PASS v1.0.0 full compilation and bytecode compatibility baseline (not a deployment approval)');
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
 const run=spawnSync('cargo',['test','--locked','--manifest-path',path.join(upstream,'Cargo.toml'),'-p','silverscript-lang','--test','orbit_wallet_repro','orbit_','--','--nocapture'],{stdio:'inherit',env:{...process.env,ORBIT_WALLET_ROOT:root}});
 if(run.error)throw run.error;
 process.exitCode=run.status??1;
}finally{fs.unlinkSync(target);}
