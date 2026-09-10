const {test}=require('node:test'),assert=require('node:assert/strict');
const {verifyMetadata}=require('../scripts/verify-packaged-source.cjs');
test('package identity rejects missing, substituted build revisions and dependency declarations',()=>{
 const commit='a'.repeat(40),expected={name:'test-wallet',version:'0.1.0',main:'desktop/main.cjs',dependencies:{example:'1.0.0'}};
 const metadata={...expected,buildRevision:commit};
 assert.doesNotThrow(()=>verifyMetadata(metadata,expected,commit,true));
 assert.throws(()=>verifyMetadata(expected,expected,commit,true),/revision/);
 assert.doesNotThrow(()=>verifyMetadata(expected,expected,commit,false));
 assert.throws(()=>verifyMetadata({...metadata,buildRevision:'b'.repeat(40)},expected,commit),/revision/);
 for(const field of ['name','version','main'])assert.throws(()=>verifyMetadata({...metadata,[field]:'wrong'},expected,commit),/metadata/);
 assert.throws(()=>verifyMetadata({...metadata,dependencies:{example:'2.0.0'}},expected,commit),/dependency/);
});
