function originOf(url) { const u = new URL(url); if(u.protocol!=='https:') throw Error('Only HTTPS dApps are allowed'); return u.origin; }
class Permissions {
  constructor(){ this.grants = new Set(); }
  key(origin,family){return `${originOf(origin)}|${family}`;}
  grant(origin,family){this.grants.add(this.key(origin,family));}
  has(origin,family){return this.grants.has(this.key(origin,family));}
  clear(){this.grants.clear();}
  list(){return [...this.grants].map(key=>{const split=key.lastIndexOf('|');return {origin:key.slice(0,split),family:key.slice(split+1)};});}
  revoke(origin,family){this.grants.delete(this.key(origin,family));}
}
module.exports={originOf,Permissions};
