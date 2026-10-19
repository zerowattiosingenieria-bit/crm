/**
 * 18_Proyectos.gs — La carpeta de cada cliente y el proyecto que sale de ella.
 *
 * El comercial, desde la ficha del cliente, escribe de qué va el proyecto y
 * sube las fotos de la casa y los PDF que hagan falta (factura de la luz,
 * catastro, lo que sea). En cuanto hay descripción y al menos una foto, el
 * proyecto entra solo en la cola del Centro de Mando y llega un aviso por
 * correo. Cuando allí se monta, el PDF del proyecto vuelve a esta misma
 * pantalla y el comercial lo ve y se lo puede descargar.
 *
 * Quién ve qué: exactamente lo mismo que el resto de la ficha. El comercial
 * ve lo de sus clientes y la dirección lo ve todo.
 */

const CLASES_ARCHIVO = ['foto', 'documento', 'proyecto'];
const TOPE_ARCHIVO_MB = 12;        // lo que aguanta cómodamente una petición
const TOPE_MINIATURA = 24000;      // caracteres de la miniatura guardada en la hoja

/* ---------- la hoja, sin tener que volver a ejecutar instalar() ---------- */

/**
 * Devuelve la pestaña, creándola con sus columnas si todavía no existe.
 * Así una versión nueva del CRM no obliga a parar y ejecutar instalar().
 */
function asegurarHoja_(nombre) {
  const ss = libro_();
  let h = ss.getSheetByName(nombre);
  const cols = ESQUEMA[nombre];
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, cols.length).setValues([cols]);
    h.getRange(1, 1, 1, cols.length)
      .setFontWeight('bold').setBackground('#242422').setFontColor('#B4FA1E');
    h.setFrozenRows(1);
    return h;
  }
  const ancho = Math.max(h.getLastColumn(), 1);
  const actuales = h.getRange(1, 1, 1, ancho).getValues()[0].filter(String);
  const faltan = cols.filter(function (c) { return actuales.indexOf(c) < 0; });
  if (faltan.length) {
    h.getRange(1, actuales.length + 1, 1, faltan.length).setValues([faltan]);
    h.getRange(1, 1, 1, actuales.length + faltan.length)
      .setFontWeight('bold').setBackground('#242422').setFontColor('#B4FA1E');
  }
  return h;
}

function asegurarProyectos_() {
  asegurarHoja_('PROYECTOS');
  asegurarHoja_('ARCHIVOS');
}

/* ---------- las carpetas del Drive ---------- */

function carpetaRaizProyectos_() {
  const id = PROPS.getProperty('ID_CARPETA_PROYECTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  const nombre = 'PROYECTOS · CRM ZERO WATTIOS';
  const busca = DriveApp.getFoldersByName(nombre);
  const carpeta = busca.hasNext() ? busca.next() : DriveApp.createFolder(nombre);
  PROPS.setProperty('ID_CARPETA_PROYECTOS', carpeta.getId());
  return carpeta;
}

/** Una carpeta por cliente, con su id guardado en la ficha del proyecto. */
function carpetaDeProyecto_(proy, cli) {
  if (txt_(proy.carpeta_id)) {
    try { return DriveApp.getFolderById(txt_(proy.carpeta_id)); } catch (e) { /* se recrea */ }
  }
  const nombre = txt_(cli.id) + ' · ' + (txt_(cli.nombre) || 'sin nombre');
  const carpeta = carpetaRaizProyectos_().createFolder(nombre);
  actualizar_('PROYECTOS', proy.id, {carpeta_id: carpeta.getId()});
  proy.carpeta_id = carpeta.getId();
  return carpeta;
}

/* ---------- utilidades ---------- */

function clienteVisible_(u, clienteId) {
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(clienteId); })[0];
  if (!cli) return {error: 'No existe ese cliente.'};
  if (!veCliente_(u, cli)) return {error: 'Ese cliente no es tuyo.'};
  return {cliente: cli};
}

/** La ficha de proyecto del cliente; se crea en blanco la primera vez. */
function proyectoDe_(cli, u) {
  asegurarProyectos_();
  const ya = leer_('PROYECTOS').filter(function (x) {
    return String(x.cliente_id) === String(cli.id); })[0];
  if (ya) return ya;
  return insertar_('PROYECTOS', {cliente_id: cli.id, descripcion: '', estado: 'borrador',
    creado: ahora_(), creado_por: u.id});
}

function archivosDe_(clienteId) {
  return leer_('ARCHIVOS').filter(function (a) {
    return String(a.cliente_id) === String(clienteId); });
}

