const {test}=require('node:test');const assert=require('node:assert/strict');
const {inspectProgram,encodeOrdinaryOutput,encodeAddressUnlock}=require('../desktop/kcc20-codec.cjs');
const {programHex}=require('./fixtures/kcc20-2433.json');
test('exact KCC20 codec preserves deployed suffix and requires atomic-unit amounts',()=>{
 const original=inspectProgram(programHex);assert.equal(original.amount,'1000000');
 const state={owner:'11'.repeat(32),identifierType:3,amount:'1000000000'};
 const output=encodeOrdinaryOutput(programHex,state);assert.equal(output.slice(92),programHex.slice(92));
 assert.deepEqual(inspectProgram(output),{profile:original.profile,...state,isMinter:false});
 for(const amount of ['0','-1','1000000001','1.2','1e3',1])assert.throws(()=>encodeOrdinaryOutput(programHex,{...state,amount}));
 assert.throws(()=>encodeOrdinaryOutput(programHex,{...state,isMinter:true}));
});
test('KCC20 codec rejects template mutation, malformed layout and signed/invalid states',()=>{
 for(const [offset,value] of [[2432,0],[0,31],[33,2],[35,7],[44,2],[34,4],[45,2],[43,128]]){
  const bytes=Buffer.from(programHex,'hex');bytes[offset]=value;assert.throws(()=>inspectProgram(bytes.toString('hex')));
 }
 assert.throws(()=>inspectProgram(programHex.slice(2)));assert.throws(()=>inspectProgram('zz'.repeat(2433)));
});
test('address unlock packs exact state columns and bounded P2PK witness indexes',()=>{
 const reference=encodeOrdinaryOutput(programHex,{owner:'11'.repeat(32),identifierType:3,amount:'1000'});
 const outputs=[{owner:'22'.repeat(32),identifierType:3,amount:'400'},{owner:'11'.repeat(32),identifierType:3,amount:'600'}];
 const layout={tokenInputCount:2,ownerInputIndex:2,totalInputCount:3};
 const bytes=Buffer.from(encodeAddressUnlock(reference,outputs,layout),'hex');const fields=[];
 for(let i=0;i<bytes.length;){let n=bytes[i++];if(n===0x4c)n=bytes[i++];else if(n===0x4d){n=bytes.readUInt16LE(i);i+=2;}fields.push(bytes.subarray(i,i+n));i+=n;}
 assert.equal(fields.length,7);assert.equal(fields[0].toString('hex'),'22'.repeat(32)+'11'.repeat(32));assert.deepEqual([...fields[1]],[3,3]);
 assert.equal(fields[2].readBigUInt64LE(0),400n);assert.equal(fields[2].readBigUInt64LE(8),600n);
 assert.deepEqual([...fields[3]],[0,0]);assert.equal(fields[4].length,0);assert.deepEqual([...fields[5]],[2,2]);assert.equal(fields[6].toString('hex'),reference);
 for(const patch of [{ownerInputIndex:0},{ownerInputIndex:3},{tokenInputCount:5},{totalInputCount:257}])assert.throws(()=>encodeAddressUnlock(reference,outputs,{...layout,...patch}));
 assert.throws(()=>encodeAddressUnlock(reference,[],layout));assert.throws(()=>encodeAddressUnlock(reference,Array(6).fill(outputs[0]),layout));
});
