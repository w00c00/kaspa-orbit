function buildInfo(metadata=require('../package.json')){
 const revision=typeof metadata.buildRevision==='string'&&/^[0-9a-f]{40}$/.test(metadata.buildRevision)?metadata.buildRevision:null;
 return {version:metadata.version,revision,label:revision?revision.slice(0,7):'local / 本地构建'};
}
module.exports={buildInfo};