/**
 * La regla de la cola: con descripción y al menos una foto, el proyecto se
 * pide solo. Nadie tiene que acordarse de pulsar nada.
 */
function revisarCola_(proy, cli, u) {
  if (normal_(proy.estado) !== 'borrador') return proy;
  const fotos = archivosDe_(cli.id).filter(function (a) { return normal_(a.clase) === 'foto'; });
  if (!txt_(proy.descripcion) || !fotos.length) return proy;
  const r = actualizar_('PROYECTOS', proy.id, {estado: 'pedido', pedido: ahora_(), pedido_por: u.id});
  registrar_(u, 'proyecto_pedido', 'PROYECTOS', proy.id, cli.nombre);
  avisarProyectoPedido_(r, cli, u, fotos.length);
  return r;
}

function correoDeAvisos_() {
  const cfg = config_();
  if (txt_(cfg.resumen_a)) return txt_(cfg.resumen_a);
  const jefes = leer_('USUARIOS').filter(function (x) {
    return ['superadmin', 'admin'].indexOf(normal_(x.rol)) >= 0 && txt_(x.email); });
  return jefes.map(function (x) { return txt_(x.email); }).join(',');
}

function avisarProyectoPedido_(proy, cli, u, nFotos) {
  const destino = correoDeAvisos_();
  if (!destino) return;
  const archivos = archivosDe_(cli.id);
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' +
    '<div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:10px">' +
    '<div style="padding:16px 22px;background:#242422;color:#B4FA1E;font-weight:700">' +
    'Proyecto pedido · ' + txt_(cli.nombre) + '</div>' +
    '<div style="padding:18px 22px;color:#17191c;font-size:13.5px;line-height:1.5">' +
    '<p style="margin:0 0 10px"><b>' + txt_(cli.nombre) + '</b><br>' +
    txt_(cli.direccion) + (txt_(cli.municipio) ? ', ' + txt_(cli.municipio) : '') + '</p>' +
    '<p style="margin:0 0 10px">Lo pide ' + txt_(u.nombre) + ' · ' +
    nFotos + ' foto(s) y ' + (archivos.length - nFotos) + ' documento(s).</p>' +
    '<p style="margin:0 0 14px;white-space:pre-wrap;background:#fafbf9;border:1px solid #e3e7e0;' +
    'border-radius:8px;padding:12px">' + txt_(proy.descripcion) + '</p>' +
    '<p style="margin:0"><a href="' + WEB_CRM + '#cliente/' + txt_(cli.id) +
    '" style="color:#17191c;font-weight:600">Abrir la ficha en el CRM</a></p>' +
    '</div>' +
    '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' +
    'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' +
    '</div></div></div>';
  try {
    MailApp.sendEmail({to: destino, subject: 'Proyecto pedido · ' + txt_(cli.nombre),
                       htmlBody: html, name: 'CRM ZERO WATTIOS'});
  } catch (e) { /* si el correo falla, el proyecto se queda pedido igual */ }
}

function avisarProyectoEntregado_(proy, cli) {
  const com = leer_('USUARIOS').filter(function (x) {
    return String(x.id) === String(cli.comercial_id); })[0];
  const destino = com && txt_(com.email) ? txt_(com.email) : correoDeAvisos_();
  if (!destino) return;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' +
    '<div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:10px">' +
    '<div style="padding:16px 22px;background:#242422;color:#B4FA1E;font-weight:700">' +
    'Proyecto listo · ' + txt_(cli.nombre) + '</div>' +
    '<div style="padding:18px 22px;color:#17191c;font-size:13.5px;line-height:1.5">' +
    '<p style="margin:0 0 12px">Ya tienes el proyecto de <b>' + txt_(cli.nombre) +
    '</b> en su ficha del CRM, listo para descargar y enviar.</p>' +
    '<p style="margin:0"><a href="' + WEB_CRM + '#cliente/' + txt_(cli.id) +
    '" style="color:#17191c;font-weight:600">Abrir la ficha</a></p>' +
    '</div></div></div>';
  try {
    MailApp.sendEmail({to: destino, subject: 'Proyecto listo · ' + txt_(cli.nombre),
                       htmlBody: html, name: 'CRM ZERO WATTIOS'});
  } catch (e) { /* igual que arriba: el aviso es un extra */ }
}

function sinDatos_(a) {
  return {id: a.id, cliente_id: a.cliente_id, clase: a.clase, nombre: a.nombre,
          mime: a.mime, bytes: a.bytes, subido: a.subido, subido_por: a.subido_por,
          miniatura: a.miniatura, notas: a.notas};
}

