/* Prueba de uso real: alta de cliente, instalación, parte del día con
   lectura del resumen, cobro y nómina, moviendo el ratón como una persona. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas');
let fallos = 0;
const comprobar = (n, c, extra) => {
  if (c) console.log('  ok · ' + n);
  else { fallos++; console.log('  FALLA · ' + n + (extra ? ' -> ' + extra : '')); }
};

async function entrar(navegador, usuario) {
  const ctx = await navegador.newContext({viewport: {width: 1440, height: 950}});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', e => errores.push(e.message));
  await pag.goto(BASE, {waitUntil: 'networkidle'});
  await pag.fill('#usuario', usuario);
  await pag.fill('#clave', CLAVES[usuario]);
  await pag.click('#btn-entrar');
  await pag.waitForSelector('.app.visible', {timeout: 10000});
  return {ctx, pag, errores};
}

(async () => {
  const navegador = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});

  console.log('\n== Comercial: alta de cliente e instalación ==');
  const {ctx, pag, errores} = await entrar(navegador, 'nando');

  await pag.evaluate(() => { location.hash = '#clientes'; });
  await pag.waitForTimeout(700);
  await pag.click('text=+ Nuevo cliente');
  await pag.waitForSelector('.ventana');
  await pag.fill('#c_nombre', 'Prueba Navegador');
  await pag.fill('#c_telefono', '600112233');
  await pag.fill('#c_direccion', 'Calle del Ensayo 3');
  await pag.fill('#c_municipio', 'Tres Cantos');
  await pag.fill('#c_gasto_luz_mes', '120');
  await pag.fill('#c_gasto_combustible', '2400');
  await pag.fill('#c_interes', '9');
  await pag.click('.ventana footer button.primario');
  await pag.waitForSelector('.ventana', {state: 'detached', timeout: 10000});
  await pag.waitForTimeout(1400);
  comprobar('se crea el cliente y se abre su ficha',
    (await pag.textContent('#vista h1').catch(() => '')) === 'Prueba Navegador',
    await pag.textContent('#vista h1').catch(() => ''));
  comprobar('el gasto energético se calcula solo',
    (await pag.textContent('#vista')).includes('3840 €'),
    (await pag.textContent('#vista')).slice(0, 200));

  await pag.click('text=+ Instalación');
  await pag.waitForSelector('.ventana');
  await pag.selectOption('#c_tipo', 'fv_aero');
  await pag.fill('#c_importe_fv', '11990');
  await pag.fill('#c_importe_aero', '16990');
  await pag.selectOption('#c_estado', 'firmada');
  await pag.fill('#c_fecha_firma', '2026-09-15');
  await pag.fill('#c_paneles_num', '16');
  await pag.fill('#c_panel_modelo', 'Hanersun 630W');
  await pag.fill('#c_aero_kw', '16');
  await pag.click('.ventana footer button.primario');
  await pag.waitForSelector('.ventana', {state: 'detached', timeout: 10000});
  await pag.waitForTimeout(1500);
  await pag.click('text=Instalaciones (1)');
  await pag.waitForTimeout(500);
  const ficha = await pag.textContent('#vista');
  comprobar('la instalación aparece con su importe', ficha.includes('28.980 €'));
  comprobar('los cobros 50/25/25 se generan solos',
    (ficha.match(/50% a la firma|25% al depósito|25% a la finalización/g) || []).length >= 3);
  comprobar('los componentes se muestran', ficha.includes('Hanersun 630W') && ficha.includes('Aerotermia 16 kW'));
  await pag.screenshot({path: path.join(SALIDA, 'flujo_instalacion.png'), fullPage: true});

  console.log('\n== Comercial: parte del día y lectura del resumen ==');
  await pag.evaluate(() => { location.hash = '#parte'; });
  await pag.waitForTimeout(1200);
  const opcionCliente = await pag.$eval('#vista select',
    el => Array.from(el.options).find(o => o.textContent.includes('Prueba Navegador')).value);
  await pag.selectOption('#vista select', opcionCliente);
  await pag.fill('#vista textarea',
    'He estado con Prueba Navegador y firmamos el contrato. Le llamo el lunes para la visita técnica.');
  await pag.click('#vista button.primario');
  await pag.waitForTimeout(1600);
  const analisis = await pag.textContent('#vista');
  comprobar('el sistema lee el resumen y propone cambios', analisis.includes('Lo que he entendido'), '');
  comprobar('reconoce al cliente del texto', analisis.includes('Prueba Navegador'));
  await pag.screenshot({path: path.join(SALIDA, 'flujo_parte.png'), fullPage: true});
  const botonAplicar = await pag.$('text=Aplicar los cambios marcados');
  comprobar('hay botón para confirmar los cambios', !!botonAplicar);
  if (botonAplicar) {
    await botonAplicar.click();
    await pag.waitForTimeout(1800);
  }

  await pag.evaluate(() => { location.hash = '#resumen'; });
  await pag.waitForTimeout(1500);
  const resumen = await pag.textContent('#vista');
  comprobar('el resumen personal cuenta la venta', /Ventas/.test(resumen));
  comprobar('el resumen no habla de contabilidad de la empresa',
    !resumen.includes('Beneficio neto') && !resumen.includes('Estructura'));
  await pag.screenshot({path: path.join(SALIDA, 'flujo_resumen.png'), fullPage: true});

  console.log('\n== El comercial no llega a la parte financiera ==');
  await pag.evaluate(() => { location.hash = '#contabilidad'; });
  await pag.waitForTimeout(900);
  comprobar('contabilidad bloqueada para el comercial',
    (await pag.textContent('#vista')).includes('no está abierta para tu usuario'));
  await pag.evaluate(() => { location.hash = '#mapa'; });
  await pag.waitForTimeout(900);
  comprobar('el mapa está bloqueado para el comercial',
    (await pag.textContent('#vista')).includes('no está abierta para tu usuario'));
  const menu = await pag.textContent('#menu');
  comprobar('el menú del comercial no ofrece contabilidad ni mapa',
    !menu.includes('Contabilidad') && !menu.includes('Mapa'), menu.replace(/\s+/g, ' '));

  await ctx.close();

  console.log('\n== Dirección: cobro y nómina ==');
  const dir = await entrar(navegador, 'fernando');
  await dir.pag.evaluate(() => { location.hash = '#cobros'; });
  await dir.pag.waitForTimeout(1800);
  const antes = await dir.pag.$$('text=Cobrado');
  const botonCobrado = await dir.pag.$('table.datos tbody button.lima');
  comprobar('hay cobros pendientes que marcar', !!botonCobrado);
  if (botonCobrado) {
    await botonCobrado.click();
    await dir.pag.waitForTimeout(1800);
    comprobar('el cobro queda registrado',
      (await dir.pag.textContent('#aviso')).includes('Cobro registrado'));
  }
  await dir.pag.screenshot({path: path.join(SALIDA, 'flujo_cobros.png'), fullPage: true});

  await dir.pag.evaluate(() => { location.hash = '#nomina'; });
  await dir.pag.waitForTimeout(2200);
  const opcionNando = await dir.pag.$eval('.filtros select',
    el => Array.from(el.options).find(o => o.textContent.includes('Nando')).value);
  await dir.pag.selectOption('.filtros select', opcionNando);
  await dir.pag.waitForTimeout(1800);
  await dir.pag.click('text=+ Subir nómina en PDF');
  await dir.pag.waitForSelector('.ventana');
  await dir.pag.setInputFiles('.ventana input[type=file]', '/tmp/nomina-ejemplo.pdf');
  await dir.pag.fill('.ventana input[type=month]', '2026-09');
  await dir.pag.fill('.ventana input[type=number]', '1899,55'.replace(',', '.'));
  await dir.pag.click('.ventana footer button.primario');
  await dir.pag.waitForSelector('.ventana', {state: 'detached', timeout: 15000});
  await dir.pag.waitForTimeout(2200);
  const nomina = await dir.pag.textContent('#vista');
  comprobar('la nómina en PDF queda subida', /Septiembre de 2026|septiembre de 2026/.test(nomina), '');
  comprobar('se ve el botón de abrir el PDF', /Ver PDF/.test(nomina));
  comprobar('el devengo día a día sigue disponible',
    /Ver el devengo día a día/.test(nomina));
  await dir.pag.screenshot({path: path.join(SALIDA, 'flujo_nomina.png'), fullPage: true});

  console.log('\n== Mapa de dirección ==');
  await dir.pag.evaluate(() => { location.hash = '#mapa'; });
  await dir.pag.waitForTimeout(3200);
  const mapa = await dir.pag.textContent('#vista');
  comprobar('el mapa carga con puntos', /Clientes en el mapa/.test(mapa));
  const marcadores = await dir.pag.$$('.leaflet-interactive');
  comprobar('hay marcadores dibujados', marcadores.length > 0, String(marcadores.length));
  await dir.pag.screenshot({path: path.join(SALIDA, 'flujo_mapa.png')});

  const errDir = dir.errores.filter(e => !/tile|TUNNEL/i.test(e));
  comprobar('sin errores de página en dirección', errDir.length === 0, errDir.join(' | '));
  const errCom = errores.filter(e => !/tile|TUNNEL/i.test(e));
  comprobar('sin errores de página en comercial', errCom.length === 0, errCom.join(' | '));

  await dir.ctx.close();
  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos : 'Flujos correctos'));
  process.exit(fallos ? 1 : 0);
})();
