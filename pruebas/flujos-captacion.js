const {chromium}=require('playwright');const fs=require('fs');
const C=JSON.parse(fs.readFileSync(__dirname+'/claves.json','utf8'));
let fallos=0;const ok=(n,c,x)=>{console.log((c?'  ok · ':'  FALLA · ')+n+(c?'':' -> '+(x||'')));if(!c)fallos++;};
async function entrar(b,u){const ctx=await b.newContext({viewport:{width:1440,height:1000}});
 await ctx.addInitScript(x=>localStorage.setItem('zw.crm.endpoint',x),'http://localhost:8765/exec');
 const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('http://localhost:8765',{waitUntil:'networkidle'});
 await p.fill('#usuario',u); await p.fill('#clave',C[u]); await p.click('#btn-entrar');
 await p.waitForSelector('.app.visible'); return {ctx,p};}
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});

console.log('\n== Captadora: adjudicar a un comercial ==');
const s=await entrar(b,'sandra');
await s.p.evaluate(()=>location.hash='#captaciones'); await s.p.waitForTimeout(1500);
const tablaS=await s.p.textContent('#vista');
ok('la captadora ve la columna de comercial', /Comercial|sin adjudicar/.test(tablaS));
const btn=await s.p.$('table.datos tbody button');
ok('tiene botón para adjudicar o cambiar el comercial', !!btn,
   btn ? await btn.textContent() : '');
if(btn){ await btn.click(); await s.p.waitForSelector('.ventana');
  const opciones=await s.p.$$eval('.ventana select#c_comercial_id option',o=>o.map(x=>x.textContent));
  ok('puede elegir entre los comerciales', opciones.length>=3, JSON.stringify(opciones));
  const valor=await s.p.$eval('.ventana select#c_comercial_id',el=>Array.from(el.options).find(o=>/Nando/.test(o.textContent)).value);
  await s.p.selectOption('.ventana select#c_comercial_id', valor);
  await s.p.click('.ventana footer button.primario');
  await s.p.waitForSelector('.ventana',{state:'detached',timeout:15000});
  await s.p.waitForTimeout(2500);
  ok('queda adjudicada', /Nando/.test(await s.p.textContent('#vista')));
}
await s.p.screenshot({path:__dirname+'/capturas/captaciones-adjudicar.png',fullPage:false});
await s.ctx.close();

console.log('\n== Comercial: calendario de visitas e ir en coche ==');
const n=await entrar(b,'nando');
await n.p.evaluate(()=>location.hash='#agenda'); await n.p.waitForTimeout(2000);
const ag=await n.p.textContent('#vista');
ok('la agenda trae el calendario', /Calendario de visitas/.test(ag));
const dias=await n.p.$$('.calendario .dia');
ok('el calendario pinta el mes', dias.length>=28, String(dias.length));
const conEventos=await n.p.$$('.calendario .dia.conEventos');
ok('marca los días con visitas', conEventos.length>0, String(conEventos.length));
if(conEventos.length){ await conEventos[0].click(); await n.p.waitForTimeout(800);
  ok('al pulsar un día enseña lo que hay', /de \d{4}/.test(await n.p.textContent('#vista')));}
await n.p.screenshot({path:__dirname+'/capturas/agenda-calendario.png',fullPage:false});

await n.p.evaluate(()=>location.hash='#clientes'); await n.p.waitForTimeout(1200);
const fila=await n.p.$('table.datos tbody tr.pulsable');
if(fila){ await fila.click(); await n.p.waitForTimeout(1500);
  const ficha=await n.p.textContent('#vista');
  ok('la ficha ofrece ir en coche', /Ir en coche/.test(ficha));
  const href=await n.p.$eval('a.btn.lima[href*="maps"]',a=>a.href).catch(()=>'');
  ok('el enlace abre la navegación de Google Maps',
    /maps\/dir\/\?api=1.*travelmode=driving/.test(href), href.slice(0,120));
  await n.p.screenshot({path:__dirname+'/capturas/ficha-ir-en-coche.png',fullPage:false});
}
await n.ctx.close();
await b.close();
console.log(fallos?('FALLAN '+fallos):'Todo correcto');
process.exit(fallos?1:0);
})();
