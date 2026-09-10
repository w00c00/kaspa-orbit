const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildInfo}=require('../desktop/build-info.cjs');
test('build identity uses only a complete packaged commit and labels local builds honestly',()=>{
 const revision='a'.repeat(40);
 assert.deepEqual(buildInfo({version:'0.1.0',buildRevision:revision}),{version:'0.1.0',revision,label:'aaaaaaa'});
 for(const buildRevision of [undefined,'main','aaaaaaa','<script>',42])assert.equal(buildInfo({version:'0.1.0',buildRevision}).revision,null);
 assert.match(buildInfo({version:'0.1.0'}).label,/local/);
});
