/* Reagendar y cancelar citas, estadísticas y aviso de misma zona (02/11/2026). */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = process.argv[2] || path.join(__dirname, 'capturas-estadisticas');
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
const ir = async (pag, r, ms = 1500) => { await pag.evaluate(x => { location.hash = '#' + x; }, r); await pag.waitForTimeout(ms); };
const foto = (pag, n) => pag.screenshot({path: path.join(SALIDA, n + '.png'), fullPage: true});

(async () => {
  const nav = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const errores = [];
  const ok = (cond, t) => { if (!cond) errores.push('FALLA · ' + t); else console.log('ok · ' + t); };

  // Sandra (móvil): reagenda y cancela desde Mis captaciones; luego estadísticas
  let p = await entrar(nav, 'sandra', true);
  await ir(p, 'captaciones', 2000);
  await foto(p, '01_sandra_captaciones');
  const nRe = await p.locator('button:has-text("Reagendar")').count();
  ok(nRe > 0, 'la captadora ve el botón Reagendar (' + nRe + ')');
  await p.locator('button:has-text("Reagendar")').first().click();
  await p.waitForTimeout(600); await foto(p, '02_sandra_reagendar');
  await p.locator('.ventana input[type=date]').first().fill(await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toLocaleDateString('sv-SE'); }));
  await p.locator('.ventana input[type=time]').first().fill('18:30');
  await p.locator('.ventana input').last().fill('Le surgió un viaje');
  await p.click('.ventana button:has-text("Reagendar")');
  await p.waitForTimeout(2500);
  ok(!(await p.locator('.ventana').count()), 'reagendar cierra la ventana');
  await p.locator('button:has-text("✕ Cancelar")').first().click();
  await p.waitForTimeout(600); await foto(p, '03_sandra_cancelar');
  await p.click('.ventana button:has-text("Sí, cancelar la cita")');
  await p.waitForTimeout(2500);
  await foto(p, '04_sandra_tras_cancelar');
  await ir(p, 'estadisticas', 2500);
  await foto(p, '05_sandra_estadisticas_movil');
  const texto = await p.evaluate(() => document.querySelector('#vista').innerText);
  ok(/Captadores · Esta semana/i.test(texto) && /Abraham/.test(texto), 'la captadora ve a su compañero en las estadísticas');
  ok(!/€/.test(texto), 'sin euros en las estadísticas de la captadora');
  ok(!/Comerciales ·/.test(texto), 'la captadora no ve la tabla de comerciales');
  await ir(p, 'captaciones', 1800);
  const t2 = await p.evaluate(() => document.body.innerText);
  ok(!/Vendido/.test(t2), 'la captadora no ve la columna Vendido en su rendimiento');
  errores.push(...p.errores); await p.context().close();

  // Dirección (escritorio)
  p = await entrar(nav, 'fernando', false);
  await ir(p, 'estadisticas', 2500);
  await p.selectOption('.filtros select', 'mes'); await p.waitForTimeout(800);
  await foto(p, '06_fernando_estadisticas');
  const t3 = await p.evaluate(() => document.querySelector('#vista').innerText);
  ok(/Comerciales · Este mes/i.test(t3), 'dirección ve los comerciales');
  ok(/Reagendadas/i.test(t3) && /Canceladas/i.test(t3), 'salen reagendadas y canceladas');
  const cid = await p.evaluate(async () => { const A = await import('/assets/js/api.js'); return (A.estado.captaciones.find(c => c.resultado === 'pendiente') || {}).cliente_id; });
  await ir(p, 'cliente/' + cid, 1800);
  await p.click('.pestanas >> text=Citas').catch(async () => { await p.click('text=Citas'); });
  await p.waitForTimeout(800); await foto(p, '07_fernando_ficha_citas');
  ok(await p.locator('button:has-text("Reagendar")').count() > 0, 'en la ficha del cliente, pestaña Citas, está Reagendar');
  // Histórico del lead que ha tocado Sandra
  const cidS = await p.evaluate(async () => { const A = await import('/assets/js/api.js');
    const r = await A.pedir('registro', {}).catch(() => ({}));
    return (A.estado.captaciones.filter(c => /Reagendada/.test(c.notas || ''))[0] || {}).cliente_id; });
  await ir(p, 'cliente/' + cidS, 1800);
  await p.click('text=/^Historial/').catch(() => errores.push('sin pestaña Historial'));
  await p.waitForTimeout(1800); await foto(p, '08_fernando_historico');
  const t4 = await p.evaluate(() => document.querySelector('#vista').innerText);
  ok(/Histórico de cambios/i.test(t4) && /Sandra/.test(t4) && /Día de la cita/.test(t4) && /Le surgió un viaje/.test(t4), 'el lead enseña el histórico de cambios con quién y el motivo');
  errores.push(...p.errores); await p.context().close();
  await nav.close();
  console.log(errores.length ? errores.join('\n') : 'Todo correcto');
})();
