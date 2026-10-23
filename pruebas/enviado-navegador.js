/* «✓ Enviado al cliente» con un navegador de verdad: el comercial lo marca
   en su panel, el proyecto sale de «listos para enviar», la ficha dice
   «Enviado al cliente» y la dirección lo ve en los enviados de las dos
   últimas semanas y lo puede deshacer. Se lanza con el servidor de pruebas
   recién arrancado; capturas en pruebas/capturas (o en CAPTURAS=...). */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = process.env.CAPTURAS || path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, {recursive: true});

let fallos = 0, hechas = 0;
function comprobar(nombre, condicion, extra) {
  hechas++;
  if (condicion) console.log('  ok · ' + nombre);
  else { fallos++; console.log('  FALLA · ' + nombre + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 400) : '')); }
}

async function entrar(navegador, usuario, {ancho = 1280, alto = 900} = {}) {
  const ctx = await navegador.newContext({viewport: {width: ancho, height: alto}});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  await ctx.route(/geojs\.io|ipapi\.co/, r => r.abort());
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', e => errores.push(e.message));
  await pag.goto(BASE, {waitUntil: 'networkidle'});
  await pag.fill('#usuario', usuario);
  await pag.fill('#clave', CLAVES[usuario]);
  await pag.click('#btn-entrar');
  await Promise.race([
    pag.waitForSelector('.app.visible', {timeout: 15000}),
    pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})
  ]);
  if (await pag.locator('#paso-codigo').isVisible()) {
    const correo = await (await fetch(BASE + '/ultimo-correo')).json();
    await pag.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || '');
    await pag.click('#btn-entrar');
    await pag.waitForSelector('.app.visible', {timeout: 15000});
  }
  await pag.waitForFunction(() => !document.querySelector('#vista .cargando'), null, {timeout: 15000});
  await pag.waitForTimeout(3300);              // que se vaya el aviso de la clave inicial
  return {ctx, pag, errores};
}

const tarjetaDe = (pag, titulo) => pag.locator('.tarjeta', {has: pag.locator('header h2', {hasText: titulo})});

