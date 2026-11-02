/* Recorre las pantallas nuevas del 02/11/2026 con cada perfil y saca capturas. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas-mejoras');
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
  // Comercial (móvil)
  let p = await entrar(nav, 'nando', true);
  await ir(p, 'hoy'); await foto(p, 'nando_hoy_movil');
  const cid = await p.evaluate(async () => { const A = await import('/assets/js/api.js'); return A.estado.clientes[0].id; });
  await ir(p, 'visita/' + cid); await foto(p, 'nando_visita_movil');
  await ir(p, 'cliente/' + cid, 1500);
  await p.click('button:has-text("+ Apuntar")').catch(e => errores.push('nando · sin botón + Apuntar'));
  await p.waitForTimeout(400);
  await p.click('text=Una cita').catch(e => errores.push('nando · sin la opción Una cita'));
  await p.waitForTimeout(1500); await foto(p, 'nando_nueva_cita');
  await p.keyboard.press('Escape');
  await ir(p, 'agenda', 1800); await foto(p, 'nando_agenda');
  errores.push(...p.errores); await p.context().close();
  // Captadora
  p = await entrar(nav, 'sandra', true);
  await ir(p, 'hoy'); await foto(p, 'sandra_hoy');
  await ir(p, 'captaciones');
  await p.click('text=+ Nueva ficha').catch(() => errores.push('sandra · sin + Nueva ficha'));
  await p.waitForTimeout(800); await foto(p, 'sandra_nueva_ficha');
  errores.push(...p.errores); await p.context().close();
  // Dirección
  p = await entrar(nav, 'fernando', false);
  for (const r of ['hoy', 'banco', 'contabilidad', 'cobros', 'agenda', 'ajustes']) { await ir(p, r, 1800); await foto(p, 'fernando_' + r); }
  await ir(p, 'cliente/' + cid, 1500);
  await p.click('text=Proyecto').catch(() => {}); await p.waitForTimeout(1500); await foto(p, 'fernando_proyecto');
  errores.push(...p.errores); await p.context().close();
  // Superadmin: usuarios con rol agente
  p = await entrar(nav, 'superadmin', false);
  await ir(p, 'usuarios', 1500); await foto(p, 'superadmin_usuarios');
  errores.push(...p.errores); await p.context().close();
  await nav.close();
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : 'Sin errores de consola.');
})();
