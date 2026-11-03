/* Incidencias (03/11/2026): dirección las ve, crea, apunta y resuelve; el comercial no tiene el menú. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, {recursive: true});
let fallos = 0, hechas = 0;
function comprobar(n, c, x) { hechas++; if (c) console.log('  ok · ' + n); else { fallos++; console.log('  FALLA · ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 300) : '')); } }
(async () => {
  const nav = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const errores = [];
  async function entra(usuario, ancho) {
    const ctx = await nav.newContext({viewport: {width: ancho || 1440, height: 1000}});
    await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
    const pag = await ctx.newPage();
    pag.on('pageerror', e => errores.push(usuario + ' · ' + e.message));
    await pag.goto(BASE, {waitUntil: 'networkidle'});
    await pag.fill('#usuario', usuario); await pag.fill('#clave', CLAVES[usuario]); await pag.click('#btn-entrar');
    await Promise.race([pag.waitForSelector('.app.visible', {timeout: 15000}), pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})]).catch(() => {});
    if (await pag.locator('#paso-codigo').isVisible()) {
      const correo = await (await fetch(BASE + '/ultimo-correo')).json();
      await pag.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || ''); await pag.click('#btn-entrar');
    }
    await pag.waitForSelector('.app.visible', {timeout: 15000});
    const pedir = (a, p) => pag.evaluate(async ([a, q]) => { const api = await import('/assets/js/api.js'); try { return await api.pedir(a, q || {}); } catch (e) { return {ok: false, error: e.message}; } }, [a, p]);
    return {ctx, pag, pedir};
  }
  const d = await entra('fernando');
  await d.pedir('guardarIncidencia', {incidencia: {titulo: 'Megara 6 · salta el fusible con la aerotermia', urgencia: 'media', fecha: '2026-10-20', detalle: 'Soy Renovable revisa'}});
  await d.pedir('guardarIncidencia', {incidencia: {titulo: 'Climassine · falta el COVE de Norte 29', urgencia: 'alta', fecha: '2026-10-30'}});
  await d.pedir('guardarIncidencia', {incidencia: {titulo: 'Cambiar etiqueta de la furgoneta', urgencia: 'baja'}});
  await d.pag.evaluate(() => { location.hash = '#hoy'; }); await d.pag.waitForTimeout(1500);
  const hoy = await d.pag.textContent('body');
  comprobar('Hoy de dirección enseña la tarjeta', /Incidencias abiertas/.test(hoy));
  await d.pag.evaluate(() => { location.hash = '#incidencias'; }); await d.pag.waitForTimeout(1500);
  const filas = await d.pag.$$eval('.incidencia b', bs => bs.map(b => b.textContent).filter(t => t.length > 10));
  comprobar('orden: alta, media, baja', /COVE/.test(filas[0]) && /Megara/.test(filas[1]) && /furgoneta/.test(filas[2]), filas);
  await d.pag.screenshot({path: path.join(SALIDA, 'incidencias.png'), fullPage: true});
  const primera = d.pag.locator('.incidencia').first();
  await primera.locator('textarea').fill('Climassine lo manda el jueves');
  await primera.locator('button', {hasText: 'Guardar actualización'}).click(); await d.pag.waitForTimeout(1200);
  comprobar('la actualización sale en el historial', /Climassine lo manda el jueves/.test(await d.pag.locator('.incidencia').first().textContent()));
  const p2 = d.pag.locator('.incidencia').first();
  await p2.locator('textarea').fill('COVE recibido y enviado a Diego');
  await p2.locator('button', {hasText: 'Resuelta'}).click(); await d.pag.waitForTimeout(1200);
  const txt = await d.pag.textContent('body');
  comprobar('resuelta desaparece de abiertas', !/falta el COVE de Norte 29/.test(txt));
  await d.pag.selectOption('select >> nth=0', 'resueltas').catch(() => {});
  await d.pag.waitForTimeout(1200);
  comprobar('sale en resueltas con su solución', /COVE recibido y enviado a Diego/.test(await d.pag.textContent('body')));
  await d.pag.screenshot({path: path.join(SALIDA, 'incidencias-resueltas.png'), fullPage: true});
  const m = await entra('fernando', 400);
  await m.pag.evaluate(() => { location.hash = '#incidencias'; }); await m.pag.waitForTimeout(1500);
  const sw = await m.pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar('móvil sin scroll lateral', sw <= 410, sw);
  await m.pag.screenshot({path: path.join(SALIDA, 'incidencias-movil.png'), fullPage: true});
  const c = await entra('nando');
  const menu = await c.pag.textContent('body');
  comprobar('el comercial no ve el menú', !/Incidencias/.test(menu));
  comprobar('sin errores de página', errores.length === 0, errores);
  console.log('\n' + (fallos ? 'FALLAN ' + fallos : 'Todo correcto') + ' de ' + hechas);
  await nav.close(); process.exit(fallos ? 1 : 0);
})();
