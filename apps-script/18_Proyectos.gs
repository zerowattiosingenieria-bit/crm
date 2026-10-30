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
 *
 * Excepción: los documentos de clase «direccion» (p. ej. el resumen de los
 * CAE con el dinero de cada cliente) solo los ven, suben, descargan y quitan
 * quienes tienen alcance «todo». Al resto ni siquiera les llega que existen.
 */

const CLASES_ARCHIVO = ['foto', 'documento', 'proyecto', 'direccion', 'factura_luz', 'factura_gas'];

/** ¿Puede este usuario saber que existe este archivo? */
function veArchivo_(u, a) {
  return normal_(a.clase) !== 'direccion' || permisos_(u).alcance === 'todo';
}
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
 *
 * Y lo mismo al revés: si el proyecto estaba parado esperando datos y el
 * comercial acaba de subir o escribir algo, vuelve solo a la cola y se
 * borra la lista de lo que faltaba.
 */
function revisarCola_(proy, cli, u) {
  const estado = normal_(proy.estado);
  if (estado !== 'borrador' && estado !== 'faltan_datos') return proy;
  const fotos = archivosDe_(cli.id).filter(function (a) { return normal_(a.clase) === 'foto'; });
  if (!txt_(proy.descripcion) || !fotos.length) return proy;
  const r = actualizar_('PROYECTOS', proy.id, {estado: 'pedido', faltan: '',
    pedido: ahora_(), pedido_por: u.id});
  registrar_(u, estado === 'faltan_datos' ? 'proyecto_completado' : 'proyecto_pedido',
    'PROYECTOS', proy.id, cli.nombre);
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
          archivos: archivosDe_(v.cliente.id).filter(function (a) { return veArchivo_(u, a); })
            .map(sinDatos_).sort(function (a, b) {
            return txt_(b.subido).localeCompare(txt_(a.subido)); }),
          historial: historialProyecto_(u, proy, v.cliente)};
}

/* Control de versiones del proyecto (30/10/2026): qué se ha cambiado, cuándo
   y quién, sacado del registro. Las versiones del PDF son los archivos de
   clase «proyecto», que ya llegan todos en «archivos». */
