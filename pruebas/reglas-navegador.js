/* Reglas de la agenda de Nando para los captadores (02/11/2026). */
const {chromium} = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = process.argv[2] || path.join(__dirname, 'capturas-reglas');
fs.mkdirSync(SALIDA, {recursive: true});
(async () => {
  const nav = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const ctx = await nav.newContext({viewport: {width: 390, height: 844}, isMobile: true});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  const p = await ctx.newPage(); const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.fill('#usuario', 'sandra'); await p.fill('#clave', CLAVES.sandra); await p.click('#btn-entrar');
  await Promise.race([p.waitForSelector('.app.visible', {timeout: 15000}), p.waitForSelector('#paso-codigo:visible', {timeout: 15000})]).catch(() => {});
  if (await p.locator('#paso-codigo').isVisible()) {
    const correo = await (await fetch(BASE + '/ultimo-correo')).json();
    await p.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || ''); await p.click('#btn-entrar');
  }
  await p.waitForSelector('.app.visible');
  await p.evaluate(() => { location.hash = '#captaciones'; }); await p.waitForTimeout(1500);
  await p.click('text=+ Nueva ficha'); await p.waitForTimeout(800);
  const v = p.locator('.ventana');
  await p.fill('#c_fecha', '2031-01-10');
  await p.fill('#c_hora_cita', '11:00');
  await p.selectOption('#c_comercial_id', {label: 'Nando'});
  await p.dispatchEvent('#c_comercial_id', 'change');
  await p.fill('#c_nombre', 'Prueba Reglas Viernes');
  await p.fill('#c_telefono', '611223344');
  await p.fill('#c_direccion', 'Calle Viernes 5');
  await p.dispatchEvent('#c_fecha', 'change');
  await p.waitForTimeout(1500);
  await p.screenshot({path: path.join(SALIDA, '01_ficha_viernes.png'), fullPage: false});
  const aviso = await v.innerText();
  console.log(/Sin su autorización/.test(aviso) ? 'ok · aviso en vivo' : 'FALLA · sin aviso en vivo');
  await p.click('.ventana button:has-text("Guardar")');
  await p.waitForTimeout(1500);
  await p.screenshot({path: path.join(SALIDA, '02_pide_autorizacion.png')});
  const dlg = await p.locator('text=Hace falta la autorización').count();
  console.log(dlg ? 'ok · pregunta si pedir autorización' : 'FALLA · no pregunta');
  await p.click('button:has-text("Pedir autorización")').catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({path: path.join(SALIDA, '03_guardada.png')});
  const correo = await (await fetch(BASE + '/ultimo-correo')).json().catch(() => ({}));
  console.log(/Autoriza una visita/.test(correo.subject || '') ? 'ok · correo a Nando: ' + correo.subject : 'FALLA · correo: ' + correo.subject);
  console.log(errores.length ? 'ERRORES ' + errores.join(' | ') : 'sin errores de página');
  await nav.close();
})();
