/**
 * 01_Base.gs — Acceso a la hoja de cálculo y utilidades comunes.
 *
 * Todas las tablas se leen y escriben por aquí. Nadie toca la hoja
 * directamente: así el día que haya que cambiar de almacén, se cambia
 * en un solo sitio.
 */

const PROPS = PropertiesService.getScriptProperties();

/* ---------- documento ---------- */

function libro_() {
  const id = PROPS.getProperty('ID_BASE');
  if (!id) throw new Error('El CRM no está instalado. Ejecuta instalar() una vez desde el editor.');
  return SpreadsheetApp.openById(id);
}

function hoja_(nombre) {
  const h = libro_().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestaña ' + nombre + '. Vuelve a ejecutar instalar().');
  return h;
}

/* ---------- lectura ---------- */

/** Devuelve la tabla entera como lista de objetos {columna: valor}. */
function leer_(nombre) {
  const h = hoja_(nombre);
  const n = h.getLastRow();
  if (n < 2) return [];
  const ancho = h.getLastColumn();
  const datos = h.getRange(1, 1, n, ancho).getDisplayValues();
  const crudos = h.getRange(1, 1, n, ancho).getValues();
  const cab = datos[0];
  const fuera = [];
  for (let i = 1; i < datos.length; i++) {
    const o = {_fila: i + 1};
    for (let c = 0; c < cab.length; c++) {
      if (!cab[c]) continue;
      const v = crudos[i][c];
      o[cab[c]] = (v instanceof Date) ? Utilities.formatDate(v, zonaHoraria_(), 'yyyy-MM-dd') : v;
    }
    let vacia = true;
    for (let c = 0; c < cab.length; c++) { if (cab[c] && String(crudos[i][c]).length) { vacia = false; break; } }
    if (!vacia) fuera.push(o);
  }
  return fuera;
}

/** Lee una tabla y la devuelve indexada por id. */
function indexar_(lista, campo) {
  const m = {};
  (lista || []).forEach(function (x) { m[String(x[campo || 'id'])] = x; });
  return m;
}

function cabeceras_(nombre) {
  const h = hoja_(nombre);
  return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].filter(String);
}

/* ---------- escritura ---------- */

/** Añade una fila a partir de un objeto. Devuelve el objeto con su id. */
function insertar_(nombre, obj) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  if (cab.indexOf('id') >= 0 && !obj.id) obj.id = nuevoId_(nombre);
  const fila = cab.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : obj[c]; });
  h.appendRow(fila);
  return obj;
}

/** Actualiza por id solo los campos que vengan en el objeto. */
function actualizar_(nombre, id, cambios) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  const col = cab.indexOf('id') + 1;
  if (!col) throw new Error('La tabla ' + nombre + ' no tiene columna id.');
  const n = h.getLastRow();
  if (n < 2) return null;
  const ids = h.getRange(2, col, n - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      const fila = i + 2;
      const actual = h.getRange(fila, 1, 1, cab.length).getValues()[0];
      cab.forEach(function (c, j) {
        if (Object.prototype.hasOwnProperty.call(cambios, c)) actual[j] = cambios[c];
      });
      h.getRange(fila, 1, 1, cab.length).setValues([actual]);
      const o = {};
      cab.forEach(function (c, j) { o[c] = actual[j]; });
      return o;
    }
  }
  return null;
}

function borrar_(nombre, id) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  const col = cab.indexOf('id') + 1;
  const n = h.getLastRow();
  if (n < 2) return false;
  const ids = h.getRange(2, col, n - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { h.deleteRow(i + 2); return true; }
  }
  return false;
}

/* Escribe muchas filas de golpe. Para el volcado inicial y los procesos. */
function insertarLote_(nombre, objetos) {
  if (!objetos || !objetos.length) return 0;
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  const filas = objetos.map(function (obj) {
    if (cab.indexOf('id') >= 0 && !obj.id) obj.id = nuevoId_(nombre);
    return cab.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : obj[c]; });
  });
  h.getRange(h.getLastRow() + 1, 1, filas.length, cab.length).setValues(filas);
  return filas.length;
}

