/* El registro de conexiones con un navegador de verdad: un comercial
   entra desde «Tres Cantos» y hace cosas, el superadmin lo ve, lo filtra
   por horas, persona y tipo, y lo saca a Excel y a PDF. Ni el comercial ni
   el administrador llegan a verlo. Se lanza con el servidor de pruebas
   arrancado; las capturas van a pruebas/capturas (o a CAPTURAS=...). */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

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

/* El servicio de IP se contesta desde aquí: en pruebas no hay salida a
   internet, y así se sabe qué tiene que aparecer en el registro. Con
   «bloquear», como si un cortafuegos no dejara pasar: el CRM debe seguir. */
async function entrar(navegador, usuario, {ancho = 1280, alto = 900, red = 'tres-cantos'} = {}) {
  const ctx = await navegador.newContext({viewport: {width: ancho, height: alto}, acceptDownloads: true});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  await ctx.route(/geojs\.io|ipapi\.co/, ruta => red === 'bloquear' ? ruta.abort()
    : ruta.fulfill({status: 200, contentType: 'application/json',
        headers: {'Access-Control-Allow-Origin': '*'},
        body: JSON.stringify({ip: '88.12.34.56', city: 'Tres Cantos', region: 'Madrid', country: 'Spain'})}));
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
  return {ctx, pag, errores};
}

const menu = pag => pag.$$eval('#menu a.nav', as => as.map(a => a.textContent));
const pedirDesde = (pag, accion, params) => pag.evaluate(async ([a, p]) => {
  const api = await import('/assets/js/api.js');
  try { return await api.pedir(a, p || {}); } catch (e) { return {ok: false, error: e.message}; }
}, [accion, params]);
const filasTabla = pag => pag.$$eval('.registro-lista table.datos tbody tr',
  trs => trs.map(tr => Array.from(tr.children).map(td => td.innerText.trim())));
async function esperarTabla(pag) {
  await pag.waitForFunction(() => !document.querySelector('#vista .cargando'), null, {timeout: 10000});
  await pag.waitForTimeout(150);
}

