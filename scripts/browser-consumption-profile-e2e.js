const http=require('http'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const root=process.env.ROOT||path.join(__dirname,'..','modules','voyage','www');
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return}const t={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'content-type':t});r.end(b)})});
let fails=0;const ck=(l,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e);console.log((ok?'  ok   ':'  FAIL ')+l+(ok?'':': expected '+JSON.stringify(e)+' got '+JSON.stringify(a)));if(!ok)fails++;};
srv.listen(0,async()=>{const port=srv.address().port;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:1500}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>{errs.push('NATIVE DIALOG '+d.message().slice(0,50));d.dismiss()});
await p.goto(`http://localhost:${port}/voyage_manager.html`);await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('loginGate')?.setAttribute('hidden',''));
await p.evaluate(async()=>{await installTestFleet({switchToFirst:true});});await p.waitForTimeout(3500);
await p.evaluate(()=>{document.getElementById('chengLicenseLock')?.remove();switchTab('setup')});await p.waitForTimeout(1200);
ck('Setup has the profile panel',await p.$$eval('#perfProfileMount .cp-proftable',a=>a.length),2);
const fill=async(sel,v)=>{await p.fill(sel,String(v))};
const q=(c,t,m,k,i)=>`#perfProfileMount input[data-c="${c}"][data-t="${t}"][data-m="${m}"][data-k="${k}"]`+(i!=null?`[data-i="${i}"]`:'');
for(const [c,vals] of [['ballast',{full:[14.5,38,3],eco:[12,27,3],safe:[9.5,18,2.5]}],['laden',{full:[13,40,3],eco:[11,29,3],safe:[9,19,2.5]}]]){
 for(const m of Object.keys(vals)){const [kn,a,b2]=vals[m];await fill(q(c,'sea',m,'kn'),kn);await fill(q(c,'sea',m,'c',0),a);await fill(q(c,'sea',m,'c',1),b2);}
 await fill(q(c,'port','port','c',0),c==='ballast'?2:3);await fill(q(c,'port','port','c',1),c==='ballast'?1.5:1.8);
 await fill(q(c,'port','anchorage','c',0),0);await fill(q(c,'port','anchorage','c',1),1.2);}
await p.waitForTimeout(900);
const saved=await p.evaluate(()=>JSON.parse(JSON.stringify(state.setup.perfProfile)));
ck('saved in the vessel setup',[saved.sea.ballast.full.kn,saved.sea.ballast.full.c[0],saved.sea.laden.eco.c[0],saved.port.ballast.port.c[1]],[14.5,38,29,1.5]);
await p.evaluate(()=>{switchTab('bunkerplan')});await p.waitForTimeout(1500);
ck('the first line starts in Full speed',await p.$eval('tr[data-row="0"] [data-f="mode"]',e=>e.value),'full');
await p.fill('tr[data-row="0"] [data-f="distance"]','1200');await p.waitForTimeout(300);
const v=async(row)=>p.evaluate(r=>{const tr=document.querySelector(`tr[data-row="${r}"]`);return {mode:tr.querySelector('[data-f=mode]').value,speed:tr.querySelector('[data-f=speed]').value,d0:tr.querySelector('[data-f=daily][data-s="0"]').value,d1:tr.querySelector('[data-f=daily][data-s="1"]').value,days:tr.querySelector('[data-f=days]').value}},row);
let r0=await v(0);console.log('   line 0',JSON.stringify(r0));
ck('full speed ballast: speed and both MT/day filled',[r0.speed,r0.d0,r0.d1],['14.5','38','3']);
ck('days follow the speed',Number(r0.days).toFixed(2),(1200/14.5/24).toFixed(2));
await p.selectOption('tr[data-row="0"] [data-f="mode"]','eco');await p.waitForTimeout(300);r0=await v(0);ck('eco speed',[r0.speed,r0.d0],['12','27']);
await p.selectOption('tr[data-row="0"] [data-f="mode"]','safe');await p.waitForTimeout(300);r0=await v(0);ck('safe speed',[r0.speed,r0.d0,r0.d1],['9.5','18','2.5']);
await p.selectOption('[data-cp="cond"]','laden');await p.waitForTimeout(300);r0=await v(0);ck('laden safe speed',[r0.speed,r0.d0],['9','19']);
await p.click('[data-act="add-leg"]');await p.waitForTimeout(300);
let r1=await v(1);ck('a new line takes the previous mode',[r1.mode,r1.speed],['safe','9']);
await p.check('tr[data-row="1"] [data-f="port"]');await p.waitForTimeout(300);r1=await v(1);ck('a port line gets Port mode with the port consumption',[r1.mode,r1.d0,r1.d1],['port','3','1.8']);
await p.selectOption('tr[data-row="1"] [data-f="mode"]','anchorage');await p.waitForTimeout(300);r1=await v(1);ck('anchorage',[r1.d0,r1.d1],['0','1.2']);
await p.fill('tr[data-row="0"] [data-f="speed"]','11');await p.waitForTimeout(300);r0=await v(0);ck('typing a speed makes the line Manual',[r0.mode,r0.speed],['','11']);
await p.selectOption('tr[data-row="0"] [data-f="mode"]','full');await p.waitForTimeout(300);r0=await v(0);ck('and picking a mode again restores the profile',[r0.speed,r0.d0],['13','40']);
await p.evaluate(()=>{switchTab('setup')});await p.waitForTimeout(600);await p.evaluate(()=>{switchTab('bunkerplan')});await p.waitForTimeout(1200);
r0=await v(0);ck('survives a revisit',[r0.mode,r0.speed],['full','13']);
// edit the profile inside the plan page
await p.click('details.cp-profile > summary');await p.waitForTimeout(500);
ck('the profile can be opened on the plan page',await p.$$eval('details.cp-profile .cp-proftable',a=>a.length),2);
await p.fill('details.cp-profile input[data-c="laden"][data-t="sea"][data-m="full"][data-k="kn"]','12');await p.waitForTimeout(900);r0=await v(0);ck('a profile change reaches the lines at once',r0.speed,'12');
ck('no page errors and no native dialogs',errs,[]);
await b.close();srv.close();console.log(fails?fails+' FAILED':'all ok');process.exit(fails?1:0)});
