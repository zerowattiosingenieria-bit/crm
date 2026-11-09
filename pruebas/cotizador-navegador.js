/* Cotizador (09/11/2026): con Catastro/IGN simulados comprueba que cotiza desde
   una dirección, que dirección ve el margen y que un comercial (Rober) no lo ve
   ni ve el visor 3D. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas-visor');
fs.mkdirSync(SALIDA, {recursive: true});
function gml(x0, y0) {
  const a = 20 * Math.PI / 180, rot = pts => pts.map(([x, y]) => [x0 + x * Math.cos(a) - y * Math.sin(a), y0 + x * Math.sin(a) + y * Math.cos(a)]);
  const poly = p => p.concat([p[0]]).map(q => q.join(' ')).join(' ');
  return `<?xml version="1.0"?><gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:bu-ext2d="urn:x"><gml:featureMember><bu-ext2d:BuildingPart gml:id="ES.SDGC.BU.1234567VK1234N_part1"><bu-ext2d:numberOfFloorsAboveGround>2</bu-ext2d:numberOfFloorsAboveGround><gml:posList>${poly(rot([[-7, -4.5], [7, -4.5], [7, 4.5], [-7, 4.5]]))}</gml:posList></bu-ext2d:BuildingPart></gml:featureMember></gml:FeatureCollection>`;
}
async function entrar(nav, usuario) {
  const ctx = await nav.newContext({viewport: {width: 1400, height: 950}});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  await ctx.route(/cartociudad\.es/, r => r.fulfill({contentType: 'application/x-javascript', body: 'callback([{"address":"CALLE X 1","muni":"Boadilla","poblacion":"Boadilla","lat":40.4,"lng":-3.9}])'}));
  await ctx.route(/catastro\.meh\.es/, r => { const b = new URL(r.request().url()).searchParams.get('bbox').split(',').map(Number); r.fulfill({contentType: 'text/xml', body: gml((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)}); });
  const pag = await ctx.newPage(); pag.errores = [];
  pag.on('pageerror', e => pag.errores.push(usuario + ' página: ' + e.message));
  pag.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) pag.errores.push(usuario + ' ' + m.text()); });
  await pag.goto(BASE, {waitUntil: 'networkidle'});
  await pag.fill('#usuario', usuario); await pag.fill('#clave', CLAVES[usuario]); await pag.click('#btn-entrar');
  await Promise.race([pag.waitForSelector('.app.visible', {timeout: 15000}), pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})]).catch(() => {});
  if (await pag.locator('#paso-codigo').isVisible()) { const c = await (await fetch(BASE + '/ultimo-correo')).json();
    await pag.fill('#codigo', (String(c.subject || '').match(/(\d{6})/) || [])[1] || ''); await pag.click('#btn-entrar'); }
  await pag.waitForSelector('.app.visible', {timeout: 10000});
  return pag;
}
(async () => {
  const nav = await chromium.launch({args: ['--no-sandbox']});
  const fallos = [];
  const usuarios = Object.keys(CLAVES);
  const dir = usuarios.find(u => /fernando|ruben|superadmin/.test(u)) || 'fernando';
  for (const [u, esDir] of [[dir, true], ['rober', false]]) {
    if (!CLAVES[u]) { console.log('sin clave para', u); continue; }
    const p = await entrar(nav, u);
    await p.evaluate(() => { location.hash = '#cotizador'; }); await p.waitForTimeout(1200);
    await p.fill('#cotdir', 'Calle X 1, Boadilla'); await p.click('.cot-buscar button'); await p.waitForTimeout(2500);
    const total = await p.textContent('.cot-tabla tr.total').catch(() => '');
    const verMargen = await p.locator('.cot-dir').count();
    const menu = await p.textContent('#menu');
    console.log(u, '| total:', total.trim(), '| panel margen:', verMargen, '| visor en menú:', /Visor 3D/.test(menu));
    await p.screenshot({path: path.join(SALIDA, 'cotizador-' + u + '.png'), fullPage: true});
    if (!/€/.test(total)) fallos.push(u + ': no sale total');
    if (esDir && !verMargen) fallos.push(u + ': dirección no ve el margen');
    if (!esDir && verMargen) fallos.push(u + ': un comercial ve el margen');
    if (!esDir && /Visor 3D/.test(menu)) fallos.push(u + ': un comercial (no Nando) ve el visor 3D');
    fallos.push(...p.errores);
  }
  { const p = await entrar(nav, 'nando');
    const cid = await p.evaluate(async () => { const A = await import('/assets/js/api.js'); return (A.estado.clientes.find(x => x.direccion) || {}).id; });
    await p.evaluate(x => { location.hash = '#cliente/' + x; }, cid); await p.waitForTimeout(1500);
    await p.click('.pestanas button:has-text("Cotizar")'); await p.waitForTimeout(3500);
    const t1 = await p.textContent('.cot-tabla tr.total');
    await p.selectOption('#cotacs', '300'); await p.waitForTimeout(400);
    const t2 = await p.textContent('.cot-tabla tr.total');
    console.log('nando ficha | total', t1.trim(), '→ con ACS 300 L', t2.trim());
    if (t1 === t2) fallos.push('el depósito no cambia el precio');
    await p.click('button:has-text("Guardar versión")'); await p.waitForTimeout(1500);
    await p.click('button:has-text("Guardar versión")'); await p.waitForTimeout(1500);
    const vers = await p.textContent('.cot-versiones');
    const desc = await p.evaluate(async x => { const A = await import('/assets/js/api.js'); const r = await A.proyectoDe(x); return r.proyecto.descripcion; }, cid);
    console.log('versiones:', vers.slice(0, 160), '| proyecto:', desc.slice(0, 120).replace(/\n/g, ' / '));
    if (!/v2/.test(vers)) fallos.push('no guarda dos versiones');
    if (!/Cotización v2/.test(desc) || /Cotización v1/.test(desc)) fallos.push('el proyecto no lleva la última cotización');
    fallos.push(...p.errores); }
  { const p = await entrar(nav, 'sandra');
    await p.evaluate(() => { location.hash = '#cotizador'; }); await p.waitForTimeout(1200);
    const menu = await p.textContent('#menu'); const hay = await p.locator('.cot-buscar').count();
    console.log('sandra | cotizador en menú:', /Cotizador/.test(menu), '| abre:', hay);
    if (/Cotizador/.test(menu) || hay) fallos.push('una captadora ve el cotizador'); }
  await nav.close();
  if (fallos.length) { console.log('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
  console.log('Todo bien.');
})();