(async () => {
  const navegador = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']});

  console.log('\n== El comercial lo marca ==');
  const com = await entrar(navegador, 'nando');
  let pag = com.pag;
  const listos = tarjetaDe(pag, 'Proyectos listos para enviar');
  comprobar('el comercial tiene un proyecto listo para enviar', await listos.count() === 1);
  const linea = listos.locator('li').first();
  const nombre = (await linea.locator('b').innerText()).trim();
  comprobar('nombrado «dirección · nombre»', / · /.test(nombre), nombre);
  comprobar('con su botón «✓ Enviado al cliente»',
    await linea.locator('button', {hasText: '✓ Enviado al cliente'}).count() === 1);
  await listos.scrollIntoViewIfNeeded();
  await pag.screenshot({path: path.join(SALIDA, '61_panel_comercial_antes.png')});

  await linea.locator('button', {hasText: '✓ Enviado al cliente'}).click();
  comprobar('pide confirmación ahí mismo', await linea.innerText().then(t => /¿Ya se lo has mandado\?/.test(t)));
  await pag.screenshot({path: path.join(SALIDA, '61_panel_comercial_confirmar.png')});
  await linea.locator('button', {hasText: 'No'}).click();
  comprobar('«No» lo deja como estaba',
    await linea.locator('button', {hasText: '✓ Enviado al cliente'}).count() === 1);
  await linea.locator('button', {hasText: '✓ Enviado al cliente'}).click();
  await linea.locator('button', {hasText: 'Sí, enviado'}).click();
  await pag.waitForTimeout(700);
  const avisoTxt = await pag.textContent('#aviso');
  comprobar('avisa y le apunta llamar a la semana', /Apuntado como enviado/.test(avisoTxt) &&
    /(llamarle|próximo paso) el \d\d\/\d\d\/\d\d/.test(avisoTxt), avisoTxt);
  comprobar('el proyecto sale de «listos para enviar»', await tarjetaDe(pag, 'Proyectos listos para enviar').count() === 0);
  await pag.screenshot({path: path.join(SALIDA, '61_panel_comercial_despues.png')});

  /* Recargando, sigue fuera. */
  await pag.reload({waitUntil: 'networkidle'});
  await pag.waitForSelector('.app.visible');
  await pag.waitForFunction(() => !document.querySelector('#vista .cargando'), null, {timeout: 15000});
  comprobar('y al recargar sigue fuera', await tarjetaDe(pag, 'Proyectos listos para enviar').count() === 0);

  /* La ficha del cliente lo dice. */
  const idCliente = await pag.evaluate(async n => {
    const api = await import('/assets/js/api.js');
    const c = api.estado.clientes.find(x => [x.direccion, x.nombre].filter(Boolean).join(' · ') === n);
    return c && c.id;
  }, nombre);
  await pag.evaluate(id => { location.hash = '#cliente/' + id; }, idCliente);
  await pag.waitForSelector('.pestanas');
  await pag.click('.pestanas button:has-text("Proyecto")');
  await pag.waitForTimeout(900);
  const ficha = await pag.textContent('#vista');
  comprobar('en la pestaña Proyecto sale «Enviado al cliente» con la fecha',
    /Enviado al cliente/.test(ficha) && /Enviado al cliente el \d\d\/\d\d\/\d\d/.test(ficha), ficha.slice(0, 200));
  await pag.screenshot({path: path.join(SALIDA, '61_ficha_proyecto_enviado.png')});
  comprobar('sin errores de página en el comercial', com.errores.length === 0, com.errores);
  await com.ctx.close();

  console.log('\n== La dirección lo ve ==');
  const dir = await entrar(navegador, 'superadmin');
  pag = dir.pag;
  const enviados = tarjetaDe(pag, 'Enviados al cliente, últimos 14 días');
  comprobar('la dirección tiene la tarjeta de enviados', await enviados.count() === 1);
  const suya = enviados.locator('li', {hasText: nombre});
  const texto = await suya.innerText().catch(() => '');
  comprobar('con «dirección · nombre», comercial y fecha', /comercial: Nando/.test(texto) &&
    /enviado el \d\d\/\d\d\/\d\d a las \d\d:\d\d/.test(texto), texto);
  await enviados.scrollIntoViewIfNeeded();
  await pag.screenshot({path: path.join(SALIDA, '61_panel_direccion.png')});
  await suya.locator('button', {hasText: 'deshacer'}).click();
  await pag.waitForTimeout(700);
  comprobar('«deshacer» lo quita de enviados', await enviados.locator('li', {hasText: nombre}).count() === 0);
  await pag.reload({waitUntil: 'networkidle'});
  await pag.waitForSelector('.app.visible');
  await pag.waitForFunction(() => !document.querySelector('#vista .cargando'), null, {timeout: 15000});
  comprobar('y vuelve a «listos para enviar»', await tarjetaDe(pag, 'Proyectos listos para enviar')
    .locator('li', {hasText: nombre}).count() === 1);
  comprobar('sin errores de página en la dirección', dir.errores.length === 0, dir.errores);
  await dir.ctx.close();

  console.log('\n== En el móvil ==');
  const movil = await entrar(navegador, 'nando', {ancho: 400, alto: 860});
  const t = tarjetaDe(movil.pag, 'Proyectos listos para enviar');
  await t.scrollIntoViewIfNeeded();
  const boton = t.locator('button', {hasText: '✓ Enviado al cliente'}).first();
  const caja = await boton.boundingBox();
  comprobar('en el móvil el botón se ve entero', caja && caja.x >= 0 && caja.x + caja.width <= 400, caja);
  await movil.pag.screenshot({path: path.join(SALIDA, '61_panel_comercial_movil.png')});
  await movil.ctx.close();

  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas + ' comprobaciones'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