/* ---------- identificadores ---------- */

const PREFIJO = {
  USUARIOS:'U', CLIENTES:'C', OPERACIONES:'OP', COBROS:'CO', FACTURAS:'F',
  GASTOS:'G', SEGUIMIENTO:'S', CAPTACIONES:'CA', PARTES:'P', NOMINAS:'N', JORNADAS:'J'
};

/** Identificador corto, legible y único: C-000412. */
function nuevoId_(nombre) {
  const clave = 'SEQ_' + nombre;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const n = Number(PROPS.getProperty(clave) || 0) + 1;
    PROPS.setProperty(clave, String(n));
    return (PREFIJO[nombre] || 'X') + '-' + String(n).padStart(6, '0');
  } finally { lock.releaseLock(); }
}

/* ---------- fechas y números ---------- */

function zonaHoraria_() { return 'Europe/Madrid'; }

function hoyISO_() { return Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd'); }

function ahora_() { return Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss'); }

function mesDe_(iso) { return String(iso || '').slice(0, 7); }

function fecha_(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function diasEntre_(isoA, isoB) {
  const a = fecha_(isoA), b = fecha_(isoB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function sumarDias_(iso, dias) {
  const d = fecha_(iso);
  if (!d) return '';
  d.setDate(d.getDate() + Number(dias || 0));
  return Utilities.formatDate(d, zonaHoraria_(), 'yyyy-MM-dd');
}

/** Convierte a número lo que venga: "12.345,67 €" -> 12345.67 */
function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '').trim();
  if (!s) return 0;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.')
                                                : s.replace(/,/g, '');
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function txt_(v) { return String(v == null ? '' : v).trim(); }

function normal_(v) {
  return txt_(v).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function redondear_(n, d) {
  const f = Math.pow(10, d === undefined ? 2 : d);
  return Math.round(Number(n || 0) * f) / f;
}

function pct_(parte, total) {
  const t = Number(total || 0);
  return t ? redondear_(Number(parte || 0) * 100 / t, 1) : 0;
}

/* ---------- claves y sesiones ---------- */

const ALFABETO = 'abcdefghijkmnopqrstuvwxyz23456789ACDEFGHJKLMNPQRSTUVWXYZ';

/** Clave de 10 caracteres, números y letras, sin los que se confunden. */
function claveAleatoria_(largo) {
  const n = largo || LARGO_CLAVE;
  let s = '';
  const bytes = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < n; i++) {
    const r = Math.floor(Math.random() * ALFABETO.length + parseInt(bytes.charAt(i), 16)) % ALFABETO.length;
    s += ALFABETO.charAt(r);
  }
  /* Garantiza al menos un número y una letra. */
  if (!/\d/.test(s)) s = '2' + s.slice(1);
  if (!/[a-zA-Z]/.test(s)) s = s.slice(0, -1) + 'k';
  return s;
}

function sal_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

function hash_(clave, sal) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, 'zw|' + sal + '|' + clave, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b & 0xff) + 0x100).toString(16).slice(1); }).join('');
}

function token_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

/* ---------- registro de actividad ---------- */

function registrar_(usuario, accion, entidad, entidadId, detalle) {
  try {
    hoja_('LOG').appendRow([ahora_(),
      usuario ? usuario.id : '', usuario ? usuario.usuario : '',
      accion, entidad || '', entidadId || '',
      typeof detalle === 'string' ? detalle : JSON.stringify(detalle || '')]);
  } catch (e) { /* el registro nunca puede tumbar una operación */ }
}

/* ---------- configuración ---------- */

function config_() {
  const c = {};
  leer_('CONFIG').forEach(function (r) { c[r.clave] = r.valor; });
  return c;
}

function configNum_(clave, porDefecto) {
  const c = config_();
  return c[clave] === undefined || c[clave] === '' ? Number(porDefecto || 0) : num_(c[clave]);
}
