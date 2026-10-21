/* Servidor de pruebas: sirve el CRM y emula la aplicación web de Apps
   Script contra el backend simulado, para poder probarlo todo en local. */
require('./mock.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'};

/* Datos de arranque */
instalar();
cargarDemo();

/* El puesto de cada uno y unas cuantas cifras y tareas de muestra, para
   poder ver «Mi tablero» con contenido sin tener que meterlo a mano. */
ponerPuestos();
(() => {
  const dir = leer_('USUARIOS').filter(x => x.rol === 'superadmin')[0];
  const nando = leer_('USUARIOS').filter(x => normal_(x.nombre) === 'nando')[0] ||
                leer_('USUARIOS').filter(x => x.rol === 'comercial')[0];
  const crm = cifrasDelCrm_();
  accGuardarCifras_(dir, {cifras: [
    {clave: 'cobrado', valor: crm.cobrado + 43754.96, meta: 1000000, fecha: hoyISO_(),
     nota: 'Extracto de banco'},
    {clave: 'firmado', valor: crm.firmado, meta: 0},
    {clave: 'operaciones', valor: crm.operaciones + 4, meta: 50},
    {clave: 'clientes_vendidos', valor: crm.clientes_vendidos},
    {clave: 'facturado_mes', valor: crm.facturado_mes + 17890},
    {clave: 'facturas_mes', valor: crm.facturas_mes + 1},
    {clave: 'pendiente_cobro', valor: crm.pendiente_cobro},
    {clave: 'en_cierre', valor: 363741, meta: 0},
    {clave: 'en_cierre_n', valor: 10},
    {clave: 'vendido_pendiente_cobro', valor: 58157}
  ]});
  accGuardarTarea_(dir, {tarea: {titulo: 'Pasar la FZW2026-151 a 01 INGRESOS',
    detalle: 'Está emitida con fecha 15/10 pero guardada en la carpeta que no toca.',
    area: 'contabilidad', vence: sumarDias_(hoyISO_(), -1), prioridad: 'alta',
    origen: 'panel', origen_id: 'demo-1'}});
  accGuardarTarea_(dir, {tarea: {titulo: 'Conciliar los cobros de CaixaBank de la semana',
    area: 'contabilidad', vence: hoyISO_(), origen: 'panel', origen_id: 'demo-2'}});
  accGuardarTarea_(dir, {tarea: {titulo: 'Aprobar el precio de Olivo 605',
    detalle: 'Aerotermia + FV + fancoils. Importe aproximado.',
    area: 'direccion', importe: 39000, vence: hoyISO_(), prioridad: 'urgente',
    origen: 'panel', origen_id: 'demo-3'}});
  accGuardarTarea_(dir, {tarea: {titulo: 'Decidir si Borni 20 se registra ya como venta',
    area: 'direccion', importe: 26890, vence: sumarDias_(hoyISO_(), 3),
    origen: 'panel', origen_id: 'demo-4'}});
  if (nando) accGuardarTarea_(dir, {tarea: {titulo: 'Mandar el presupuesto actualizado de Olivo 605',
    usuario_id: nando.id, vence: hoyISO_(), prioridad: 'alta',
    origen: 'panel', origen_id: 'demo-5'}});

  /* Dos proyectos para ver las tarjetas del panel: uno parado esperando
     datos y otro ya hecho, listo para mandárselo al cliente. */
  const suyos = nando ? leer_('CLIENTES')
    .filter(c => String(c.comercial_id) === String(nando.id)) : [];
  if (suyos[0]) {
    accGuardarProyecto_(nando, {cliente_id: suyos[0].id,
      descripcion: 'Chalet de 190 m², cuatro personas, gasóleo y radiadores. Quiere aerotermia y FV.'});
    accEstadoProyecto_(dir, {cliente_id: suyos[0].id, estado: 'faltan_datos',
      faltan: ['Foto del cuadro eléctrico más clara', 'Factura de la luz del último año']});
  }
  if (suyos[1]) {
    accGuardarProyecto_(nando, {cliente_id: suyos[1].id,
      descripcion: 'Vivienda de 140 m² con radiadores de gas natural y cubierta a dos aguas.'});
    accEntregarProyecto_(dir, {cliente_id: suyos[1].id, mime: 'application/pdf',
      nombre: 'Presupuesto_' + String(suyos[1].nombre).replace(/\s+/g, '') + '_ZeroWattios.pdf',
      datos: Utilities.base64Encode([37, 80, 68, 70])});
  }
})();
const CLAVES = {};
(() => {
  const h = SpreadsheetApp.openById().getSheetByName('CLAVES_INICIALES');
  h.getRange(2, 1, h.getLastRow() - 1, 4).getValues().forEach(f => { CLAVES[f[1]] = f[3]; });
})();
fs.writeFileSync(path.join(__dirname, 'claves.json'), JSON.stringify(CLAVES, null, 2));

const servidor = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/exec')) {
    let cuerpo = '';
    req.on('data', c => cuerpo += c);
    req.on('end', () => {
      let salida;
      try { salida = despachar_(JSON.parse(cuerpo || '{}')); }
      catch (e) { salida = {ok: false, error: String(e && e.message || e)}; }
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify(salida));
    });
    return;
  }
  /* Solo en pruebas: el último correo enviado, para poder leer el código
     de verificación desde el navegador de prueba. En producción esto no
     existe, porque el correo lo manda Google de verdad. */
  if (req.url.startsWith('/ultimo-correo')) {
    const c = correosEnviados().slice(-1)[0] || {};
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'});
    return res.end(JSON.stringify({to: c.to || '', subject: c.subject || ''}));
  }

  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.join(RAIZ, ruta);
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404); return res.end('no está');
  }
  res.writeHead(200, {'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream'});
  res.end(fs.readFileSync(archivo));
});

const PUERTO = Number(process.env.PUERTO || 8765);
servidor.listen(PUERTO, () => console.log('CRM de pruebas en http://localhost:' + PUERTO));
