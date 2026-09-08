const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const {promisify} = require('node:util');
const {HDNodeWallet, Mnemonic} = require('ethers');
const kaspa = require('@kluster/kaspa-wasm');
const scrypt = promisify(crypto.scrypt);
class Vault {
  #phrase = null;
  constructor(file) { this.file = file; }
  async exists() { try { await fs.access(this.file); return true; } catch { return false; } }
  async key(password, salt) {
    if (typeof password !== 'string' || password.length < 10) throw Error('Password requires at least 10 characters / 密码至少 10 位');
    return scrypt(password, salt, 32, {N:32768,r:8,p:1,maxmem:64*1024*1024});
  }
  async create(password, imported) {
    const phrase = imported ? imported.trim().toLowerCase().replace(/\s+/g,' ') : Mnemonic.fromEntropy(crypto.randomBytes(32)).phrase;
    if (!Mnemonic.isValidMnemonic(phrase)) throw Error('Invalid recovery phrase / 助记词无效');
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = await this.key(password,salt);
    try {
      const cipher = crypto.createCipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(Buffer.from('kaspa-nexus:v1'));
      const ciphertext = Buffer.concat([cipher.update(phrase,'utf8'),cipher.final()]);
      await fs.writeFile(this.file, JSON.stringify({version:1,salt:salt.toString('hex'),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('hex')}),{mode:0o600,flag:'wx'});
      this.#phrase = phrase;
      return imported ? null : phrase;
    } finally { key.fill(0); }
  }
  async unlock(password) {
    const record = JSON.parse(await fs.readFile(this.file,'utf8'));
    if (record.version !== 1) throw Error('Unsupported vault version');
    const key = await this.key(password,Buffer.from(record.salt,'hex'));
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'hex'));
      decipher.setAAD(Buffer.from('kaspa-nexus:v1')); decipher.setAuthTag(Buffer.from(record.tag,'hex'));
      this.#phrase = Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'hex')),decipher.final()]).toString('utf8');
    } catch { throw Error('Incorrect password or damaged vault / 密码错误或钱包文件损坏'); }
    finally { key.fill(0); }
  }
  lock() { this.#phrase = null; }
  get locked() { return this.#phrase === null; }
  evm() { if(this.locked) throw Error('Wallet locked / 钱包已锁定'); return HDNodeWallet.fromPhrase(this.#phrase); }
  kaspaIdentity(network='testnet-10') {
    return this.withKaspaKey(key=>({address:key.toAddress(network).toString(),publicKey:String(key.toKeypair().xOnlyPublicKey)}));
  }
  withKaspaKey(action) {
    if(this.locked) throw Error('Wallet locked / 钱包已锁定');
    const mnemonic = new kaspa.Mnemonic(this.#phrase), xprv = new kaspa.XPrv(mnemonic.toSeed());
    const generator = new kaspa.PrivateKeyGenerator(xprv,false,0n), key = generator.receiveKey(0);
    try { return action(key); }
    finally { key.free(); generator.free(); xprv.free(); mnemonic.free(); }
  }
  signKaspaTransaction(unsigned,address,network){return this.withKaspaKey(key=>{
    if(key.toAddress(network).toString()!==address)throw Error('Kaspa signing account mismatch');
    const tx=kaspa.Transaction.deserializeFromSafeJSON(unsigned);
    let signed;try{signed=kaspa.signTransaction(tx,[key],true);return signed.serializeToSafeJSON();}
    finally{if(signed&&signed!==tx)signed.free();tx.free();}
  });}
  signKaspaMessage(message,options){const request=require('./kaspa-provider.cjs').messageRequest([message,options]);return this.withKaspaKey(privateKey=>kaspa.signMessage({message:request.message,privateKey,noAuxRand:request.options.noAuxRand}));}
  accounts(network) { return this.locked ? null : {evm:this.evm().address,kaspa:this.kaspaIdentity(network)}; }
}
module.exports = {Vault};
