/* Captación pendiente de reagendar (04/11/2026): la captadora guarda sin fecha y le sale en Hoy. */
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
  const s = await entra('sandra', 420);
  await s.pag.evaluate(() => { location.hash = '#captaciones'; }); await s.pag.waitForTimeout(1500);
  await s.pag.locator('button', {hasText: '+ Nueva ficha'}).first().click(); await s.pag.waitForTimeout(800);
  const ventana = s.pag.locator('.ventana, dialog, [role=dialog]').last();
  const sel = ventana.locator('label.campo', {hasText: 'Estado'}).locator('select');
  const fechaCampo = ventana.locator('label.campo', {hasText: 'Fecha de la visita'});
  const volver = ventana.locator('label.campo', {hasText: 'Volver a llamar'});
  comprobar('al abrir: hay fecha y no se ve «Volver a llamar»', (await fechaCampo.locator('input').inputValue()) !== '' && !(await volver.isVisible()));
  await sel.selectOption('recontactar'); await s.pag.waitForTimeout(300);
  comprobar('con «Pendiente de reagendar» la fecha se vacía y sale «Volver a llamar»',
    (await fechaCampo.locator('input').inputValue()) === '' && await volver.isVisible());
  await volver.locator('input').fill('2026-11-20');
  await ventana.locator('label.campo', {hasText: 'Propietarios'}).locator('input').fill('Prueba Sin Fecha');
  await ventana.locator('label.campo', {hasText: 'Teléfono'}).locator('input').fill('699111222');
  await ventana.locator('label.campo', {hasText: 'Dirección'}).first().locator('input').fill('Calle Pendiente 4');
  await s.pag.screenshot({path: path.join(SALIDA, 'reagendar-ficha-movil.png'), fullPage: true});
  await ventana.locator('button', {hasText: 'Guardar'}).click(); await s.pag.waitForTimeout(2000);
  const caps = await s.pag.evaluate(async () => { const api = await import('/assets/js/api.js'); await api.cargarDatos(); return api.estado.captaciones; });
  const cap = caps.find(c => (c.notas || '').length >= 0 && c.estado_cita === 'recontactar' && !c.fecha);
  comprobar('se guarda sin fecha y con el día de volver a llamar', !!cap && String(cap.volver_llamar).slice(0, 10) === '2026-11-20', cap);
  await s.pag.evaluate(() => { location.hash = '#hoy'; }); await s.pag.waitForTimeout(1800);
  const hoy = await s.pag.textContent('body');
  comprobar('en Hoy sale «Pendientes de reagendar» con el día de llamar', /Pendientes de reagendar/.test(hoy) && /llamar el 20\/11\/26/.test(hoy));
  const sw = await s.pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar('móvil sin scroll lateral', sw <= 430, sw);
  await s.pag.screenshot({path: path.join(SALIDA, 'reagendar-hoy-movil.png'), fullPage: true});
  await s.pag.locator('button', {hasText: 'Dar fecha'}).first().click(); await s.pag.waitForTimeout(600);
  const v2 = s.pag.locator('.ventana, dialog, [role=dialog]').last();
  comprobar('«Dar fecha» abre la ventana para ponerle día', /Dar fecha a la cita/.test(await v2.textContent()));
  await v2.locator('label.campo', {hasText: '¿Ya tiene nuevo día?'}).locator('select').selectOption('no'); await s.pag.waitForTimeout(200);
  comprobar('con «Aún no puede» se esconden día y hora', !(await v2.locator('label.campo', {hasText: /^Nuevo día$/}).isVisible()));
  await s.pag.screenshot({path: path.join(SALIDA, 'reagendar-ventana.png')});
  comprobar('sin errores de JavaScript', !errores.length, errores);
  await nav.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas));
  process.exit(fallos ? 1 : 0);
})();
