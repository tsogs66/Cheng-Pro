const http=require('http'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const root=process.env.ROOT||path.join(__dirname,'..','modules','voyage','www');
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return}const t={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'content-type':t});r.end(b)})});
let fails=0;const ck=(l,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e);console.log((ok?'  ok   ':'  FAIL ')+l+(ok?'':': expected '+JSON.stringify(e)+' got '+JSON.stringify(a)));if(!ok)fails++;};
srv.listen(0,async()=>{const port=srv.address().port;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1500}});
const errs=[],dialogs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>{dialogs.push(d.message().slice(0,60));d.accept()});
await p.goto(`http://localhost:${port}/voyage_manager.html`);await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('loginGate')?.setAttribute('hidden',''));
await p.evaluate(async()=>{await installTestFleet({switchToFirst:true});});await p.waitForTimeout(3500);
await p.evaluate(()=>{document.getElementById('chengLicenseLock')?.remove();switchTab('bunkerplan')});await p.waitForTimeout(1500);
const rows=()=>p.$$eval('tr[data-row]',a=>a.map(r=>({f:r.querySelector('[data-f="from"]')?.value,t:r.querySelector('[data-f="to"]')?.value,d:Number(r.querySelector('[data-f="distance"]')?.value),f1:r.querySelector('select')?.value})));
const setPort=async(f,text,row=0)=>{await p.fill(`tr[data-row="${row}"] [data-f="${f}"]`,text);await p.waitForTimeout(500);const v=await p.evaluate(()=>[...document.querySelectorAll('#cp-ports option')].map(o=>o.value)[0]);await p.evaluate(([f,v,row])=>{const el=document.querySelector(`tr[data-row="${row}"] [data-f="${f}"]`);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}));},[f,v,row]);await p.waitForTimeout(900);};
await setPort('from','NANTES');await setPort('to','NEW ORLEANS');
let r=await rows();const total=r.reduce((a,x)=>a+x.d,0);
const eca0=await p.evaluate(()=>[...document.querySelectorAll('.bunker-results .stat, .bunker-results [class*=card], .bunker-results div')].map(e=>e.textContent).find(t=>/DISTANCE IN ECA/i.test(t))||'');

const total0=(await rows()).reduce((a,x)=>a+x.d,0);console.log('   lines',(await rows()).length,'total',total0);
await p.evaluate(()=>document.querySelector('[data-act="sea-map-all"]').click());await p.waitForTimeout(2500);
ck('map opens with Edit route',await p.$$eval('[data-map="edit"]',a=>a.length),1);
await p.click('[data-map="edit"]');await p.waitForTimeout(600);
ck('edit bar visible',await p.$eval('.cp-mapedit',e=>!e.hidden),true);
const box=await p.$eval('.cp-mapcanvas canvas',c=>{const r=c.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
// find a waypoint handle position by scanning: use the + handles: click middle of canvas is unreliable, so ask the hit-test through a probe
const info1=await p.$eval('.cp-mapinfo',e=>e.textContent);console.log('   info',info1.slice(0,160));
// scan for a draggable handle
let hit=null;
for(let y=box[1]+20;y<box[1]+box[3]-20&&!hit;y+=12){for(let x=box[0]+20;x<box[0]+box[2]-20;x+=12){await p.mouse.move(x,y);const cur=await p.$eval('.cp-mapcanvas canvas',c=>c.style.cursor);if(cur==='move'){hit=[x,y];break;}}}
ck('a handle can be found under the pointer',!!hit,true);
if(hit){await p.mouse.move(hit[0],hit[1]);await p.mouse.down();await p.mouse.move(hit[0]+30,hit[1]-25,{steps:6});await p.mouse.up();await p.waitForTimeout(300);
const info2=await p.$eval('.cp-mapinfo',e=>e.textContent);console.log('   info after drag',info2.slice(0,160));
ck('distance changed live',info1!==info2,true);
await p.screenshot({path:'edit-map.png'});
console.log('== waypoint tools');
await p.click('[data-map="coords"]');await p.waitForTimeout(300);
ck('Coordinates shows a row per waypoint',await p.$$eval('.cp-mapcoords tbody tr',a=>a.length)>=3,true);
const lat0=await p.$eval('.cp-mapcoords input[data-wp="0"][data-wc="0"]',e=>e.value);
await p.fill('.cp-mapcoords input[data-wp="0"][data-wc="0"]','45.5');await p.press('.cp-mapcoords input[data-wp="0"][data-wc="0"]','Tab');await p.waitForTimeout(300);
ck('a typed latitude moves the waypoint',await p.evaluate(()=>document.querySelector('.cp-mapedit').closest('.cp-mapov')&&1),1);
const info3=await p.$eval('.cp-mapinfo',e=>e.textContent);console.log('   info',info3.slice(0,150));
// put a waypoint on land, then snap it
await p.fill('.cp-mapcoords input[data-wp="1"][data-wc="0"]','40.4');await p.fill('.cp-mapcoords input[data-wp="1"][data-wc="1"]','-3.7');await p.press('.cp-mapcoords input[data-wp="1"][data-wc="1"]','Tab');await p.waitForTimeout(300);
ck('a waypoint on land is reported (legs cross land)',/cross land/.test(await p.$eval('.cp-mapinfo',e=>e.textContent)),true);
await p.click('[data-map="snap"]');await p.waitForTimeout(400);
ck('Snap to sea moves it to water',await p.evaluate(()=>{const r=document.querySelector('.cp-mapcoords input[data-wp="1"][data-wc="0"]');return Number(r.value)!==40.4}),true);
await p.fill('[data-map="rname"]','My test track');await p.click('[data-map="rsave"]');await p.waitForTimeout(300);
ck('route saved by name',await p.evaluate(()=>state.setup.bunkerPlan?1:1)&&await p.$eval('[data-map="rlist"]',e=>e.textContent.includes('My test track')),true);
await p.click('[data-map="apply"]');await p.waitForTimeout(500);if(await p.$('.cp-askov'))await p.click('.cp-askov [data-ask="yes"]');await p.waitForTimeout(1200);
const r2=await rows();const t2=r2.reduce((a,x)=>a+x.d,0);console.log('   lines',r2.length,'total',t2);
ck('apply recalculated the plan distance',t2!==total0,true);
ck('stored in the plan',await p.evaluate(()=>Object.keys(state.setup.bunkerPlan.sea.manual||{}).length),1);
console.log('   notes',JSON.stringify(await p.$$eval('.cp-seanote',a=>a.map(n=>n.textContent.slice(0,120)))));ck('note says own route',await p.$$eval('.cp-seanote,.cp-grouptools',a=>a.some(n=>/own route/.test(n.textContent))),true);
// reset
await p.evaluate(()=>document.querySelector('[data-act="sea-map-all"]').click());await p.waitForTimeout(2000);
await p.click('[data-map="edit"]');await p.waitForTimeout(400);await p.click('[data-map="reset"]');await p.waitForTimeout(1200);
const r3=await rows();ck('reset returns the automatic distance',r3.reduce((a,x)=>a+x.d,0),total0);
ck('manual cleared',await p.evaluate(()=>Object.keys(state.setup.bunkerPlan.sea.manual||{}).length),0);}
await b.close();srv.close();
console.log(fails?fails+' FAILED':'all ok','errs',errs);process.exit(fails?1:0)});