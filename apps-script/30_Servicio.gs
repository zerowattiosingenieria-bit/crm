/**
 * 30_Servicio.gs — El proyecto de Apps Script como «servicio de Google»
 * para el CRM que vive en crm.zerowattios.com (MySQL + PHP).
 *
 * Desde el 02/11/2026 la base de datos del CRM está en IONOS. Este proyecto
 * se queda para lo que solo puede hacer Google:
 *   - Drive: fotos, facturas, DNIs, proyectos y nóminas siguen en el Drive
 *     de la empresa, en las mismas carpetas de siempre.
 *   - Correo: códigos de entrada, avisos y resúmenes salen de esta cuenta.
 *   - Mapas: geocodificar direcciones y tiempos en coche.
 *   - El espejo: cada hora vuelca TODAS las tablas del CRM a esta hoja de
 *     cálculo, y la copia de los viernes sigue dejando el Excel en Drive.
 *
 * Las peticiones llegan por doPost con {accion:'servicio', servicio:'...',
 * llave:'...'} y solo se atienden si la llave coincide con la propiedad
 * SERVICIO_LLAVE del script. Sin llave, nada.
 */

/* Propiedades del script que usa esta parte:
     SERVICIO_LLAVE  la llave compartida con el servidor PHP
     CRM_URL         https://crm.zerowattios.com/api/ (para el espejo y los avisos)
     CRM_LLAVE       llave con la que este script llama al servidor PHP */

function esPeticionDeServicio_(p) {
  return p && txt_(p.accion) === 'servicio';
}

function atenderServicio_(p) {
  const llave = PROPS.getProperty('SERVICIO_LLAVE');
  if (!llave || !igualSecreto_(txt_(p.llave), llave)) return {ok: false, error: 'Llave de servicio incorrecta.'};
  const s = txt_(p.servicio);
  const fn = SERVICIOS_[s];
  if (!fn) return {ok: false, error: 'Servicio desconocido: ' + s};
  try { return Object.assign({ok: true}, fn(p) || {}); }
  catch (e) { return {ok: false, error: String(e && e.message ? e.message : e)}; }
}

