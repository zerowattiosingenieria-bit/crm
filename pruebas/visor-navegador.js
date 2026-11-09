/* Visor 3D (09/11/2026): con el Catastro, CartoCiudad y el IGN simulados,
   comprueba que busca la casa, dibuja tejado y paneles y saca la lista de material. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas-visor');
fs.mkdirSync(SALIDA, {recursive: true});

// GML de prueba: casa 14×9 m girada 20° (2 plantas) + porche + vecino
function gml(x0, y0) {
  const rot = (pts, a, dx, dy) => pts.map(([x, y]) => [x0 + dx + x * Math.cos(a) - y * Math.sin(a), y0 + dy + x * Math.sin(a) + y * Math.cos(a)]);
  const poly = p => p.concat([p[0]]).map(q => q.join(' ')).join(' ');
  const part = (id, pl, pts) => `<gml:featureMember><bu-ext2d:BuildingPart gml:id="ES.SDGC.BU.${id}"><bu-ext2d:numberOfFloorsAboveGround>${pl}</bu-ext2d:numberOfFloorsAboveGround><gml:posList srsDimension="2">${poly(pts)}</gml:posList></bu-ext2d:BuildingPart></gml:featureMember>`;
  const a = 20 * Math.PI / 180;
  return `<?xml version="1.0"?><gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:bu-ext2d="urn:x">` +
    part('1234567VK1234N_part1', 2, rot([[-7, -4.5], [7, -4.5], [7, 4.5], [-7, 4.5]], a, 0, 0)) +
    part('1234567VK1234N_part2', 1, rot([[7, -2], [10, -2], [10, 2], [7, 2]], a, 0, 0)) +
    part('7654321VK1234N_part1', 2, rot([[-6, -4], [6, -4], [6, 4], [-6, 4]], a, -2, 22)) + '</gml:FeatureCollection>';
}

(async () => {
  const nav = await chromium.launch({args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']});
  const ctx = await nav.newContext({viewport: {width: 1400, height: 950}});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  let centro = null;
  await ctx.route(/cartociudad\.es/, r => r.fulfill({contentType: 'application/x-javascript',
    body: 'callback([{"address":"CALLE TUPOLEV 25","muni":"Brunete","poblacion":"Brunete","lat":40.401771,"lng":-3.992926}])'}));
  await ctx.route(/catastro\.meh\.es/, r => { const u = new URL(r.request().url()); const b = u.searchParams.get('bbox').split(',').map(Number);
    centro = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; r.fulfill({contentType: 'text/xml', body: gml(...centro)}); });
  const jpg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'img', 'logo.png'));
  await ctx.route(/ign\.es/, r => r.fulfill({contentType: 'image/png', body: jpg, headers: {'Access-Control-Allow-Origin': '*'}}));
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  pag.on('pageerror', e => errores.push('página: ' + e.message));
  await pag.goto(BASE, {waitUntil: 'networkidle'});
  await pag.fill('#usuario', 'nando'); await pag.fill('#clave', CLAVES.nando); await pag.click('#btn-entrar');
  await Promise.race([pag.waitForSelector('.app.visible', {timeout: 15000}), pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})]).catch(() => {});
  if (await pag.locator('#paso-codigo').isVisible()) {
    const correo = await (await fetch(BASE + '/ultimo-correo')).json();
    await pag.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || ''); await pag.click('#btn-entrar');
  }
  await pag.waitForSelector('.app.visible', {timeout: 10000});
  await pag.evaluate(() => { location.hash = '#visor'; }); await pag.waitForTimeout(1500);
  await pag.fill('#v3dir', 'Calle Tupolev 25, Brunete'); await pag.click('.v3-buscar button'); await pag.waitForTimeout(2500);
  const n = await pag.textContent('.v3-kpi.dest b');
  const estado = await pag.textContent('.v3-estado');
  console.log('estado:', estado, '| paneles:', n);
  await pag.screenshot({path: path.join(SALIDA, 'visor-3d.png')});
  await pag.selectOption('#v3aero', 'htt16'); await pag.fill('#v3n', '0'); await pag.waitForTimeout(800);
  await pag.click('.v3-seg button[data-v=cuatro]'); await pag.waitForTimeout(800);
  await pag.screenshot({path: path.join(SALIDA, 'visor-4aguas.png')});
  const mat = await pag.textContent('.v3-mat'); console.log('material:', mat.slice(0, 300));
  await pag.setViewportSize({width: 400, height: 860}); await pag.waitForTimeout(800);
  await pag.screenshot({path: path.join(SALIDA, 'visor-movil.png')});
  const fallos = [];
  if (!/1234567VK1234N/.test(estado)) fallos.push('no encuentra la casa');
  if (!(+n > 0)) fallos.push('no coloca paneles');
  if (!/Domusa/.test(mat)) fallos.push('falta la aerotermia en el material');
  fallos.push(...errores);
  await nav.close();
  if (fallos.length) { console.log('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
  console.log('Todo bien.');
})();
