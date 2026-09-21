/* Recorre el CRM con un navegador real: entra con cada rol, abre todas
   las pantallas, recoge los errores de consola y guarda capturas. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, {recursive: true});

const RECORRIDOS = {
  fernando: ['panel', 'agenda', 'clientes', 'operaciones', 'captaciones', 'mapa', 'contabilidad',
             'facturas', 'cobros', 'gastos', 'equipo', 'partes', 'nomina', 'ajustes', 'registro', 'perfil'],
  superadmin: ['panel', 'usuarios', 'mapa', 'contabilidad'],
  nando: ['panel', 'agenda', 'clientes', 'operaciones', 'captaciones', 'parte', 'resumen', 'nomina', 'perfil'],
  sandra: ['panel', 'agenda', 'captaciones', 'clientes', 'parte', 'resumen', 'nomina', 'perfil']
};

(async () => {
  const navegador = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const errores = [];
  let capturas = 0;

  for (const [usuario, rutas] of Object.entries(RECORRIDOS)) {
    const ctx = await navegador.newContext({viewport: {width: 1440, height: 950}});
    await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
    const pag = await ctx.newPage();
    pag.on('console', m => { if (m.type() === 'error') errores.push(usuario + ' · consola: ' + m.text()); });
    pag.on('pageerror', e => errores.push(usuario + ' · página: ' + e.message));

    await pag.goto(BASE, {waitUntil: 'networkidle'});
    await pag.fill('#usuario', usuario);
    await pag.fill('#clave', CLAVES[usuario]);
    await pag.click('#btn-entrar');
    try {
      await pag.waitForSelector('.app.visible', {timeout: 10000});
    } catch (e) {
      errores.push(usuario + ' · no ha podido entrar: ' + (await pag.textContent('#acceso-error').catch(() => '')));
      await pag.screenshot({path: path.join(SALIDA, usuario + '_fallo_entrada.png')});
      await ctx.close();
      continue;
    }

    for (const ruta of rutas) {
      await pag.evaluate(r => { location.hash = '#' + r; }, ruta);
      await pag.waitForTimeout(ruta === 'mapa' ? 2600 : 900);
      const vacio = await pag.$eval('#vista', el => el.textContent.trim().length < 20).catch(() => true);
      if (vacio) errores.push(usuario + ' · pantalla vacía: ' + ruta);
      await pag.screenshot({path: path.join(SALIDA, usuario + '_' + ruta + '.png'), fullPage: ruta !== 'mapa'});
      capturas++;
    }

    /* Abrir una ficha de cliente */
    if (['fernando', 'nando', 'sandra'].includes(usuario)) {
      await pag.evaluate(() => { location.hash = '#clientes'; });
      await pag.waitForTimeout(700);
      const fila = await pag.$('table.datos tbody tr.pulsable');
      if (fila) {
        await fila.click();
        await pag.waitForTimeout(900);
        await pag.screenshot({path: path.join(SALIDA, usuario + '_ficha_cliente.png'), fullPage: true});
        capturas++;
        const titulo = await pag.textContent('#titulo');
        if (!/ficha/i.test(titulo || '')) errores.push(usuario + ' · la ficha de cliente no se abre');
      } else if (usuario !== 'sandra') {
        errores.push(usuario + ' · no hay filas de clientes');
      }
    }
    await ctx.close();
  }

  await navegador.close();
  console.log('\nCapturas: ' + capturas);
  if (errores.length) {
    console.log('\nPROBLEMAS (' + errores.length + '):');
    [...new Set(errores)].forEach(e => console.log(' · ' + e));
    process.exit(1);
  }
  console.log('Sin errores de consola ni pantallas vacías.');
})();