/* ---------- acciones ---------- */

/** Todo lo que hay que pintar en la pestaña Proyecto de un cliente. */
function accProyecto_(u, p) {
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const proy = proyectoDe_(v.cliente, u);
  return {ok: true, proyecto: proy,
          archivos: archivosDe_(v.cliente.id).map(sinDatos_).sort(function (a, b) {
            return txt_(b.subido).localeCompare(txt_(a.subido)); })};
}

/** Guarda la descripción del proyecto (y mira si ya se puede pedir). */
function accGuardarProyecto_(u, p) {
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  let proy = proyectoDe_(v.cliente, u);
  const cambios = {descripcion: txt_(p.descripcion), modificado: ahora_(), modificado_por: u.id};
  if (txt_(p.notas)) cambios.notas = txt_(p.notas);
  proy = actualizar_('PROYECTOS', proy.id, cambios);
  registrar_(u, 'guardar_proyecto', 'PROYECTOS', proy.id, v.cliente.nombre);
  proy = revisarCola_(proy, v.cliente, u);
  return {ok: true, proyecto: proy};
}

/** Sube una foto o un documento a la carpeta del cliente. */
function accSubirArchivo_(u, p) {
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const datos = txt_(p.datos);
  if (!datos) return {ok: false, error: 'No ha llegado el archivo.'};
  if (datos.length > TOPE_ARCHIVO_MB * 1024 * 1024) {
    return {ok: false, error: 'El archivo pasa de ' + TOPE_ARCHIVO_MB + ' MB.'};
  }
  const clase = CLASES_ARCHIVO.indexOf(normal_(p.clase)) >= 0 ? normal_(p.clase) : 'documento';
  if (clase === 'proyecto') return {ok: false, error: 'El proyecto lo sube la dirección.'};

  let proy = proyectoDe_(v.cliente, u);
  const carpeta = carpetaDeProyecto_(proy, v.cliente);
  const nombre = txt_(p.nombre) || ('archivo-' + hoyISO_());
  const mime = txt_(p.mime) || 'application/octet-stream';
  const blob = Utilities.newBlob(Utilities.base64Decode(datos), mime, nombre);
  const archivo = carpeta.createFile(blob);

  const fila = insertar_('ARCHIVOS', {
    cliente_id: v.cliente.id, proyecto_id: proy.id, clase: clase, nombre: nombre,
    archivo_id: archivo.getId(), mime: mime, bytes: archivo.getSize(),
    miniatura: txt_(p.miniatura).slice(0, TOPE_MINIATURA),
    subido_por: u.id, subido: ahora_(), notas: txt_(p.notas)});
  registrar_(u, 'subir_archivo', 'ARCHIVOS', fila.id, v.cliente.nombre + ' · ' + nombre);

  proy = revisarCola_(proy, v.cliente, u);
  return {ok: true, archivo: sinDatos_(fila), proyecto: proy};
}

