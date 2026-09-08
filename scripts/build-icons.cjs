// Render our vector artwork with Chromium; no wallet profile is opened.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-icons-'));
app.setPath('userData',profile);app.setPath('sessionData',profile);
process.on('exit',()=>fs.rmSync(profile,{recursive:true,force:true}));
app.whenReady().then(async()=>{
  const root=path.resolve(__dirname,'..');const out=path.join(root,'build');fs.mkdirSync(out,{recursive:true});
  const window=new BrowserWindow({show:false,width:1024,height:1024,useContentSize:true,transparent:true,webPreferences:{sandbox:true,contextIsolation:true}});
  const svg=fs.readFileSync(path.join(root,'ui/icon.svg'),'utf8');
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>'+svg));
  const capture=await window.webContents.capturePage({x:0,y:0,width:1024,height:1024});
  fs.writeFileSync(path.join(out,'icon.png'),capture.resize({width:1024,height:1024}).toPNG());
  const sizes=[16,32,48,64,128,256];const images=sizes.map(size=>capture.resize({width:size,height:size}).toPNG());
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  images.forEach((png,i)=>{const p=6+16*i;header[p]=header[p+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;});
  fs.writeFileSync(path.join(out,'icon.ico'),Buffer.concat([header,...images]));
  console.log('Rendered PNG and multi-resolution ICO');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
