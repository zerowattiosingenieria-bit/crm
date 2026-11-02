/* La ficha del cliente de 02/11/2026: un solo «+ Apuntar», historial, citas,
   lo que falta y aviso de repetidos. Saca capturas y falla si hay errores. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas-ficha');
fs.mkdirSync(SALIDA, {recursive: true});

async function entrar(nav, usuario, movil) {
  const ctx = await nav.newContext(movil ? {viewport: {width: 390, height: 844}, isMobile: true} : {viewport: {width: 1400, height: 950}});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  const pag = await ctx.newPage();
  pag.errores = [];
  pag.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) pag.errores.push(usuario + ' · ' + m.text()); });
  pag.on('pageerror', e => pag.errores.push(usuario + ' · página: ' + e.message));
  await pag.goto(BASE, {waitUntil: 'networkidle'});
  await pag.fill('#usuario', usuario); await pag.fill('#clave', CLAVES[usuario]); await pag.click('#btn-entrar');
  await Promise.race([pag.waitForSelector('.app.visible', {timeout: 15000}), pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})]).catch(() => {});
  if (await pag.locator('#paso-codigo').isVisible()) {
    const correo = await (await fetch(BASE + '/ultimo-correo')).json();
    await pag.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || '');
    await pag.click('#btn-entrar');
  }
  await pag.waitForSelector('.app.visible', {timeout: 10000});
  return pag;
}
const ir = async (pag, r, ms = 1200) => { await pag.evaluate(x => { location.hash = '#' + x; }, r); await pag.waitForTimeout(ms); };
const foto = (pag, n) => pag.screenshot({path: path.join(SALIDA, n + '.png'), fullPage: true});

(async () => {
  const nav = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const errores = [];
  const ok = (cond, txt) => { if (!cond) errores.push('FALLA · ' + txt); else console.log('  ok · ' + txt); };

  let p = await entrar(nav, 'nando', false);
  const cid = await p.evaluate(async () => {
    const A = await import('/assets/js/api.js');
    const c = A.estado.clientes.find(x => A.captacionesDe(x.id).length) || A.estado.clientes[0];
    return c.id;
  });
  await ir(p, 'cliente/' + cid, 1500); await foto(p, 'nando_resumen');
  ok(await p.locator('button:has-text("+ Apuntar")').count() === 1, 'hay un único botón «+ Apuntar» arriba');
  ok(await p.locator('.cabecera-ficha button:has-text("+ Cita")').count() === 0, 'ya no hay botones sueltos de cita');
  await p.click('.cabecera-ficha button:has-text("+ Apuntar")'); await p.waitForTimeout(500); await foto(p, 'nando_apuntar');
  ok(await p.locator('.opcion-apuntar').count() >= 4, 'el menú de apuntar tiene las opciones');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.pestanas button:has-text("Historial")'); await p.waitForTimeout(500); await foto(p, 'nando_historial');
  ok(await p.locator('.linea-tiempo li').count() > 0, 'el historial junta lo apuntado');
  await p.click('.pestanas button:has-text("Citas")'); await p.waitForTimeout(500); await foto(p, 'nando_citas');
  ok(await p.locator('button:has-text("Resultado o cambio")').count() > 0, 'se ven todas las citas con su botón');
  await p.click('button:has-text("Resultado o cambio")'); await p.waitForTimeout(500); await foto(p, 'nando_editar_cita');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.pestanas button:has-text("Vivienda")'); await p.waitForTimeout(400);
  await p.click('button:has-text("Editar vivienda y consumo")'); await p.waitForTimeout(500); await foto(p, 'nando_editar_vivienda');
  ok(await p.locator('.ventana label:has-text("Teléfono")').count() === 0, 'editar la vivienda no saca los datos de contacto');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  /* Alta de un cliente con el teléfono de otro: aviso al momento */
  const tel = await p.evaluate(async id => (await import('/assets/js/api.js')).cliente(id).telefono, cid);
  await ir(p, 'clientes', 1200);
  await p.click('text=+ Nuevo cliente'); await p.waitForTimeout(500);
  await p.fill('.ventana input[type=tel]', String(tel || '600000000')); await p.locator('.ventana input[type=tel]').dispatchEvent('input');
  await p.waitForTimeout(300); await foto(p, 'nando_alta_repetida');
  ok(!tel || await p.locator('.aviso-duplicado').count() === 1, 'al escribir un teléfono que ya está, avisa');
  await p.keyboard.press('Escape');
  errores.push(...p.errores); await p.context().close();

  p = await entrar(nav, 'nando', true);
  await ir(p, 'cliente/' + cid, 1500); await foto(p, 'nando_movil_ficha');
  errores.push(...p.errores); await p.context().close();

  p = await entrar(nav, 'fernando', false);
  await ir(p, 'clientes', 1500);
  await p.click('text=⧉ Fichas repetidas'); await p.waitForTimeout(1500); await foto(p, 'fernando_repetidos');
  ok(await p.locator('.ventana').count() === 1, 'dirección abre las fichas repetidas');
  errores.push(...p.errores); await p.context().close();

  await nav.close();
  if (errores.length) { console.log(errores.join('\n')); process.exit(1); }
  console.log('Sin errores de consola.');
})();
