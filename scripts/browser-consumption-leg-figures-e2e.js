// Consumption plan features: results table + status + last safe port, undo/redo, up/down buttons, CSV / text / summary.
const http=require('http'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const root=process.env.ROOT||path.join(__dirname,'..','modules','voyage','www');
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);if(u==='/host.html'){r.writeHead(200,{'content-type':'text/html'});r.end('<!doctype html><meta charset=utf-8><body><div id=m></div><script src="/consumption-plan.js"></script>');return}let f=path.join(root,u);fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return}const t={'.html':'text/html','.js':'text/javascript','.json':'application/json'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'content-type':t});r.end(b)})});
let fails=0;const ck=(l,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e);console.log((ok?'  ok   ':'  FAIL ')+l+(ok?'':': expected '+JSON.stringify(e)+' got '+JSON.stringify(a)));if(!ok)fails++;};
srv.listen(0,async()=>{const port=srv.address().port;const b=await chromium.launch();const errs=[];
const p=await b.newPage({viewport:{width:1500,height:1700}});p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>{errs.push('NATIVE DIALOG '+d.message().slice(0,40));d.dismiss()});
await p.goto(`http://localhost:${port}/host.html`);
await p.evaluate(()=>{window.__saved={plan:null,history:[]};window.__toasts=[];window.__files=[];window.__printed=[];
 const inner=document.createElement('div');document.getElementById('m').appendChild(inner);
 window.__ctl=ConsumptionPlan.mount(inner,{fuels:()=>[{id:'HFO'},{id:'LSMGO'}],load:()=>window.__saved,persist:(d)=>{window.__saved=JSON.parse(JSON.stringify(d));return Promise.resolve()},vesselName:()=>'MV TEST',voyageNo:()=>'V9',toast:m=>window.__toasts.push(m),
  saveFile:async(n,t,m)=>{window.__files.push({n,t,m})},capacity:(g)=>g==='LSMGO'?60:0,
  askName:async()=>'x',printSheet:(h)=>{window.__printed.push(h)},printHeader:()=>'',printSignature:()=>'',printMetaGrid:(i)=>i.map(x=>x.label+': '+x.value).join(' | ')});});
await p.waitForTimeout(400);
const setLeg=async(sp,h,l)=>{await p.fill('[data-ov="speed"]',String(sp));await p.fill('[data-ov="sea"][data-s="0"]',String(h));await p.fill('[data-ov="sea"][data-s="1"]',String(l));};

console.log('== leg figures and miscellaneous consumption');
ck('no speed or MT/day boxes on the lines',await p.$$eval('tr[data-row] [data-f="speed"], tr[data-row] [data-f="daily"]',a=>a.length),0);
ck('the voyage description box is there, with the leg figures just below it',await p.evaluate(()=>{const d=document.querySelector('[data-cp="legTitle"]');const l=document.querySelector('[data-legfig]');return !!d&&!!l&&d.compareDocumentPosition(l)&Node.DOCUMENT_POSITION_FOLLOWING?1:0}),1);
await p.fill('tr[data-row="0"] [data-f="from"]','A');await p.fill('tr[data-row="0"] [data-f="to"]','B');await p.fill('tr[data-row="0"] [data-f="distance"]','480');
await p.waitForTimeout(300);
const warn=await p.$eval('[data-missing]',e=>e.textContent);console.log('   ',warn);
ck('a line without speed or consumption is reported',/no speed or no consumption/.test(warn),true);
await p.fill('[data-cp="legTitle"]','Test voyage');
await p.fill('[data-ov="speed"]','10');await p.fill('[data-ov="sea"][data-s="0"]','28');await p.fill('[data-ov="sea"][data-s="1"]','2');await p.fill('[data-ov="port"][data-s="0"]','3');await p.fill('[data-ov="port"][data-s="1"]','1');
await p.waitForTimeout(300);
ck('the line takes the leg figures',await p.evaluate(()=>[document.querySelector('[data-speedtxt]').textContent,document.querySelector('[data-dailytxt="0"]').textContent]),['10.0','28.00 MT/day']);
ck('and the warning is gone',await p.$eval('[data-missing]',e=>e.textContent),'');
await p.click('[data-act="add-leg"]');await p.check('tr[data-row="1"] [data-f="port"]');await p.fill('tr[data-row="1"] [data-f="days"]','1');await p.waitForTimeout(300);
ck('a port stay takes the port figures',await p.evaluate(()=>[document.querySelector('tr[data-row="1"] [data-speedtxt]').textContent,document.querySelector('tr[data-row="1"] [data-dailytxt="0"]').textContent]),['—','3.00 MT/day']);
await p.fill('[data-sf="currentRob"][data-grade="HFO"]','300');await p.fill('[data-sf="currentRob"][data-grade="LSMGO"]','50');
const cons=async(g)=>p.$$eval('.cp-restable tbody tr',(a,g)=>{const r=a.find(x=>x.querySelector('th').textContent===g);return r?Number(r.children[4].textContent):null},g);
const before=await cons('LSMGO');
await p.fill('[data-ov="misc"]','0.05');await p.waitForTimeout(400);
const after=await cons('LSMGO');
const days=480/(10*24)+1;
ck('miscellaneous consumption is added to the distillate by the whole voyage leg days',[Math.round((after-before)*1000)/1000,await p.$eval('[data-ov="miscGrade"]',e=>e.value)],[Math.round(0.05*days*1000)/1000,'LSMGO']);
const info=await p.$eval('[data-misc-info]',e=>e.textContent);console.log('   ',info);
ck('the note shows the sum',/0\.050 MT\/day × 3\.00 days.*0\.150 MT of LSMGO/.test(info),true);
await p.selectOption('[data-ov="miscGrade"]','HFO');await p.waitForTimeout(400);
ck('the fuel of the miscellaneous consumption can be changed',[Math.round(((await cons('LSMGO'))-before)*1000)/1000,(await cons('HFO'))>0],[0,true]);
const txt=await p.evaluate(()=>ConsumptionPlan.planText(window.__ctl.plan(),{vessel:'X'}));
ck('report text and CSV carry it',/Miscellaneous: 0\.050 MT\/day/.test(txt),true);
await p.reload;
ck('no page errors and no native dialogs',errs,[]);
await b.close();srv.close();console.log(fails?fails+' FAILED':'all ok');process.exit(fails?1:0)});
