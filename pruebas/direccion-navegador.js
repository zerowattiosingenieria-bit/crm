/* Documentos «solo dirección» en la carpeta del cliente: la dirección los
   sube y los ve; el comercial y el captador del cliente no saben que existen. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, {recursive: true});

let fallos = 0, hechas = 0;
function comprobar(nombre, condicion, extra) {
  hechas++;
  if (condicion) console.log('  ok · ' + nombre);
  else { fallos++; console.log('  FALLA · ' + nombre + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

(async () => {
  const navegador = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const errores = [];

  async function entra(usuario) {
    const ctx = await navegador.newContext({viewport: {width: 1440, height: 1100}});
    await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
    const pag = await ctx.newPage();
    pag.on('pageerror', e => errores.push(usuario + ' · ' + e.message));
    await pag.goto(BASE, {waitUntil: 'networkidle'});
    await pag.fill('#usuario', usuario);
    await pag.fill('#clave', CLAVES[usuario]);
    await pag.click('#btn-entrar');
    await Promise.race([
      pag.waitForSelector('.app.visible', {timeout: 15000}),
      pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})
    ]).catch(() => {});
    if (await pag.locator('#paso-codigo').isVisible()) {
      const correo = await (await fetch(BASE + '/ultimo-correo')).json();
      await pag.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || '');
      await pag.click('#btn-entrar');
    }
    await pag.waitForSelector('.app.visible', {timeout: 15000});
    const pedir = (accion, p) => pag.evaluate(async ([a, q]) => {
      const api = await import('/assets/js/api.js');
      try { return await api.pedir(a, q || {}); } catch (e) { return {ok: false, error: e.message}; }
    }, [accion, p]);
    return {ctx, pag, pedir};
  }

  const dir = await entra('fernando');
  const datos = await dir.pedir('datos');
  const clientes = (datos.clientes || []);
  const usuarios = datos.usuarios || [];
  const idNando = (usuarios.find(x => /nando/i.test(x.usuario || x.nombre)) || {}).id;
  const cli = clientes.find(c => String(c.comercial_id) === String(idNando)) || clientes[0];
  comprobar('hay un cliente de prueba', !!cli);

  const pdf = Buffer.from('%PDF-1.4\n%prueba CAE\n').toString('base64');
  const sub = await dir.pedir('subirArchivo', {cliente_id: cli.id, clase: 'direccion',
    nombre: 'CAE_privado.pdf', mime: 'application/pdf', datos: pdf});
  comprobar('la dirección sube un documento solo dirección', sub.ok && sub.archivo.clase === 'direccion', sub);
  const idDoc = sub.archivo && sub.archivo.id;
  const pub = await dir.pedir('subirArchivo', {cliente_id: cli.id, clase: 'documento',
    nombre: 'factura_luz.pdf', mime: 'application/pdf', datos: pdf});

  const vDir = await dir.pedir('proyecto', {cliente_id: cli.id});
  comprobar('la dirección lo ve en la carpeta', (vDir.archivos || []).some(a => a.id === idDoc));
  comprobar('la dirección lo descarga', (await dir.pedir('descargarArchivo', {id: idDoc})).ok);

  await dir.pag.evaluate(id => { location.hash = '#cliente/' + id; }, cli.id);
  await dir.pag.waitForTimeout(1500);
  const pest = dir.pag.locator('text=Proyecto').first();
  if (await pest.count()) { await pest.click().catch(() => {}); await dir.pag.waitForTimeout(1500); }
  const tDir = await dir.pag.textContent('#vista').catch(() => '');
  comprobar('la ficha enseña la tarjeta Solo dirección', /Solo dirección \(1\)/.test(tDir) && tDir.includes('CAE_privado.pdf'), tDir.slice(0, 300));
  await dir.pag.screenshot({path: path.join(SALIDA, 'solo_direccion_fernando.png'), fullPage: true});

  for (const quien of ['nando', 'abraham', 'sandra', 'rober']) {
    const o = await entra(quien);
    const v = await o.pedir('proyecto', {cliente_id: cli.id});
    if (v.ok) {
      comprobar(quien + ': no ve el documento de dirección', !(v.archivos || []).some(a => a.clase === 'direccion'), v.archivos);
      if (quien === 'nando') comprobar(quien + ': sí ve el documento normal', (v.archivos || []).some(a => pub.archivo && a.id === pub.archivo.id));
    } else comprobar(quien + ': no tiene el cliente (tampoco lo ve)', true);
    const d = await o.pedir('descargarArchivo', {id: idDoc});
    comprobar(quien + ': no puede descargarlo', !d.ok, d);
    const b = await o.pedir('borrarArchivo', {id: idDoc});
    comprobar(quien + ': no puede borrarlo', !b.ok, b);
    const s = await o.pedir('subirArchivo', {cliente_id: cli.id, clase: 'direccion',
      nombre: 'x.pdf', mime: 'application/pdf', datos: pdf});
    comprobar(quien + ': no puede subir documentos de dirección', !s.ok, s);
    const pp = await o.pedir('proyectosPendientes', {estado: 'borrador'});
    comprobar(quien + ': tampoco aparece en las listas de proyectos',
      !JSON.stringify(pp).includes('CAE_privado'), pp);
    if (quien === 'nando') {
      await o.pag.evaluate(id => { location.hash = '#cliente/' + id; }, cli.id);
      await o.pag.waitForTimeout(1500);
      const p2 = o.pag.locator('text=Proyecto').first();
      if (await p2.count()) { await p2.click().catch(() => {}); await o.pag.waitForTimeout(1500); }
      const t = await o.pag.textContent('#vista').catch(() => '');
      comprobar('nando: la ficha no enseña nada de dirección', !t.includes('Solo dirección') && !t.includes('CAE_privado'));
      await o.pag.screenshot({path: path.join(SALIDA, 'solo_direccion_nando.png'), fullPage: true});
    }
    await o.ctx.close();
  }
  const ruben = await entra('ruben');
  comprobar('rubén (dirección) también lo ve', ((await ruben.pedir('proyecto', {cliente_id: cli.id})).archivos || []).some(a => a.id === idDoc));
  comprobar('la dirección lo puede quitar', (await dir.pedir('borrarArchivo', {id: idDoc})).ok);

  comprobar('sin errores en la página', errores.length === 0, errores);
  await navegador.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s) de ' + hechas : '\nTodo correcto: ' + hechas + ' comprobaciones');
  process.exit(fallos ? 1 : 0);
})();
