/**
 * 12_Backup.gs — Copia de seguridad semanal.
 *
 * Todos los viernes a las 19:15 se guarda una copia completa de la base
 * de datos en una carpeta del Drive de la empresa, en dos formatos: el
 * Excel de la hoja y un JSON con todas las tablas. Las copias de más de
 * tres meses se borran solas.
 */

const CARPETA_BACKUP = 'BACKUP CRM ZERO WATTIOS';
const MESES_BACKUP = 3;

function carpetaBackup_() {
  const id = PROPS.getProperty('ID_CARPETA_BACKUP');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  const busca = DriveApp.getFoldersByName(CARPETA_BACKUP);
  const carpeta = busca.hasNext() ? busca.next() : DriveApp.createFolder(CARPETA_BACKUP);
  PROPS.setProperty('ID_CARPETA_BACKUP', carpeta.getId());
  return carpeta;
}

/**
 * Hace la copia. La ejecuta el disparador de los viernes, y también se
 * puede lanzar a mano desde el editor o desde el CRM.
 */
function copiaSeguridad() {
  const carpeta = carpetaBackup_();
  const sello = Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd_HH-mm');
  const base = libro_();
  const salida = {fecha: ahora_(), version: VERSION, archivos: []};

  /* 1. El libro entero en Excel, que es lo que abre cualquiera. */
  try {
    const url = 'https://docs.google.com/spreadsheets/d/' + base.getId() + '/export?format=xlsx';
    const respuesta = UrlFetchApp.fetch(url, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true});
    if (respuesta.getResponseCode() === 200) {
      const blob = respuesta.getBlob().setName('CRM_ZERO_WATTIOS_' + sello + '.xlsx');
      const archivo = carpeta.createFile(blob);
      salida.archivos.push({nombre: archivo.getName(), id: archivo.getId(), tipo: 'xlsx'});
    }
  } catch (e) { salida.error_xlsx = String(e); }

  /* 2. Un JSON con todas las tablas, por si algún día hay que mudarse. */
  const volcado = {generado: ahora_(), version: VERSION, tablas: {}};
  Object.keys(ESQUEMA).forEach(function (t) {
    if (t === 'SESIONES') return;                    // las sesiones no se guardan
    try { volcado.tablas[t] = leer_(t); } catch (e) { volcado.tablas[t] = []; }
  });
  const json = carpeta.createFile(
    Utilities.newBlob(JSON.stringify(volcado), 'application/json',
      'CRM_ZERO_WATTIOS_' + sello + '.json'));
  salida.archivos.push({nombre: json.getName(), id: json.getId(), tipo: 'json'});

  /* 3. Fuera lo que pase de tres meses. */
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_BACKUP);
  let borrados = 0;
  const viejos = carpeta.getFiles();
  while (viejos.hasNext()) {
    const f = viejos.next();
    if (f.getDateCreated() < limite) { f.setTrashed(true); borrados++; }
  }
  salida.borrados = borrados;

  registrar_(null, 'copia_seguridad', 'BACKUP', sello,
    salida.archivos.length + ' archivo(s), ' + borrados + ' copia(s) antigua(s) borrada(s)');
  Logger.log(JSON.stringify(salida));
  return salida;
}

/** Deja listo el disparador de los viernes a las 19:15. */
function instalarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'copiaSeguridad') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('copiaSeguridad')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(19).nearMinute(15)
    .create();
  Logger.log('Disparador semanal creado: viernes sobre las 19:15 (zona horaria del proyecto).');
  return true;
}

/** Lo que hay guardado ahora mismo, para verlo desde el CRM. */
function accCopias_(u, p) {
  exigir_(u, 'config');
  const carpeta = carpetaBackup_();
  const lista = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    lista.push({id: f.getId(), nombre: f.getName(), url: f.getUrl(),
      creado: Utilities.formatDate(f.getDateCreated(), zonaHoraria_(), 'yyyy-MM-dd HH:mm'),
      tamano: f.getSize()});
  }
  lista.sort(function (a, b) { return String(b.creado).localeCompare(String(a.creado)); });
  return {ok: true, carpeta: carpeta.getUrl(), copias: lista, meses: MESES_BACKUP};
}

/** Lanza una copia a mano desde el CRM. */
function accCopiaAhora_(u, p) {
  exigir_(u, 'config');
  const r = copiaSeguridad();
  return {ok: true, resultado: r};
}

/**
 * Devuelve la última copia en base64 para que se pueda guardar fuera de
 * Google (por ejemplo, en el ordenador de la oficina).
 */
function accDescargarCopia_(u, p) {
  exigir_(u, 'config');
  const carpeta = carpetaBackup_();
  let mejor = null;
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (txt_(p.id) ? f.getId() === txt_(p.id)
                   : (!mejor || f.getDateCreated() > mejor.getDateCreated())) mejor = f;
  }
  if (!mejor) return {ok: false, error: 'Todavía no hay ninguna copia guardada.'};
  const bytes = mejor.getBlob().getBytes();
  if (bytes.length > 25 * 1024 * 1024) {
    return {ok: false, error: 'La copia pesa demasiado para enviarla por aquí: ' + mejor.getUrl()};
  }
  return {ok: true, nombre: mejor.getName(), tipo: mejor.getMimeType(),
          creado: Utilities.formatDate(mejor.getDateCreated(), zonaHoraria_(), 'yyyy-MM-dd HH:mm'),
          datos: Utilities.base64Encode(bytes)};
}