const ACCIONES_PROYECTO = {
  guardar_proyecto: 'Descripción o ficha actualizada',
  entregar_proyecto: 'Nueva versión del proyecto (PDF)',
  estado_proyecto: 'Cambio de estado',
  proyecto_enviado: 'Enviado al cliente',
  proyecto_no_enviado: 'Envío deshecho',
  subir_archivo: 'Archivo subido'
};
function historialProyecto_(u, proy, cli) {
  try {
    const suyos = {};
    archivosDe_(cli.id).forEach(function (a) { if (veArchivo_(u, a)) suyos[String(a.id)] = true; });
    const nombres = {};
    leer_('USUARIOS').forEach(function (x) { nombres[String(x.id)] = txt_(x.nombre); });
    return leer_('LOG').filter(function (l) {
      const acc = txt_(l.accion);
      if (!ACCIONES_PROYECTO[acc]) return false;
      if (acc === 'subir_archivo') return !!suyos[String(l.entidad_id)];
      return String(l.entidad_id) === String(proy.id);
    }).map(function (l) {
      const acc = txt_(l.accion);
      const sinDetalle = acc === 'guardar_proyecto' || acc === 'proyecto_enviado' || acc === 'proyecto_no_enviado';
      return {fecha: txt_(l.fecha), quien: nombres[String(l.usuario_id)] || txt_(l.usuario),
              que: ACCIONES_PROYECTO[acc],
              detalle: sinDetalle ? '' : (acc === 'entregar_proyecto' ? txt_(l.detalle).split(' · ').pop() : txt_(l.detalle)).slice(0, 160)};
    }).sort(function (a, b) { return b.fecha.localeCompare(a.fecha); }).slice(0, 150);
  } catch (e) { return []; }
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
  if (clase === 'direccion' && permisos_(u).alcance !== 'todo') {
    return {ok: false, error: 'Los documentos de dirección solo los sube la dirección.'};
  }

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
  if (!a || !veArchivo_(u, a)) return {ok: false, error: 'No existe ese archivo.'};
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
  if (!a || !veArchivo_(u, a)) return {ok: false, error: 'No existe ese archivo.'};
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

/**
 * Cambia el estado a mano (ponerlo «en curso», o pararlo porque faltan
 * datos). Solo dirección, que es quien monta los proyectos.
 *
 * Con estado "faltan_datos" se manda además «faltan»: la lista corta de lo
 * que hace falta para poder sacarlo (una frase por cosa, o un array). Eso
 * es justo lo que ve el comercial en su panel y en la ficha del cliente.
 */
function accEstadoProyecto_(u, p) {
  exigir_(u, 'editarTodo');
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const estados = ['borrador', 'pedido', 'en_curso', 'faltan_datos', 'entregado', 'enviado', 'cancelado'];
  const estado = normal_(p.estado);
  if (estados.indexOf(estado) < 0) return {ok: false, error: 'Ese estado no existe.'};

  const faltan = (Array.isArray(p.faltan) ? p.faltan : [p.faltan])
    .map(function (x) { return txt_(x); }).filter(function (x) { return x; }).join(' · ');
  if (estado === 'faltan_datos' && !faltan) {
    return {ok: false, error: 'Di qué falta para poder sacar el proyecto.'};
  }

  const proy = proyectoDe_(v.cliente, u);
  const r = actualizar_('PROYECTOS', proy.id, {estado: estado,
    faltan: estado === 'faltan_datos' ? faltan.slice(0, 500) : '',
    modificado: ahora_(), modificado_por: u.id});
  registrar_(u, 'estado_proyecto', 'PROYECTOS', proy.id, estado + (faltan ? ': ' + faltan : ''));
  if (estado === 'faltan_datos') avisarFaltanDatos_(r, v.cliente, faltan);
  return {ok: true, proyecto: r};
}

/**
 * «Enviado al cliente»: el comercial dice que ya le ha mandado el proyecto.
 * Esto NO manda nada a nadie; solo deja constancia de cuándo y quién, y el
 * proyecto sale de «listos para enviar». Lo puede marcar el comercial del
 * cliente y la dirección; nadie más (ni captadores ni otros comerciales).
 *
 * Con deshacer: true, la dirección lo devuelve a «entregado» (por si se
 * pulsó sin querer). El comercial no deshace: que lo pida.
 *
 * Y la regla de la casa: a la semana de mandar una propuesta, se llama.
 * Se apunta un seguimiento con ese próximo paso a 7 días, salvo que el
 * cliente ya tenga uno pendiente antes (de hoy a 7 días): ese se respeta.
 */
function accEnviadoProyecto_(u, p) {
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const cli = v.cliente;
  const per = permisos_(u);
  const suyo = String(cli.comercial_id) === String(u.id);
  if (!per.editarTodo && !(u.rol === 'comercial' && suyo)) {
    return {ok: false, error: 'Solo el comercial del cliente o la dirección pueden marcarlo.'};
  }
  const proy = proyectoDe_(cli, u);
  const estado = normal_(proy.estado);

  if (p.deshacer) {
    if (!per.editarTodo) return {ok: false, error: 'Deshacerlo solo puede la dirección.'};
    if (estado !== 'enviado') return {ok: false, error: 'Ese proyecto no está marcado como enviado.'};
    const r = actualizar_('PROYECTOS', proy.id, {estado: 'entregado', enviado: '', enviado_por: '',
      modificado: ahora_(), modificado_por: u.id});
    registrar_(u, 'proyecto_no_enviado', 'PROYECTOS', proy.id, etiquetaCliente_(cli));
    return {ok: true, proyecto: r};
  }

  if (estado === 'enviado') return {ok: true, proyecto: proy, ya: true};
  if (estado !== 'entregado') {
    return {ok: false, error: 'El proyecto todavía no está hecho: no se puede marcar como enviado.'};
  }
  const r = actualizar_('PROYECTOS', proy.id, {estado: 'enviado', enviado: ahora_(), enviado_por: u.id,
    modificado: ahora_(), modificado_por: u.id});
  registrar_(u, 'proyecto_enviado', 'PROYECTOS', proy.id, etiquetaCliente_(cli));

  /* El recordatorio de llamar a la semana. */
  let llamada = '', yaTenia = '';
  try {
    const dentro7 = sumarDias_(hoyISO_(), 7);
    const hay = txt_(cli.proxima_fecha).slice(0, 10);
    const antes = hay && hay >= hoyISO_() && hay <= dentro7;
    if (!antes) {
      insertar_('SEGUIMIENTO', {cliente_id: cli.id, operacion_id: '', usuario_id: u.id,
        fecha: hoyISO_(), canal: 'email', nota: 'Proyecto enviado al cliente (marcado en el CRM).',
        proximo_paso: 'Llamar: seguimiento de la propuesta', proxima_fecha: dentro7,
        estado_resultante: '', origen: 'proyecto_enviado', creado: ahora_()});
      actualizar_('CLIENTES', cli.id, {proxima_accion: 'Llamar: seguimiento de la propuesta',
        proxima_fecha: dentro7, modificado: ahora_(), modificado_por: u.id});
      llamada = dentro7;
    } else {
      yaTenia = hay;
    }
  } catch (e) { /* el recordatorio es un extra: el enviado queda igual */ }
  return {ok: true, proyecto: r, llamada: llamada, proximo_ya: yaTenia};
}

/* Los clientes se nombran siempre «dirección · nombre». */
function etiquetaCliente_(cli) {
  return [txt_(cli.direccion), txt_(cli.nombre)].filter(String).join(' · ') || txt_(cli.id);
}

/** Aviso por correo al comercial del cliente cuando el proyecto se para. */
function avisarFaltanDatos_(proy, cli, faltan) {
  const usuarios = indexar_(leer_('USUARIOS'));
  const comercial = usuarios[String(cli.comercial_id)] || {};
  const destino = [txt_(comercial.email), correoDeAvisos_()].filter(String).join(',');
  if (!destino) return;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' +
    '<div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:10px">' +
    '<div style="padding:16px 22px;background:#242422;color:#B4FA1E;font-weight:700">' +
    'Falta algo para sacar el proyecto · ' + txt_(cli.nombre) + '</div>' +
    '<div style="padding:18px 22px;color:#17191c;font-size:13.5px;line-height:1.5">' +
    '<p style="margin:0 0 10px"><b>' + txt_(cli.nombre) + '</b><br>' +
    txt_(cli.direccion) + (txt_(cli.municipio) ? ', ' + txt_(cli.municipio) : '') + '</p>' +
    '<p style="margin:0 0 6px"><b>Qué falta:</b></p><ul style="margin:0 0 12px;padding-left:18px">' +
    faltan.split(' · ').map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
    '<p style="margin:0">En cuanto lo subas a la pestaña Proyecto del cliente, vuelve solo a la cola.</p>' +
    '</div></div></div>';
  try {
    MailApp.sendEmail({to: destino, subject: 'Proyecto parado: falta algo · ' + txt_(cli.nombre),
                       htmlBody: html});
  } catch (e) { /* si el correo falla, el panel lo sigue enseñando igual */ }
}

/** La cola para el Centro de Mando: lo que está pedido y sin entregar. */
/**
 * La cola de proyectos. La dirección la ve entera; un comercial, solo la de
 * sus clientes; los captadores no la ven. Sin estado, devuelve los pedidos y
 * los que están en preparación; con estado "entregado", los que ya tienen el
 * PDF y están listos para enviar al cliente; con "faltan_datos", los que
 * están parados esperando algo del comercial.
 */
function accProyectosPendientes_(u, p) {
  const per = permisos_(u);
  /* El captador también ve los proyectos ya enviados de los clientes que
     ha captado, para poder descargarlos (orden de Nando, 30/10/2026). */
  const esCaptador = per.alcance === 'captador';
  if (per.alcance !== 'todo' && u.rol !== 'comercial' && !esCaptador) {
    return {ok: true, proyectos: []};
  }
  asegurarProyectos_();
  const clientes = {};
  leer_('CLIENTES').forEach(function (c) { clientes[String(c.id)] = c; });
  const usuarios = {};
  leer_('USUARIOS').forEach(function (x) { usuarios[String(x.id)] = txt_(x.nombre); });
  const archivos = leer_('ARCHIVOS');
  const quiero = esCaptador ? ['enviado']
    : (txt_(p.estado) ? [normal_(p.estado)] : ['pedido', 'en_curso']);
  /* Con «dias», solo los enviados en esos últimos días (lo que mira la
     dirección para ver quién ha mandado qué). */
  const desdeEnvio = num_(p.dias) > 0 ? sumarDias_(hoyISO_(), -num_(p.dias)) : '';
  const lista = leer_('PROYECTOS').filter(function (x) {
    if (quiero.indexOf(normal_(x.estado)) < 0) return false;
    if (desdeEnvio && txt_(x.enviado).slice(0, 10) < desdeEnvio) return false;
    const c = clientes[String(x.cliente_id)];
    if (!c) return false;
    if (per.alcance === 'todo') return true;
    return esCaptador ? String(c.captador_id) === String(u.id) : String(c.comercial_id) === String(u.id);
  }).map(function (x) {
    const c = clientes[String(x.cliente_id)] || {};
    const pdf = archivos.filter(function (a) {
      return String(a.cliente_id) === String(x.cliente_id) && normal_(a.clase) === 'proyecto';
    }).sort(function (a, b) { return txt_(b.subido).localeCompare(txt_(a.subido)); })[0];
    const suyos = archivos.filter(function (a) {
      return String(a.cliente_id) === String(x.cliente_id) && veArchivo_(u, a); });
    return {id: x.id, cliente_id: x.cliente_id, cliente: txt_(c.nombre),
            direccion: txt_(c.direccion), municipio: txt_(c.municipio),
            telefono: txt_(c.telefono), email: txt_(c.email),
            comercial: usuarios[String(c.comercial_id)] || '',
            descripcion: txt_(x.descripcion), estado: txt_(x.estado), pedido: txt_(x.pedido),
            entregado: txt_(x.entregado), faltan: txt_(x.faltan),
            enviado: txt_(x.enviado), enviado_por: usuarios[String(x.enviado_por)] || '',
            modificado: txt_(x.modificado) || txt_(x.pedido) || txt_(x.creado),
            archivo_id: pdf ? pdf.id : '', archivo_nombre: pdf ? txt_(pdf.nombre) : '',
            fotos: suyos.filter(function (a) { return normal_(a.clase) === 'foto'; }).length,
            documentos: suyos.filter(function (a) { return normal_(a.clase) === 'documento'; }).length,
            facturas_luz: suyos.filter(function (a) { return normal_(a.clase) === 'factura_luz'; }).length,
            facturas_gas: suyos.filter(function (a) { return normal_(a.clase) === 'factura_gas'; }).length,
            archivos: suyos.filter(function (a) { return normal_(a.clase) !== 'proyecto'; })
                           .map(function (a) { return {id: a.id, clase: a.clase, nombre: a.nombre}; })};
  });
  /* Los listos para enviar, el más reciente primero; la cola, el más viejo. */
  lista.sort(function (a, b) {
    if (normal_(a.estado) === 'enviado') return txt_(b.enviado).localeCompare(txt_(a.enviado));
    return normal_(a.estado) === 'entregado'
      ? txt_(b.entregado).localeCompare(txt_(a.entregado))
      : txt_(a.pedido).localeCompare(txt_(b.pedido));
  });
  return {ok: true, proyectos: lista};
}
