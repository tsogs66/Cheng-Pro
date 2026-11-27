const http=require('http'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const root=process.env.ROOT||'/home/user/Cheng-Pro/modules/voyage/www';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);if(u==='/host.html'){r.writeHead(200,{'content-type':'text/html'});r.end('<!doctype html><meta charset=utf-8><body><div id=m style="width:1100px;height:640px"></div><script src="/sea-distance/sea-route.js"></script><script src="/sea-distance/sea-map.js"></script>');return}let f=path.join(root,u);fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return}const t={'.html':'text/html','.js':'text/javascript','.json':'application/json'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'content-type':t});r.end(b)})});
let fails=0;const ck=(l,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e);console.log((ok?'  ok   ':'  FAIL ')+l+(ok?'':': expected '+JSON.stringify(e)+' got '+JSON.stringify(a)));if(!ok)fails++;};
srv.listen(0,async()=>{const port=srv.address().port;const b=await chromium.launch();const errs=[];
const p=await b.newPage({viewport:{width:1150,height:700}});p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://localhost:${port}/host.html`);
await p.evaluate(async()=>{const j=u=>fetch(u).then(r=>r.json());const [land,mar]=await Promise.all([j('/sea-distance/land.json'),j('/sea-distance/marnet.json')]);
 window.__ctl=SeaMap.create(document.getElementById('m'),{land:SeaMap.decodeLand(land),lanes:mar,detail:{land:()=>j('/sea-distance/detail-land.json'),water:()=>j('/sea-distance/detail-water.json')}});window.__ctl.set({showLanes:true});});
const go=async(lon,lat,k)=>{await p.evaluate(([lon,lat,k])=>{window.__ctl.set({lon,y:SeaMap.my(lat),k})},[lon,lat,k]);await p.waitForTimeout(1200);};
// Singapore strait
await go(103.8,1.2,150);
ck('detail layers loaded',await p.evaluate(()=>window.__ctl.detailLoaded()),{land:true,water:true});
ck('where() works',await p.evaluate(()=>typeof window.__ctl.where().zoom),'number');
ck('no page errors',errs,[]);
await b.close();srv.close();console.log(fails?fails+' FAILED':'all ok');process.exit(fails?1:0)});
