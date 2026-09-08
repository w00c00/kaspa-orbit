// Public read-only research capture. Never accesses a vault or broadcasts.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {Kcc20Source}=require('../desktop/kcc20.cjs');const {KaspaService}=require('../desktop/kaspa.cjs');const {verifyCovenantCell}=require('../desktop/covenant-state.cjs');
const [network,id]=process.argv.slice(2);
if(!['mainnet','testnet-10'].includes(network)||!/^[a-f0-9]{64}$/.test(id||''))throw Error('Usage: node scripts/capture-kcc20-cell.cjs network covenant-id');
(async()=>{
 const source=new Kcc20Source(),service=new KaspaService();service.network=network;
 const page=await source.cells(network,id,{limit:2});const records=[];
 for(const candidate of page.cells){
  const verified=await verifyCovenantCell(service,candidate);
  if(verified.valueSompi!==candidate.valueSompi)throw Error('Indexer value disagrees with node');
  const bytes=Buffer.from(verified.programHex,'hex');
  records.push({candidate,verified,programBytes:bytes.length,programSha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 const report={capturedAt:new Date().toISOString(),network,covenantId:id,source:'https://kascov.io/openapi.json',omittedOverLimit:page.omittedOverLimit,records,note:'Historical read-only observation. Recheck liveness before constructing any spend. No ABI or safety claim.'};
 const dir=path.resolve(__dirname,'../research/live-kcc20');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,`${network}-${id}-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({file,capturedAt:report.capturedAt,records:records.map(r=>({outpoint:r.verified.transactionId+':'+r.verified.index,ownerType:r.candidate.reportedOwner.slice(0,2),programBytes:r.programBytes,programSha256:r.programSha256,liveBindingVerified:r.verified.liveBindingVerified,contractSemanticsVerified:false}))},null,2));
 process.exit(0); // Standalone probe: close any WASM transport background handles.
})().catch(error=>{console.error(error.message);process.exit(1);});
