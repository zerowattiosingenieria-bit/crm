/* CAEs y WIXER (09/11/2026): dirección ve el apartado, importa del Drive sin duplicar, marca papeles; el comercial no lo ve y el importe solo con finanzas. */
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
  await d.pag.evaluate(() => { location.hash = '#hoy'; }); await d.pag.waitForTimeout(1500);
  const cli = await d.pag.evaluate(async () => { const api = await import('/assets/js/api.js'); const c = (api.estado.clientes || []).find(x => /\d/.test(x.direccion || '')); return c; });
  const filas = [
    {tipo: 'cae', numero: '1', nombre: 'Titular prueba', direccion: cli.direccion, poblacion: 'Algete', producto: 'AEROTERMIA 22KW 150+150 ACS / 100 INERCIA', progreso: 100, estado: 'completo', carpeta_id: 'CARPETA1', datos: {contrato: 'CT-ZW101', fecha_financiacion: '2026-02-02', iban: 'ES00 1234'}},
    {tipo: 'cae', numero: '15', nombre: 'Jeanett', direccion: 'De la Requexeda 8', poblacion: 'Hoyo de Manzanares', producto: 'AEROTERMIA 16KW', progreso: 0, carpeta_id: 'CARPETA2'},
    {tipo: 'wixer', numero: '2', nombre: 'Álvaro', direccion: 'Azor, 15', compania: '', estado: 'finalizado', importe: 78.65, datos: {compania_actual: 'ENDESA', compania_nueva: 'NATURGY', tarifa: 'USO LUZ', potencia: '3,3 KW', peaje: '2.0TD', factura: 'FZW2026-108'}}
  ];
  const r1 = await d.pedir('importarTramites', {tramites: filas});
  comprobar('importa 3 trámites', r1.ok && r1.nuevos === 3, r1);
  const r2 = await d.pedir('importarTramites', {tramites: filas, soloVacios: true});
  comprobar('reimportar no duplica', r2.ok && r2.nuevos === 0, r2);
  const l = await d.pedir('tramites', {});
  comprobar('lista con 3', l.ok && l.tramites.length === 3, l);
  const t1 = l.tramites.find(t => t.numero === '1' && t.tipo === 'cae');
  comprobar('casa el cliente por la dirección', t1 && t1.cliente_id === cli.id, t1);
  comprobar('nunca guarda el IBAN', !JSON.stringify(l).includes('ES00 1234'));
  comprobar('el importe llega a dirección con finanzas', l.tramites.find(t => t.tipo === 'wixer').importe === 78.65);
  await d.pag.evaluate(() => { location.hash = '#tramites'; }); await d.pag.waitForTimeout(1500);
  let txtp = await d.pag.textContent('body');
  comprobar('se ve el apartado CAEs', /Expedientes CAE/.test(txtp) && /Requexeda/.test(txtp), txtp.slice(0, 200));
  await d.pag.screenshot({path: path.join(SALIDA, 'tramites-caes.png'), fullPage: true});
  const t2 = l.tramites.find(t => t.numero === '15');
  await d.pag.locator('.tr-fila', {hasText: 'Requexeda'}).locator('label.tr-doc', {hasText: 'CEE inicial'}).locator('input').check();
  await d.pag.waitForTimeout(1500);
  const l2 = await d.pedir('tramites', {});
  const t2b = l2.tramites.find(t => t.id === t2.id);
  comprobar('marcar un papel sube el progreso', t2b.checklist.cee_inicial && t2b.progreso === 10, t2b);
  const todos = {}; l2.docs_cae.forEach(k => todos[k] = true);
  const r3 = await d.pedir('guardarTramite', {tramite: {id: t2.id, checklist: todos}});
  comprobar('con todos los papeles pasa a «completo»', r3.ok && r3.tramite.estado === 'completo' && r3.tramite.progreso === 100, r3);
  await d.pag.locator('button', {hasText: 'WIXER'}).first().click(); await d.pag.waitForTimeout(800);
  txtp = await d.pag.textContent('body');
  comprobar('pestaña WIXER', /ENDESA/.test(txtp) || /Finalizados/.test(txtp), txtp.slice(0, 300));
  await d.pag.locator('select').last().selectOption('todos'); await d.pag.waitForTimeout(500);
  comprobar('WIXER enseña la compañía', /ENDESA/.test(await d.pag.textContent('body')));
  await d.pag.screenshot({path: path.join(SALIDA, 'tramites-wixer.png'), fullPage: true});
  const m = await entra('fernando', 390);
  await m.pag.evaluate(() => { location.hash = '#tramites'; }); await m.pag.waitForTimeout(1500);
  const sw = await m.pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar('móvil sin scroll lateral', sw <= 400, sw);
  await m.pag.screenshot({path: path.join(SALIDA, 'tramites-movil.png'), fullPage: true});
  const c = await entra('nando');
  comprobar('el comercial no tiene el menú', !/CAEs y WIXER/.test(await c.pag.textContent('#menu')));
  const rc = await c.pedir('tramites', {});
  comprobar('el comercial no puede leerlos', !rc.ok, rc);
  const ab = await entra('abraham');
  comprobar('Abraham tiene el menú', /CAEs y WIXER/.test(await ab.pag.textContent('#menu')));
  const ra = await ab.pedir('tramites', {});
  comprobar('Abraham ve CAEs y WIXER, sin importes', ra.ok && ra.tipos.join() === 'cae,wixer' && ra.tramites.every(t => t.importe === null) && ra.responsables.cae, ra.tipos);
  await ab.pag.evaluate(() => { location.hash = '#tramites'; }); await ab.pag.waitForTimeout(1500);
  comprobar('Abraham entra en el apartado', /Responsable:/.test(await ab.pag.textContent('body')));
  await ab.pag.locator('button', {hasText: 'WIXER'}).first().click(); await ab.pag.waitForTimeout(600);
  await ab.pag.locator('.tr-etapa', {hasText: 'Finalizado'}).click(); await ab.pag.waitForTimeout(400);
  await ab.pag.locator('.tr-etapa', {hasText: 'Finalizado'}).click(); await ab.pag.waitForTimeout(400);
  await ab.pag.locator('select').last().selectOption('todos'); await ab.pag.waitForTimeout(400);
  await ab.pag.locator('.tr-fila', {hasText: 'Azor'}).locator('.tr-paso', {hasText: 'Solicitado'}).click(); await ab.pag.waitForTimeout(1500);
  const rw = (await ab.pedir('tramites', {})).tramites.find(t => t.tipo === 'wixer' && /Azor/.test(t.direccion));
  comprobar('un toque en el paso cambia el estado', rw.estado === 'solicitado', rw.estado);
  await ab.pag.screenshot({path: path.join(SALIDA, 'tramites-pasos.png'), fullPage: true});
  const sa = await entra('sandra');
  const rs2 = await sa.pedir('tramites', {});
  comprobar('Sandra solo ve WIXER', rs2.ok && rs2.tipos.join() === 'wixer' && rs2.tramites.every(t => t.tipo === 'wixer'), rs2.tipos);
  const rs3 = await sa.pedir('guardarTramite', {tramite: {tipo: 'cae', direccion: 'Prueba 1'}});
  comprobar('Sandra no puede crear un CAE', !rs3.ok, rs3);
  await sa.pag.evaluate(() => { location.hash = '#tramites'; }); await sa.pag.waitForTimeout(1500);
  const tsa = await sa.pag.textContent('body');
  comprobar('Sandra entra directamente en WIXER', /Cambios de compañía eléctrica/.test(tsa) && !/CAEs \(Novawatt\)/.test(tsa));
  const ru = await entra('rober');
  comprobar('Rober no lo ve', !(await ru.pedir('tramites', {})).ok);
  const sy = await d.pedir('syncContabilidad', {guardar: {banktrack: [{cuenta: 'CaixaBank', resumen: '12 movimientos nuevos'}], avisos: ['Factura FZW2026-120 en Drive sin cobro en el CRM']}});
  comprobar('guarda el estado de la sincronización contable', sy.ok && sy.sync.avisos.length === 1, sy);
  await d.pag.evaluate(() => { location.hash = '#contabilidad'; }); await d.pag.waitForTimeout(2500);
  comprobar('Contabilidad enseña la sincronización', /Sincronización con BankTrack y Drive/.test(await d.pag.textContent('body')) && /FZW2026-120/.test(await d.pag.textContent('body')));
  const rs = await c.pedir('syncContabilidad', {});
  comprobar('el comercial no ve la sincronización contable', !rs.ok, rs);
  comprobar('sin errores de página', errores.length === 0, errores);
  console.log('\n' + (fallos ? 'FALLAN ' + fallos : 'Todo correcto') + ' de ' + hechas);
  await nav.close(); process.exit(fallos ? 1 : 0);
})();
