/* api.js — conversación con el servidor (Google Apps Script).
 *
 * Se envía siempre un POST con el JSON en el cuerpo y tipo text/plain:
 * así el navegador no hace la petición previa de CORS, que Apps Script
 * no sabe responder.
 */

/* Dirección de la aplicación web publicada. Se puede dejar vacía y
   configurarla desde la pantalla de entrada; queda guardada en el
   dispositivo. */
const ENDPOINT_POR_DEFECTO = '';

const K_ENDPOINT = 'zw.crm.endpoint';
const K_TOKEN = 'zw.crm.token';
const K_USUARIO = 'zw.crm.usuario';

export const estado = {
  usuario: null,
  permisos: null,
  catalogo: null,
  config: {},
  usuarios: [],
  clientes: [],
  operaciones: [],
  seguimiento: [],
  captaciones: [],
  cobros: [],
  facturas: [],
  gastos: [],
  cargado: false
};

export const endpoint = () => localStorage.getItem(K_ENDPOINT) || ENDPOINT_POR_DEFECTO;
export const guardarEndpoint = url => localStorage.setItem(K_ENDPOINT, String(url || '').trim());
export const token = () => localStorage.getItem(K_TOKEN) || '';

export function guardarSesion(t, usuario) {
  localStorage.setItem(K_TOKEN, t);
  localStorage.setItem(K_USUARIO, JSON.stringify(usuario || {}));
}
export function olvidarSesion() {
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_USUARIO);
}
export function usuarioGuardado() {
  try { return JSON.parse(localStorage.getItem(K_USUARIO) || 'null'); } catch (e) { return null; }
}

let alCaducar = null;
export const cuandoCaduque = fn => { alCaducar = fn; };

/** Llamada al servidor. Devuelve el objeto de respuesta o lanza un error. */
export async function pedir(accion, params = {}) {
  const url = endpoint();
  if (!url) throw new Error('Falta la dirección del servidor. Configúrala en la pantalla de entrada.');
  const cuerpo = Object.assign({accion, token: token()}, params);

  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(cuerpo),
      redirect: 'follow'
    });
  } catch (e) {
    throw new Error('No hay conexión con el servidor. Comprueba la red.');
  }
  if (!r.ok) throw new Error('El servidor ha respondido ' + r.status + '.');

  let d;
  const texto = await r.text();
  try { d = JSON.parse(texto); }
  catch (e) {
    throw new Error('Respuesta ilegible del servidor. Revisa que la aplicación web esté publicada con acceso "cualquier usuario".');
  }

  if (d && d.sesion === false) { olvidarSesion(); if (alCaducar) alCaducar(); }
  if (!d || d.ok === false) {
    const e = new Error((d && d.error) || 'Error desconocido.');
    /* La respuesta entera viaja con el error: hay casos, como el código de
       verificación, en los que «no ok» no es un fallo sino un paso más. */
    e.datos = d || {};
    throw e;
  }
  return d;
}

/* ---------- sesión ---------- */

/* Una marca de este navegador, para no pedir el código cada vez que se
   entra desde el equipo de siempre. No identifica a nadie: es un número al
   azar que vive solo en este dispositivo. */
const K_EQUIPO = 'zw.crm.equipo';
export function equipo() {
  let e = '';
  try { e = localStorage.getItem(K_EQUIPO) || ''; } catch (x) { /* modo incógnito */ }
  if (!e) {
    e = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()) + Date.now()).replace(/-/g, '');
    try { localStorage.setItem(K_EQUIPO, e); } catch (x) { /* se pedirá el código cada vez */ }
  }
  return e;
}

function guardarEntrada(d) {
  guardarSesion(d.token, d.usuario);
  estado.usuario = d.usuario;
  estado.permisos = d.permisos;
  estado.catalogo = d.catalogo;
  estado.config = d.config || {};
  return d;
}

/**
 * Entra con usuario y clave. Si el servidor no reconoce este equipo,
 * devuelve {requiere_codigo: true} en vez de lanzar error: entonces hay
 * que llamar a entrarConCodigo con lo que llegue al correo.
 */
