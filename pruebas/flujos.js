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
  /* ===== Directorio histórico y puertas tocadas ===== */
  console.log('\n== Directorio y puertas ==');
  {
    const {ctx, pag, errores} = await entrar(navegador, 'fernando');
    await pag.evaluate(async () => {
      const api = await import('/assets/js/api.js');
      const hoy = new Date().toISOString().slice(0, 10);
      await api.pedir('importarDirectorio', {clientes: [
        {ref: 'CL-A1', empresa: 'Aurus', nombre: 'Ficha de Aurus', municipio: 'Las Rozas',
         direccion: 'Calle A 1', telefono: '600000001', lat: 40.49, lon: -3.87,
         precision: 'exacta', n_visitas: 1, ultima_visita: '2026-05-01'},
        {ref: 'CL-A2', empresa: 'Zero Wattios', nombre: 'Ficha de Zero', municipio: 'Pozuelo',
         direccion: 'Calle B 2', telefono: '600000002'}]});
      await api.pedir('importarDirVisitas', {visitas: [
        {ref: 'CL-A1', cliente: 'Ficha de Aurus', fecha: '2026-05-01', hora: '10:00', comercial: 'Rober'}]});
      await api.pedir('importarPuertas', {puertas: [
        {nombre: 'Puerta vieja', direccion: 'Calle A 1', zona: 'Las Rozas',
         fecha: '2026-02-01', hora: '10:00', lat: 40.491, lon: -3.871},
        {nombre: 'Puerta de hoy', direccion: 'Calle B 2', zona: 'Pozuelo',
         fecha: hoy, hora: '11:00', lat: 40.432, lon: -3.812}]});
    });

    comprobar('dirección tiene el directorio en el menú',
      await pag.locator('a.nav', {hasText: 'Directorio'}).count() === 1);

    await pag.goto(BASE + '/#directorio', {waitUntil: 'networkidle'});
    await pag.waitForSelector('table.datos', {timeout: 10000});
    const listado = await pag.locator('#vista').innerText();
    comprobar('el archivo trae las fichas', /Ficha de Aurus/.test(listado) && /Ficha de Zero/.test(listado));
    comprobar('dice cuántas hay de cuántas', /2 de 2 fichas/.test(listado), listado.slice(0, 60));

    await pag.click('button.btn:has-text("Ver en el mapa")');
    await pag.waitForSelector('.leaflet-container', {timeout: 10000});
    await pag.waitForTimeout(1200);
    comprobar('el mapa del archivo pinta solo los que tienen coordenada',
      await pag.locator('.leaflet-interactive, .leaflet-marker-icon').count() === 1);

    await pag.locator('tr.pulsable').first().click();
    await pag.waitForTimeout(800);
    comprobar('la ficha abre con sus visitas', /Visitas \(1\)/.test(await pag.locator('#vista').innerText()));

    /* Cambiar solo el ancla no recarga la página: hay que esperar a que la
       pantalla de puertas esté de verdad pintada, no a que llegue la red. */
    await pag.goto(BASE + '/#directorio/puertas');
    await pag.waitForFunction(
      () => /NUEVAS ESTA SEMANA/i.test(document.querySelector('#vista').innerText) &&
            document.querySelectorAll('.leaflet-interactive, .marker-cluster').length > 0,
      null, {timeout: 15000});
    const puertas = await pag.locator('#vista').innerText();
    comprobar('cuenta las puertas nuevas de la semana', /NUEVAS ESTA SEMANA\n1/i.test(puertas), puertas.slice(0, 120));
    /* Leaflet agrupa las cercanas, así que se comprueba que el mapa se pinta
       y que la tarjeta dice las dos que hay, no cuántos círculos se ven. */
    comprobar('el mapa de puertas se pinta',
      await pag.locator('.leaflet-interactive, .leaflet-marker-icon, .marker-cluster').count() >= 1);
    comprobar('y dice que hay dos puertas', /2 puertas en el mapa/.test(puertas), puertas.slice(0, 80));
    comprobar('hay reparto por semanas', /Puertas por semana/.test(puertas));

    await pag.click('button.btn:has-text("Ver en listado")');
    await pag.waitForFunction(
      () => /Puerta vieja/.test(document.querySelector('#vista').innerText),
      null, {timeout: 15000});
    const tablaPuertas = await pag.locator('#vista').innerText();
    comprobar('en listado se marca cuál es nueva', /nueva/.test(tablaPuertas));
    comprobar('y están las dos', /Puerta vieja/.test(tablaPuertas) && /Puerta de hoy/.test(tablaPuertas));

    /* ---------- crear, corregir y borrar desde la pantalla ---------- */

    await pag.click('button.btn:has-text("+ Nueva puerta")');
    await pag.waitForSelector('.ventana');
    await pag.fill('#c_nombre', 'Puerta a mano');
    await pag.fill('#c_zona', 'Boadilla');
    await pag.fill('#c_lat', '40.405');
    await pag.fill('#c_lon', '-3.878');
    await pag.click('.ventana footer button.primario');
    await pag.waitForSelector('.ventana', {state: 'detached', timeout: 10000});
    await pag.waitForFunction(
      () => /Puerta a mano/.test(document.querySelector('#vista').innerText),
      null, {timeout: 15000});
    comprobar('se apunta una puerta desde la pantalla', true);

    /* Corregirla: se le pone una nota y tiene que verse en el listado. */
    await pag.locator('tr', {hasText: 'Puerta a mano'}).first()
      .locator('button.btn:has-text("Editar")').click();
    await pag.waitForSelector('.ventana');
    await pag.fill('#c_nota', 'No estaban en casa');
    await pag.click('.ventana footer button.primario');
    await pag.waitForSelector('.ventana', {state: 'detached', timeout: 10000});
    await pag.waitForFunction(
      () => /No estaban en casa/.test(document.querySelector('#vista').innerText),
      null, {timeout: 15000});
    comprobar('se corrige la puerta y se ve la nota', true);

    /* El Excel: se descarga de verdad y se mira por dentro. */
    const bajada = await Promise.all([
      pag.waitForEvent('download', {timeout: 20000}),
      pag.click('button.btn:has-text("Excel")')
    ]);
    const destino = path.join(SALIDA, 'puertas.xlsx');
    await bajada[0].saveAs(destino);
    comprobar('el Excel de puertas se descarga',
      /^puertas-zero-wattios-\d{8}\.xlsx$/.test(bajada[0].suggestedFilename()),
      bajada[0].suggestedFilename());
    const dentro = require('child_process')
      .execSync('unzip -p ' + JSON.stringify(destino) + ' xl/worksheets/sheet1.xml').toString();
    comprobar('y por dentro es un xlsx con las puertas',
      /Puerta a mano/.test(dentro) && /No estaban en casa/.test(dentro),
      dentro.slice(0, 120));
    const hojas = require('child_process')
      .execSync('unzip -l ' + JSON.stringify(destino)).toString();
    comprobar('con sus tres pestañas', /sheet3\.xml/.test(hojas));

    /* El PDF se monta en un marco escondido y se manda imprimir; aquí se
       mira que la hoja lleve lo que tiene que llevar. */
    await pag.click('button.btn:has-text("PDF")');
    await pag.waitForFunction(
      () => {
        const m = [...document.querySelectorAll('iframe')]
          .map(x => { try { return x.contentDocument; } catch (e) { return null; } })
          .filter(d => d && /Puertas tocadas/.test(d.body.innerText || ''));
        return m.length ? m[0].body.innerText : false;
      }, null, {timeout: 15000});
    const informe = await pag.evaluate(() => {
      const d = [...document.querySelectorAll('iframe')]
        .map(x => x.contentDocument).filter(x => x && /Puertas tocadas/.test(x.body.innerText))[0];
      return {texto: d.body.innerText, filas: d.querySelectorAll('tbody tr').length,
              titulo: d.title, marca: !!d.querySelector('.marca')};
    });
    comprobar('el informe en PDF lleva la marca y el título',
      informe.marca && informe.titulo === 'Puertas tocadas');
    comprobar('con el resumen de la semana', /NUEVAS ESTA SEMANA|Nuevas esta semana/i.test(informe.texto),
      informe.texto.slice(0, 150));
    comprobar('el reparto por zona', /por zona/i.test(informe.texto), informe.texto.slice(0, 200));
    comprobar('y una fila por puerta', informe.filas === 3, informe.filas);

    /* Borrar marcando la casilla. */
    await pag.locator('tr', {hasText: 'Puerta a mano'}).first()
      .locator('input[type=checkbox]').check();
    await pag.waitForFunction(
      () => /marcada/.test(document.querySelector('#vista').innerText),
      null, {timeout: 10000});
    await pag.click('button.btn.peligro:has-text("Borrar la marcada")');
    await pag.waitForSelector('.ventana');
    await pag.click('.ventana footer button.peligro');
    await pag.waitForFunction(
      () => !/Puerta a mano/.test(document.querySelector('#vista').innerText),
      null, {timeout: 15000});
    comprobar('se borra la puerta marcada', true);

    /* Y lo mismo en el archivo de clientes. */
    await pag.goto(BASE + '/#directorio');
    await pag.waitForSelector('table.datos', {timeout: 10000});
    await pag.click('button.btn:has-text("+ Nueva ficha")');
    await pag.waitForSelector('.ventana');
    await pag.fill('#c_nombre', 'Ficha a mano');
    await pag.fill('#c_municipio', 'Boadilla del Monte');
    await pag.click('.ventana footer button.primario');
    await pag.waitForSelector('.ventana', {state: 'detached', timeout: 10000});
    await pag.waitForFunction(
      () => /Ficha a mano/.test(document.querySelector('#vista').innerText),
      null, {timeout: 15000});
    comprobar('se da de alta una ficha desde la pantalla', true);

    const bajadaDir = await Promise.all([
      pag.waitForEvent('download', {timeout: 20000}),
      pag.click('button.btn:has-text("Excel")')
    ]);
    const destinoDir = path.join(SALIDA, 'directorio.xlsx');
    await bajadaDir[0].saveAs(destinoDir);
    const dentroDir = require('child_process')
      .execSync('unzip -p ' + JSON.stringify(destinoDir) + ' xl/worksheets/sheet1.xml').toString();
    comprobar('el Excel del directorio trae las tres fichas',
      /Ficha a mano/.test(dentroDir) && /Ficha de Aurus/.test(dentroDir) &&
      /Ficha de Zero/.test(dentroDir));

    await pag.locator('tr', {hasText: 'Ficha a mano'}).first()
      .locator('input[type=checkbox]').check();
    await pag.click('button.btn.peligro:has-text("Borrar la marcada")');
    await pag.waitForSelector('.ventana');
    await pag.click('.ventana footer button.peligro');
    await pag.waitForFunction(
      () => !/Ficha a mano/.test(document.querySelector('#vista').innerText),
      null, {timeout: 15000});
    comprobar('y se borra marcándola', true);

    comprobar('sin errores de página en el directorio', errores.length === 0, errores[0]);
    await ctx.close();
  }
  {
    const {ctx, pag} = await entrar(navegador, 'rober');
    comprobar('a rober no le aparece el directorio',
      await pag.locator('a.nav', {hasText: 'Directorio'}).count() === 0);
    await pag.goto(BASE + '/#directorio', {waitUntil: 'networkidle'});
    await pag.waitForTimeout(900);
    comprobar('y si entra a pelo, el servidor le para',
      /no está abierta|no tiene acceso/i.test(await pag.locator('#vista').innerText()));
    await ctx.close();
  }

  await navegador.close();

  console.log('\n' + (fallos ? 'FALLAN ' + fallos : 'Flujos correctos'));
  process.exit(fallos ? 1 : 0);
})();
