// Research-only full compile probe. Never loaded by the wallet or deployed.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync,spawnSync}=require('node:child_process');
const [repo,compiler,candidate]=process.argv.slice(2);
if(!repo||!compiler||!candidate)throw Error('Usage: node scripts/probe-kcc20-compiler.cjs official-repo silverc candidate.sil');
const expected='158534d606e9d5541e932c7575ff331e12699fb5';
const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==expected||git('status','--porcelain','--untracked-files=no'))throw Error('Official compiler checkout must match clean pinned revision');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const out=path.resolve(__dirname,'../research/kcc20-158534d');fs.mkdirSync(out,{recursive:true});
const owner={kind:'bytes',value:[...Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798','hex')]};
const int=value=>({kind:'int',value}),byte=value=>({kind:'byte',value}),bool=value=>({kind:'bool',value});
const cases=[{name:'official',source:path.join(repo,'silverscript-lang/tests/examples/kcc20.sil'),args:[owner,int(1000000),byte(0),bool(false),int(4),int(6)]},{name:'kaha-unmodified',source:path.resolve(candidate),args:[int(4),int(6),owner,byte(3),int(1000000),bool(false)]}];
const report={checkedAt:new Date().toISOString(),compilerCommit:expected,compilerSha256:hash(compiler),cargoLockSha256:hash(path.join(repo,'Cargo.lock')),rustc:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),cases:[],mainnetReady:false};
for(const probe of cases){
 const argsFile=path.join(out,probe.name+'-args.json'),artifact=path.join(out,probe.name+'-artifact.json');
 fs.writeFileSync(argsFile,JSON.stringify(probe.args,null,2));
 // Never mistake a prior successful output for this invocation's result.
 if(fs.existsSync(artifact))throw Error('Existing research artifact: choose a fresh output directory before repeating');
 const result=spawnSync(path.resolve(compiler),[probe.source,'--constructor-args',argsFile,'-o',artifact],{encoding:'utf8',timeout:120000,maxBuffer:1048576});
 const entry={name:probe.name,source:probe.source,sourceSha256:hash(probe.source),exitCode:result.status,diagnostics:(result.stderr||'')+(result.error?.message||''),fullCompilationSucceeded:result.status===0&&fs.existsSync(artifact)};
 if(entry.fullCompilationSucceeded)entry.artifactSha256=hash(artifact);
 report.cases.push(entry);
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