const SERVICIOS_ = {

  ping: function () { return {version: VERSION, servidor: ahora_()}; },

  /* ---------- Drive ---------- */

  driveCarpeta: function (p) {
    const nombre = txt_(p.nombre);
    const padre = txt_(p.padre) ? DriveApp.getFolderById(txt_(p.padre)) : null;
    const it = padre ? padre.getFoldersByName(nombre) : DriveApp.getFoldersByName(nombre);
    while (it.hasNext()) { const c = it.next(); if (!c.isTrashed()) return {id: c.getId(), nombre: c.getName(), creada: false}; }
    if (p.crear === false || txt_(p.crear) === 'false') return {id: '', nombre: nombre, creada: false};
    const c = padre ? padre.createFolder(nombre) : DriveApp.createFolder(nombre);
    return {id: c.getId(), nombre: c.getName(), creada: true};
  },

  driveCrearCarpeta: function (p) {
    const padre = txt_(p.padre) ? DriveApp.getFolderById(txt_(p.padre)) : DriveApp.getRootFolder();
    const c = padre.createFolder(txt_(p.nombre));
    return {id: c.getId(), nombre: c.getName()};
  },

  driveInfo: function (p) {
    const id = txt_(p.id);
    try {
      const c = DriveApp.getFolderById(id);
      return {existe: !c.isTrashed(), carpeta: true, nombre: c.getName(), url: c.getUrl(),
              creado: fechaHoja_(c.getDateCreated())};
    } catch (e) { /* no es carpeta */ }
    try {
      const f = DriveApp.getFileById(id);
      return {existe: !f.isTrashed(), carpeta: false, nombre: f.getName(), mime: f.getMimeType(),
              bytes: f.getSize(), url: f.getUrl(), creado: fechaHoja_(f.getDateCreated())};
    } catch (e) { return {existe: false, carpeta: false}; }
  },

  driveSubir: function (p) {
    const carpeta = txt_(p.carpeta) ? DriveApp.getFolderById(txt_(p.carpeta)) : DriveApp.getRootFolder();
    const mime = txt_(p.mime) || 'application/octet-stream';
    const blob = Utilities.newBlob(Utilities.base64Decode(txt_(p.base64)), mime, txt_(p.nombre) || 'archivo');
    const f = carpeta.createFile(blob);
    return {id: f.getId(), nombre: f.getName(), mime: f.getMimeType(), bytes: f.getSize(), url: f.getUrl()};
  },

  driveDescargar: function (p) {
    const f = DriveApp.getFileById(txt_(p.id));
    if (f.isTrashed()) throw new Error('El archivo está en la papelera.');
    return {nombre: f.getName(), mime: f.getMimeType(), bytes: f.getSize(),
            base64: Utilities.base64Encode(f.getBlob().getBytes())};
  },

  driveBorrar: function (p) {
    try { DriveApp.getFileById(txt_(p.id)).setTrashed(true); return {borrado: true}; }
    catch (e) { try { DriveApp.getFolderById(txt_(p.id)).setTrashed(true); return {borrado: true}; } catch (e2) { return {borrado: false}; } }
  },

  driveListar: function (p) {
    const c = DriveApp.getFolderById(txt_(p.carpeta));
    const it = c.getFiles();
    const lista = [];
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed()) continue;
      lista.push({id: f.getId(), nombre: f.getName(), mime: f.getMimeType(), bytes: f.getSize(),
                  creado: fechaHoja_(f.getDateCreated()), url: f.getUrl()});
    }
    return {archivos: lista};
  },

  driveBuscar: function (p) {
    const it = DriveApp.getFilesByName(txt_(p.nombre));
    const lista = [];
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed()) continue;
      lista.push({id: f.getId(), nombre: f.getName(), mime: f.getMimeType(), bytes: f.getSize(),
                  creado: fechaHoja_(f.getDateCreated()), url: f.getUrl()});
    }
    return {archivos: lista};
  },

  /* ---------- correo ---------- */

  correo: function (p) {
    const m = p.mensaje || {};
    const msg = {to: txt_(m.to), subject: txt_(m.subject)};
    if (!msg.to) throw new Error('Falta el destinatario.');
    if (txt_(m.cc)) msg.cc = txt_(m.cc);
    if (txt_(m.bcc)) msg.bcc = txt_(m.bcc);
    if (txt_(m.name)) msg.name = txt_(m.name);
    if (txt_(m.replyTo)) msg.replyTo = txt_(m.replyTo);
    if (m.htmlBody) msg.htmlBody = String(m.htmlBody);
    msg.body = m.body ? String(m.body) : (m.htmlBody ? String(m.htmlBody).replace(/<[^>]+>/g, ' ') : '');
    if (m.attachments && m.attachments.length) {
      msg.attachments = m.attachments.map(function (a) {
        return Utilities.newBlob(Utilities.base64Decode(txt_(a.base64)), txt_(a.mime) || 'application/octet-stream', txt_(a.nombre) || 'adjunto');
      });
    }
    MailApp.sendEmail(msg);
    return {enviado: true, quedan: MailApp.getRemainingDailyQuota()};
  },

  /* ---------- mapas ---------- */

  geocodificar: function (p) {
    const r = Maps.newGeocoder().setRegion('es').setLanguage('es').geocode(txt_(p.direccion));
    return {resultado: r};
  },

  ruta: function (p) {
    const r = Maps.newDirectionFinder().setOrigin(txt_(p.origen)).setDestination(txt_(p.destino))
      .setMode(Maps.DirectionFinder.Mode.DRIVING).setRegion('es').getDirections();
    return {resultado: r};
  },

  /* ---------- espejo ---------- */

  /* El servidor manda todas las tablas y aquí se escriben en la hoja, tal
     cual, pestaña por pestaña. También se puede lanzar desde aquí con
     espejoDesdeServidor(), que es lo que hace el disparador de cada noche. */
  espejo: function (p) { return escribirEspejo_(p.tablas || {}); }
};

/* ---------- el espejo en la hoja ---------- */