/** Devuelve el archivo en base64 para verlo o descargarlo. */
function accDescargarArchivo_(u, p) {
  asegurarProyectos_();
  const a = leer_('ARCHIVOS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!a) return {ok: false, error: 'No existe ese archivo.'};
  const v = clienteVisible_(u, a.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  let archivo;
  try { archivo = DriveApp.getFileById(txt_(a.archivo_id)); }
  catch (e) { return {ok: false, error: 'El archivo ya no está en el Drive de la empresa.'}; }
  return {ok: true, nombre: txt_(a.nombre) || archivo.getName(),
          mime: archivo.getMimeType(),
          datos: Utilities.base64Encode(archivo.getBlob().getBytes())};
}

/** Quita un archivo: quien lo subió o la dirección. */
function accBorrarArchivo_(u, p) {
  asegurarProyectos_();
  const a = leer_('ARCHIVOS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!a) return {ok: false, error: 'No existe ese archivo.'};
  const v = clienteVisible_(u, a.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  if (String(a.subido_por) !== String(u.id) && !permisos_(u).editarTodo) {
    return {ok: false, error: 'Ese archivo lo subió otra persona.'};
  }
  if (normal_(a.clase) === 'proyecto' && !permisos_(u).editarTodo) {
    return {ok: false, error: 'El proyecto solo lo quita la dirección.'};
  }
  try { DriveApp.getFileById(txt_(a.archivo_id)).setTrashed(true); } catch (e) {}
  borrar_('ARCHIVOS', a.id);
  registrar_(u, 'borrar_archivo', 'ARCHIVOS', a.id, txt_(a.nombre));
  return {ok: true};
}

/**
 * La vuelta: el Centro de Mando deja aquí el PDF del proyecto y el comercial
 * lo ve en la ficha. Solo dirección.
 */
function accEntregarProyecto_(u, p) {
  exigir_(u, 'editarTodo');
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const datos = txt_(p.datos);
  if (!datos) return {ok: false, error: 'No ha llegado el PDF del proyecto.'};

  let proy = proyectoDe_(v.cliente, u);
  const carpeta = carpetaDeProyecto_(proy, v.cliente);
  const nombre = txt_(p.nombre) || ('Proyecto_' + txt_(v.cliente.id) + '.pdf');
  const mime = txt_(p.mime) || 'application/pdf';
  const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(datos), mime, nombre));

  /* Si ya había un proyecto entregado, el anterior se queda como histórico:
     no se borra nada, solo deja de ser el vigente. */
  const fila = insertar_('ARCHIVOS', {
    cliente_id: v.cliente.id, proyecto_id: proy.id, clase: 'proyecto', nombre: nombre,
    archivo_id: archivo.getId(), mime: mime, bytes: archivo.getSize(),
    subido_por: u.id, subido: ahora_(), notas: txt_(p.notas)});

  proy = actualizar_('PROYECTOS', proy.id, {estado: 'entregado', entregado: ahora_(),
    entregado_por: u.id, archivo_id: fila.id, archivo_nombre: nombre});
  registrar_(u, 'entregar_proyecto', 'PROYECTOS', proy.id, v.cliente.nombre + ' · ' + nombre);
  avisarProyectoEntregado_(proy, v.cliente);
  return {ok: true, proyecto: proy, archivo: sinDatos_(fila)};
}

/** Cambia el estado a mano (por ejemplo, ponerlo «en curso»). Solo dirección. */
function accEstadoProyecto_(u, p) {
  exigir_(u, 'editarTodo');
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const estados = ['borrador', 'pedido', 'en_curso', 'entregado', 'cancelado'];
  const estado = normal_(p.estado);
  if (estados.indexOf(estado) < 0) return {ok: false, error: 'Ese estado no existe.'};
  const proy = proyectoDe_(v.cliente, u);
  const r = actualizar_('PROYECTOS', proy.id, {estado: estado, modificado: ahora_(),
    modificado_por: u.id});
  registrar_(u, 'estado_proyecto', 'PROYECTOS', proy.id, estado);
  return {ok: true, proyecto: r};
}

/** La cola para el Centro de Mando: lo que está pedido y sin entregar. */
function accProyectosPendientes_(u, p) {
  exigir_(u, 'editarTodo');
  asegurarProyectos_();
  const clientes = {};
  leer_('CLIENTES').forEach(function (c) { clientes[String(c.id)] = c; });
  const usuarios = {};
  leer_('USUARIOS').forEach(function (x) { usuarios[String(x.id)] = txt_(x.nombre); });
  const archivos = leer_('ARCHIVOS');
  const quiero = txt_(p.estado) ? [normal_(p.estado)] : ['pedido', 'en_curso'];
  const lista = leer_('PROYECTOS').filter(function (x) {
    return quiero.indexOf(normal_(x.estado)) >= 0;
  }).map(function (x) {
    const c = clientes[String(x.cliente_id)] || {};
    const suyos = archivos.filter(function (a) { return String(a.cliente_id) === String(x.cliente_id); });
    return {id: x.id, cliente_id: x.cliente_id, cliente: txt_(c.nombre),
            direccion: txt_(c.direccion), municipio: txt_(c.municipio),
            telefono: txt_(c.telefono), email: txt_(c.email),
            comercial: usuarios[String(c.comercial_id)] || '',
            descripcion: txt_(x.descripcion), estado: txt_(x.estado), pedido: txt_(x.pedido),
            fotos: suyos.filter(function (a) { return normal_(a.clase) === 'foto'; }).length,
            documentos: suyos.filter(function (a) { return normal_(a.clase) === 'documento'; }).length,
            archivos: suyos.filter(function (a) { return normal_(a.clase) !== 'proyecto'; })
                           .map(function (a) { return {id: a.id, clase: a.clase, nombre: a.nombre}; })};
  });
  lista.sort(function (a, b) { return txt_(a.pedido).localeCompare(txt_(b.pedido)); });
  return {ok: true, proyectos: lista};
}