(async () => {
  const navegador = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']});

  console.log('\n== Un comercial entra y hace cosas ==');
  const com = await entrar(navegador, 'nando');
  await com.pag.waitForTimeout(400);
  const menuCom = await menu(com.pag);
  comprobar('el comercial no tiene el registro en el menú', !menuCom.some(t => /Registro/.test(t)), menuCom);
  await com.pag.evaluate(() => { location.hash = '#clientes'; });
  await com.pag.waitForTimeout(600);
  const alta = await pedirDesde(com.pag, 'guardarCliente',
    {cliente: {nombre: 'Cliente Registro Navegador', direccion: 'Calle del Registro 7', municipio: 'Tres Cantos'}});
  comprobar('el comercial da de alta un cliente', alta.ok === true, alta.error);
  await com.pag.evaluate(() => { location.hash = '#registro'; });
  await com.pag.waitForTimeout(500);
  comprobar('si entra a pelo en #registro, se le dice que no',
    /no está abierta para tu usuario/.test(await com.pag.textContent('#vista')));
  const intento = await pedirDesde(com.pag, 'registro', {});
  comprobar('y si llama al servidor, el servidor le para', intento.ok === false, intento);
  comprobar('sin errores de página en el comercial', com.errores.length === 0, com.errores);
  await com.ctx.close();

  console.log('\n== El administrador tampoco ==');
  const adm = await entrar(navegador, 'fernando', {red: 'bloquear'});
  await adm.pag.waitForTimeout(400);
  const menuAdm = await menu(adm.pag);
  comprobar('el administrador no tiene el registro en el menú', !menuAdm.some(t => /Registro/.test(t)), menuAdm);
  comprobar('ni puede pedirlo al servidor', (await pedirDesde(adm.pag, 'registro', {})).ok === false);
  comprobar('con el servicio de IP bloqueado el CRM funciona igual', adm.errores.length === 0, adm.errores);
  await adm.ctx.close();

  console.log('\n== El superadmin lo ve ==');
  const sup = await entrar(navegador, 'superadmin');
  const {pag} = sup;
  const menuSup = await menu(pag);
  comprobar('el superadmin sí tiene «Registro de conexiones» en el menú',
    menuSup.includes('⟲Registro de conexiones'), menuSup);
  await pag.evaluate(() => { location.hash = '#registro'; });
  await pag.waitForSelector('.registro-fechas');
  await esperarTabla(pag);
  let filas = await filasTabla(pag);
  comprobar('hoy hay movimientos', filas.length > 3, filas.length);
  const entradaNando = filas.find(f => /Nando/.test(f[1]) && /Entra en el CRM/.test(f[3]));
  comprobar('sale la entrada del comercial con IP y lugar',
    entradaNando && /88\.12\.34\.56/.test(entradaNando[7]) && /Tres Cantos/.test(entradaNando[7]), entradaNando);
  comprobar('y con el equipo legible', entradaNando && /Chrome/.test(entradaNando[6]), entradaNando);
  const fallidaAdm = filas.find(f => /Fernando/.test(f[1]));
  comprobar('el administrador, con el servicio bloqueado, sale sin IP', fallidaAdm && /^—/.test(fallidaAdm[7]),
    fallidaAdm);
  await pag.waitForTimeout(3200);           // que se vaya el aviso de la clave inicial
  await pag.screenshot({path: path.join(SALIDA, '60_registro_escritorio.png')});
  await pag.screenshot({path: path.join(SALIDA, '60_registro_escritorio_completo.png'), fullPage: true});

  /* Por persona y por tipo. */
  const idNando = await pag.evaluate(async () => (await import('/assets/js/api.js')).estado.usuarios
    .find(u => u.usuario === 'nando').id);
  await pag.selectOption('select[aria-label="Persona"]', idNando);
  await esperarTabla(pag);
  await pag.selectOption('select[aria-label="Tipo"]', 'modificacion');
  await esperarTabla(pag);
  filas = await filasTabla(pag);
  comprobar('filtrando por Nando y modificaciones sale su alta',
    filas.length >= 1 && filas.every(f => /Nando/.test(f[1]) && /Modificación/.test(f[2])) &&
    filas.some(f => /Da de alta un cliente/.test(f[3])), filas.slice(0, 3));
  const resumen = await pag.$$eval('#vista table.datos', ts => ts[0].innerText);
  comprobar('el resumen por persona solo trae a Nando', /Nando/.test(resumen) && !/Superadmin/.test(resumen), resumen);
  await pag.screenshot({path: path.join(SALIDA, '60_registro_filtro_persona_tipo.png')});

  /* Consultas: abrir el CRM cuenta. */
  await pag.selectOption('select[aria-label="Tipo"]', 'consulta');
  await esperarTabla(pag);
  filas = await filasTabla(pag);
  comprobar('las consultas del comercial también salen', filas.some(f => /Abre o recarga el CRM/.test(f[3])),
    filas.slice(0, 3));

  /* Conexiones del día, de tal hora a tal hora. */
  await pag.selectOption('select[aria-label="Persona"]', '');
  await pag.selectOption('select[aria-label="Tipo"]', 'conexion');
  await esperarTabla(pag);
  const ahora = await pag.evaluate(() => new Date().toTimeString().slice(0, 5));
  await pag.fill('input[aria-label="Hasta (hora)"]', '00:00');
  await pag.dispatchEvent('input[aria-label="Hasta (hora)"]', 'change');
  await esperarTabla(pag);
  filas = await filasTabla(pag);
  comprobar('de 00:00 a 00:00 de hoy no hay nada', filas.length === 1 && /No hay movimientos/.test(filas[0][0]),
    filas.slice(0, 2));
  await pag.fill('input[aria-label="Hasta (hora)"]', '23:59');
  await pag.dispatchEvent('input[aria-label="Hasta (hora)"]', 'change');
  const desdeHora = ahora === '00:00' ? '00:00' : ahora.slice(0, 2) + ':00';
  await pag.fill('input[aria-label="Desde (hora)"]', desdeHora);
  await pag.dispatchEvent('input[aria-label="Desde (hora)"]', 'change');
  await esperarTabla(pag);
  filas = await filasTabla(pag);
  comprobar('desde la hora en punto hasta las 23:59 salen las entradas de ahora',
    filas.length >= 3 && filas.every(f => /Conexión/.test(f[2]) && f[0].slice(-8) >= desdeHora),
    filas.map(f => f[0]).slice(0, 4));
  await pag.screenshot({path: path.join(SALIDA, '60_registro_conexiones_horas.png')});

  /* Excel. */
  const [descarga] = await Promise.all([
    pag.waitForEvent('download'),
    pag.click('text=Descargar Excel')
  ]);
  const xlsx = path.join(SALIDA, '60_registro.xlsx');
  await descarga.saveAs(xlsx);
  let leido = {};
  try {
    leido = JSON.parse(execFileSync('python3', ['-I', '-c', `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
out = {}
for ws in wb.worksheets:
    out[ws.title] = [[c for c in r] for r in ws.iter_rows(values_only=True)]
print(json.dumps(out, default=str))`, xlsx]).toString());
  } catch (e) { leido = {error: String(e.message)}; }
  const hoja = leido.Registro || [];
  comprobar('el Excel se abre y trae las pestañas', !!leido.Registro && !!leido['Por persona'],
    Object.keys(leido));
  comprobar('arriba dice qué filtro se aplicó', /Registro de conexiones/.test(String(hoja[0] && hoja[0][0])) &&
    /tipo: conexiones/.test(String(hoja[1] && hoja[1][0])), hoja.slice(0, 3));
  const cab = hoja[4] || [];
  comprobar('con su cabecera', cab[0] === 'Fecha' && cab.includes('IP') && cab.includes('Lugar'), cab);
  const datosXlsx = hoja.slice(5);
  comprobar('y tantas filas como en pantalla', datosXlsx.length === filas.length, [datosXlsx.length, filas.length]);
  comprobar('con la IP y el lugar del comercial',
    datosXlsx.some(f => f[2] === 'Nando' && f[11] === '88.12.34.56' && /Tres Cantos/.test(f[12])),
    datosXlsx.slice(0, 2));

  /* PDF: el informe se monta en un marco escondido y se manda imprimir. */
  await pag.evaluate(() => { window.__marcos = []; new MutationObserver(m => m.forEach(x =>
    x.addedNodes.forEach(n => { if (n.tagName === 'IFRAME') window.__marcos.push(n); })))
    .observe(document.body, {childList: true}); });
  await pag.click('text=Descargar PDF');
  await pag.waitForTimeout(800);
  const informe = await pag.evaluate(() => {
    const m = window.__marcos.slice(-1)[0];
    const d = m && m.contentDocument;
    return d ? {texto: d.body.innerText, titulo: d.title, filas: d.querySelectorAll('tbody tr').length,
                pagina: (d.querySelector('style') || {}).textContent || ''} : null;
  });
  comprobar('el PDF lleva título, filtro y hora de sacado', informe &&
    /Registro de conexiones y actividad/.test(informe.texto) && /tipo: conexiones/.test(informe.texto) &&
    /Sacado el \d\d\/\d\d\/\d{4}/.test(informe.texto), informe && informe.texto.slice(0, 300));
  comprobar('las mismas filas que en pantalla, en apaisado', informe && informe.filas === filas.length &&
    /A4 landscape/.test(informe.pagina), informe && informe.filas);
  comprobar('con la IP del comercial', informe && /88\.12\.34\.56 · Tres Cantos/.test(informe.texto));
  fs.writeFileSync(path.join(SALIDA, '60_registro_pdf.html'),
    await pag.evaluate(() => window.__marcos.slice(-1)[0].contentDocument.documentElement.outerHTML));

  /* Atajos. */
  await pag.click('text=Últimos 7 días');
  await esperarTabla(pag);
  const desdeDia = await pag.inputValue('input[aria-label="Desde (día)"]');
  comprobar('«Últimos 7 días» pone el rango', desdeDia === await pag.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return d.toLocaleDateString('sv-SE'); }), desdeDia);
  comprobar('sin errores de página en el superadmin', sup.errores.length === 0, sup.errores);
  await sup.ctx.close();

  console.log('\n== En el móvil ==');
  const movil = await entrar(navegador, 'superadmin', {ancho: 400, alto: 860});
  await movil.pag.evaluate(() => { location.hash = '#registro'; });
  await movil.pag.waitForSelector('.registro-fechas');
  await esperarTabla(movil.pag);
  await movil.pag.waitForTimeout(3200);
  const botones = await movil.pag.$$eval('.registro-sacar .btn', bs => bs.map(b => {
    const r = b.getBoundingClientRect();
    return {texto: b.textContent, visible: r.width > 0 && r.right <= window.innerWidth + 1};
  }));
  comprobar('en el móvil se ven los dos botones de descarga', botones.length === 2 && botones.every(b => b.visible),
    botones);
  const desborda = await movil.pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  comprobar('y la página no se sale de ancho', !desborda);
  await movil.pag.screenshot({path: path.join(SALIDA, '60_registro_movil.png'), fullPage: false});
  await movil.pag.evaluate(() => window.scrollTo(0, 700));
  await movil.pag.waitForTimeout(200);
  await movil.pag.screenshot({path: path.join(SALIDA, '60_registro_movil_tabla.png'), fullPage: false});
  comprobar('sin errores de página en el móvil', movil.errores.length === 0, movil.errores);
  await movil.ctx.close();

  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas + ' comprobaciones'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