export async function entrar(usuario, clave) {
  let d;
  try {
    d = await pedir('login', {usuario, clave, agente: navigator.userAgent, equipo: equipo()});
  } catch (e) {
    if (e && e.datos && e.datos.requiere_codigo) return e.datos;
    throw e;
  }
  return guardarEntrada(d);
}

export async function entrarConCodigo(pendiente, codigo) {
  const d = await pedir('loginCodigo', {pendiente, codigo,
    agente: navigator.userAgent, equipo: equipo()});
  return guardarEntrada(d);
}

export async function salir() {
  try { await pedir('salir'); } catch (e) { /* da igual: la sesión se cierra en local */ }
  olvidarSesion();
  Object.assign(estado, {usuario: null, permisos: null, clientes: [], operaciones: [],
    seguimiento: [], captaciones: [], cobros: [], facturas: [], gastos: [], cargado: false});
}

/* ---------- foto de datos ---------- */

export async function cargarDatos() {
  const d = await pedir('datos');
  estado.usuario = d.usuario;
  estado.permisos = d.permisos;
  estado.catalogo = d.catalogo;
  estado.config = d.config || {};
  estado.usuarios = d.usuarios || [];
  estado.clientes = d.clientes || [];
  estado.operaciones = d.operaciones || [];
  estado.seguimiento = d.seguimiento || [];
  estado.captaciones = d.captaciones || [];
  estado.cobros = d.cobros || [];
  estado.facturas = d.facturas || [];
  estado.gastos = d.gastos || [];
  estado.cargado = true;
  return estado;
}

/* ---------- atajos de lectura ---------- */

export const cliente = id => estado.clientes.find(c => String(c.id) === String(id));
export const operacion = id => estado.operaciones.find(o => String(o.id) === String(id));
export const persona = id => estado.usuarios.find(u => String(u.id) === String(id));
export const nombrePersona = id => (persona(id) || {}).nombre || '—';
export const operacionesDe = idCliente =>
  estado.operaciones.filter(o => String(o.cliente_id) === String(idCliente));
export const seguimientoDe = idCliente =>
  estado.seguimiento.filter(s => String(s.cliente_id) === String(idCliente))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
export const captacionDe = idCliente =>
  estado.captaciones.find(c => String(c.cliente_id) === String(idCliente));
export const cobrosDe = idOperacion =>
  estado.cobros.filter(c => String(c.operacion_id) === String(idOperacion));
export const gastosDe = idOperacion =>
  estado.gastos.filter(g => String(g.operacion_id) === String(idOperacion));

/** Traduce un código del catálogo a su nombre en castellano. */
export function etiquetaCatalogo(lista, valor) {
  const l = (estado.catalogo || {})[lista] || [];
  const f = l.find(x => x[0] === String(valor));
  return f ? f[1] : (valor || '—');
}
export const opciones = lista => (estado.catalogo || {})[lista] || [];

export const puede = permiso => !!(estado.permisos || {})[permiso];
export const esDireccion = () => (estado.permisos || {}).alcance === 'todo';

/* ---------- guardados ---------- */

export const guardarCliente = cliente => pedir('guardarCliente', {cliente});
export const guardarOperacion = operacion => pedir('guardarOperacion', {operacion});
export const guardarSeguimiento = seguimiento => pedir('guardarSeguimiento', {seguimiento});
export const guardarCaptacion = captacion => pedir('guardarCaptacion', {captacion});
export const guardarCobro = cobro => pedir('guardarCobro', {cobro});
export const guardarFactura = factura => pedir('guardarFactura', {factura});
export const guardarGasto = gasto => pedir('guardarGasto', {gasto});
export const guardarUsuario = usuario => pedir('guardarUsuario', {usuario});
export const guardarConfig = config => pedir('guardarConfig', {config});
export const guardarJornada = jornada => pedir('guardarJornada', {jornada});
export const guardarNomina = nomina => pedir('guardarNomina', {nomina});