function escribirEspejo_(tablas) {
  const libro = libro_();
  const hecho = {};
  Object.keys(ESQUEMA).forEach(function (t) {
    if (t === 'SESIONES') return;
    const cab = ESQUEMA[t];
    const filas = (tablas[t] || []).map(function (o) {
      return cab.map(function (c) {
        const v = o[c];
        if (v === undefined || v === null) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        /* Nada de lo que escribe la gente puede entrar en la hoja como
           fórmula (=IMPORTXML…): se le pone el apóstrofo delante. */
        if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
        return v;
      });
    });
    let h = libro.getSheetByName(t);
    if (!h) h = libro.insertSheet(t);
    h.clearContents();
    h.getRange(1, 1, 1, cab.length).setValues([cab]);
    if (filas.length) {
      /* Los textos que parecen fórmulas o números con ceros delante se
         guardan como texto para que la hoja no los cambie. */
      h.getRange(2, 1, filas.length, cab.length).setNumberFormat('@').setValues(filas);
    }
    hecho[t] = filas.length;
  });
  PROPS.setProperty('ESPEJO_FECHA', ahora_());
  return {tablas: hecho, fecha: ahora_()};
}

/**
 * Pide al servidor PHP todas las tablas y las escribe en la hoja. Lo lanza
 * el disparador de cada noche (instalarDisparadoresEspejo) y se puede
 * ejecutar a mano desde el editor.
 */
function espejoDesdeServidor() {
  const url = PROPS.getProperty('CRM_URL');
  const llave = PROPS.getProperty('CRM_LLAVE');
  if (!url || !llave) throw new Error('Faltan CRM_URL o CRM_LLAVE en las propiedades del script.');
  const r = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/exportar.php', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({llave: llave})
  });
  if (r.getResponseCode() !== 200) throw new Error('El servidor ha respondido ' + r.getResponseCode());
  const d = JSON.parse(r.getContentText());
  if (!d.ok) throw new Error(d.error || 'El servidor no ha devuelto las tablas.');
  const out = escribirEspejo_(d.tablas || {});
  Logger.log(JSON.stringify(out));
  return out;
}

/**
 * El reloj del servidor: cada 10 minutos avisa a crm.zerowattios.com para
 * que haga sus tareas programadas (resumen de los viernes, copias,
 * recordatorios, sincronizar con GitHub…).
 */
function ticCrm() {
  const url = PROPS.getProperty('CRM_URL');
  const llave = PROPS.getProperty('CRM_LLAVE_CRON');
  if (!url || !llave) return;
  try {
    UrlFetchApp.fetch(url.replace(/\/$/, '') + '/cron', {
      method: 'get', muteHttpExceptions: true, headers: {'X-Cron-Key': llave}});
  } catch (e) { Logger.log('tic: ' + e); }
}

/**
 * Deja los disparadores del CRM en MySQL: el espejo cada hora (orden de
 * Nando, 02/11/2026: si IONOS cae, como mucho se pierde una hora) y el tic
 * cada 10 minutos. Quita los de antes (resumen, copia, puertas,
 * recordatorios), que ahora los hace el servidor: si no, saldría todo doble.
 */
function instalarDisparadoresEspejo() {
  const fuera = ['espejoDesdeServidor', 'ticCrm', 'resumenSemanal', 'copiaSeguridad',
                 'avisoPuertasSemana', 'recordatoriosCRM'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (fuera.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('espejoDesdeServidor').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('ticCrm').timeBased().everyMinutes(10).create();
  return true;
}

/**
 * Deja listas las propiedades del servicio. Ejecutar UNA VEZ desde el editor
 * con la llave que diga el servidor (o déjalo en blanco y se genera una).
 */
function configurarServicio(llaveServicio, urlCrm, llaveCrm, llaveCron) {
  const ls = txt_(llaveServicio) || token_();
  PROPS.setProperty('SERVICIO_LLAVE', ls);
  if (txt_(urlCrm)) PROPS.setProperty('CRM_URL', txt_(urlCrm));
  if (txt_(llaveCrm)) PROPS.setProperty('CRM_LLAVE', txt_(llaveCrm));
  if (txt_(llaveCron)) PROPS.setProperty('CRM_LLAVE_CRON', txt_(llaveCron));
  Logger.log('SERVICIO_LLAVE=' + ls);
  return ls;
}
