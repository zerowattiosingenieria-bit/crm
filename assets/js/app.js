/* app.js — armazón: entrada, menú según el rol y reparto de pantallas. */

import {$, h, poner, txt, iniciales, capital, normal, etiquetaCliente} from './util.js';
import * as api from './api.js';
import {aviso, avisoError, cargando} from './ui.js';

import {vistaPanel} from './vistas/panel.js';
import {vistaAgenda} from './vistas/agenda.js';
import {vistaClientes, vistaCliente} from './vistas/clientes.js';
import {vistaOperaciones} from './vistas/operaciones.js';
import {vistaCaptaciones} from './vistas/captaciones.js';
import {vistaEstadisticas} from './vistas/estadisticas.js';
import {vistaIncidencias, vistaAvisarIncidencia} from './vistas/incidencias.js';
import {vistaTramites, veTramites} from './vistas/tramites.js';
import {vistaMapa} from './vistas/mapa.js';
import {vistaDirectorio} from './vistas/directorio.js';
import {vistaContabilidad, vistaFacturas, vistaGastos, vistaCobros} from './vistas/finanzas.js';
import {vistaMateriales} from './vistas/materiales.js';
import {vistaBanco} from './vistas/banco.js';
import {vistaEquipo, vistaResumen, vistaPartes} from './vistas/equipo.js';
import {vistaParte} from './vistas/parte.js';
import {vistaNomina} from './vistas/nominas.js';
import {vistaVacaciones} from './vistas/vacaciones.js';
import {vistaUsuarios, vistaAjustes, vistaPerfil} from './vistas/ajustes.js';
import {vistaRegistro} from './vistas/registro.js';
import {vistaDashboard} from './vistas/dashboard.js?v=2';
import {vistaTablero, tituloTablero} from './vistas/tablero.js';
import {vistaHoy} from './vistas/hoy.js';
import {vistaVisita, vaciarColaVisita} from './vistas/visita.js';
import {vistaVisor3d, veVisor} from './vistas/visor3d.js';
import {vistaCotizador, veCotizador} from './vistas/cotizador.js';
import {dictadoEnTodo} from './voz.js';

export const VERSION = '1.0.0';

/* ---------- pantallas ---------- */
const VISTAS = {
  hoy:          {titulo: 'Hoy',                pinta: vistaHoy},
  visita:       {titulo: 'Modo visita',        pinta: vistaVisita},
  visor:        {titulo: 'Visor 3D',           pinta: vistaVisor3d,       permiso: 'visor'},
  cotizador:    {titulo: 'Cotizador',          pinta: vistaCotizador,     permiso: 'cotizador'},
  panel:        {titulo: 'Panel',              pinta: vistaPanel},
  tablero:      {titulo: 'Mi tablero',         pinta: vistaTablero},
  agenda:       {titulo: 'Agenda',             pinta: vistaAgenda},
  clientes:     {titulo: 'Clientes',           pinta: vistaClientes},
  cliente:      {titulo: 'Ficha de cliente',   pinta: vistaCliente},
  operaciones:  {titulo: 'Instalaciones',      pinta: vistaOperaciones},
  captaciones:  {titulo: 'Captaciones',        pinta: vistaCaptaciones},
  estadisticas: {titulo: 'Estadísticas',       pinta: vistaEstadisticas},
  incidencias:  {titulo: 'Incidencias',        pinta: vistaIncidencias,   permiso: 'direccion'},
  tramites:     {titulo: 'CAEs y WIXER',       pinta: vistaTramites,      permiso: 'tramites'},
  avisar:       {titulo: 'Avisar de una incidencia', pinta: vistaAvisarIncidencia},
  mapa:         {titulo: 'Mapa de clientes',   pinta: vistaMapa,          permiso: 'direccion'},
  directorio:   {titulo: 'Directorio y puertas', pinta: vistaDirectorio,  permiso: 'directorio'},
  contabilidad: {titulo: 'Contabilidad',       pinta: vistaContabilidad,  permiso: 'finanzas'},
  facturas:     {titulo: 'Facturas',           pinta: vistaFacturas,      permiso: 'finanzas'},
  gastos:       {titulo: 'Gastos',             pinta: vistaGastos,        permiso: 'finanzas'},
  materiales:   {titulo: 'Materiales y costes', pinta: vistaMateriales,   permiso: 'finanzas'},
  banco:        {titulo: 'Banco',              pinta: vistaBanco,         permiso: 'finanzas'},
  cobros:       {titulo: 'Cobros',             pinta: vistaCobros,        permiso: 'finanzas'},
  equipo:       {titulo: 'Equipo',             pinta: vistaEquipo,        permiso: 'partesAjenos'},
  partes:       {titulo: 'Partes diarios',     pinta: vistaPartes,        permiso: 'partesAjenos'},
  resumen:      {titulo: 'Resumen',            pinta: vistaResumen},
  parte:        {titulo: 'Parte del día',      pinta: vistaParte},
  nomina:       {titulo: 'Nómina',             pinta: vistaNomina},
  vacaciones:   {titulo: 'Vacaciones',         pinta: vistaVacaciones},
  usuarios:     {titulo: 'Usuarios',           pinta: vistaUsuarios,      permiso: 'usuarios'},
  ajustes:      {titulo: 'Ajustes',            pinta: vistaAjustes,       permiso: 'config'},
  /* El registro de conexiones es solo del superadmin: «usuarios» es el
     permiso que tiene él y nadie más, y el servidor lo vuelve a mirar. */
  registro:     {titulo: 'Registro de conexiones', pinta: vistaRegistro,  permiso: 'usuarios'},
  dashboard:    {titulo: 'Dashboard interactivo', pinta: vistaDashboard, permiso: 'usuarios'},
  perfil:       {titulo: 'Mi perfil',          pinta: vistaPerfil}
};

/* ---------- menú por rol ---------- */
/* Dirección y contabilidad comparten rol pero no puesto, así que la
   pestaña propia se llama distinta para cada uno. */
function etiquetaTablero() {
  return tituloTablero(api.estado.usuario);
}

function menuDe(rol) {
  const trabajo = {grupo: 'Trabajo diario'};
  if (rol === 'captador') {
    return [
      trabajo,
      {id: 'hoy', et: 'Hoy', ico: '★'},
      {id: 'panel', et: 'Panel', ico: '▦'},
      {id: 'tablero', et: 'Mi tablero', ico: '◑'},
      {id: 'agenda', et: 'Agenda', ico: '◷'},
      {id: 'captaciones', et: 'Mis captaciones', ico: '⚑'},
      {id: 'estadisticas', et: 'Estadísticas del equipo', ico: '▥'},
      {id: 'clientes', et: 'Mis clientes', ico: '☰'},
      {id: 'parte', et: 'Parte del día', ico: '✓'},
      {id: 'tramites', et: 'CAEs y WIXER', ico: '♻'},
      {id: 'avisar', et: 'Avisar incidencia', ico: '⚠'},
      {grupo: 'Lo mío'},
      {id: 'resumen', et: 'Mi resumen', ico: '◔'},
      {id: 'nomina', et: 'Mi nómina', ico: '€'},
      {id: 'vacaciones', et: 'Mis vacaciones', ico: '☀'},
      {id: 'perfil', et: 'Mi perfil', ico: '◉'}
    ];
  }
  if (rol === 'comercial') {
    return [
      trabajo,
      {id: 'hoy', et: 'Hoy', ico: '★'},
      {id: 'panel', et: 'Panel', ico: '▦'},
      {id: 'tablero', et: 'Mi tablero', ico: '◑'},
      {id: 'agenda', et: 'Agenda', ico: '◷'},
      {id: 'clientes', et: 'Mis clientes', ico: '☰'},
      {id: 'visor', et: 'Visor 3D', ico: '⌂'},
      {id: 'cotizador', et: 'Cotizador', ico: '€'},
      {id: 'operaciones', et: 'Mis instalaciones', ico: '⚡'},
      {id: 'captaciones', et: 'Captaciones', ico: '⚑'},
      {id: 'estadisticas', et: 'Estadísticas', ico: '▥'},
      {id: 'parte', et: 'Parte del día', ico: '✓'},
      {id: 'directorio', et: 'Directorio', ico: '🗂'},
      {id: 'avisar', et: 'Avisar incidencia', ico: '⚠'},
      {grupo: 'Lo mío'},
      {id: 'resumen', et: 'Mi resumen', ico: '◔'},
      {id: 'nomina', et: 'Mi nómina', ico: '€'},
      {id: 'vacaciones', et: 'Mis vacaciones', ico: '☀'},
      {id: 'perfil', et: 'Mi perfil', ico: '◉'}
    ];
  }
  return [
    trabajo,
    {id: 'hoy', et: 'Hoy', ico: '★'},
    {id: 'panel', et: 'Panel', ico: '▦'},
    {id: 'tablero', et: etiquetaTablero(), ico: '◑'},
    {id: 'incidencias', et: 'Incidencias', ico: '⚠'},
    {id: 'agenda', et: 'Agenda', ico: '◷'},
    {id: 'clientes', et: 'Clientes', ico: '☰'},
    {id: 'visor', et: 'Visor 3D', ico: '⌂'},
    {id: 'cotizador', et: 'Cotizador', ico: '€'},
    {id: 'operaciones', et: 'Instalaciones', ico: '⚡'},
    {id: 'tramites', et: 'CAEs y WIXER', ico: '♻'},
    {id: 'captaciones', et: 'Captaciones', ico: '⚑'},
    {id: 'estadisticas', et: 'Estadísticas', ico: '▥'},
    {id: 'mapa', et: 'Mapa', ico: '◎'},
    {id: 'directorio', et: 'Directorio y puertas', ico: '🗂'},
    {grupo: 'Dinero'},
    {id: 'contabilidad', et: 'Contabilidad', ico: '€'},
    {id: 'facturas', et: 'Facturas', ico: '▤'},
    {id: 'cobros', et: 'Cobros', ico: '↓'},
    {id: 'gastos', et: 'Gastos', ico: '↑'},
    {id: 'materiales', et: 'Materiales y costes', ico: '⚙'},
    {id: 'banco', et: 'Banco', ico: '▮'},
    {grupo: 'Equipo'},
    {id: 'equipo', et: 'Equipo', ico: '◍'},
    {id: 'partes', et: 'Partes diarios', ico: '✓'},
    {id: 'nomina', et: 'Nóminas', ico: '◧'},
    {id: 'vacaciones', et: 'Vacaciones', ico: '☀'},
    {grupo: 'Sistema'},
    {id: 'dashboard', et: 'Dashboard interactivo', ico: '◈', soloSuper: true},
    {id: 'usuarios', et: 'Usuarios', ico: '◉', soloSuper: true},
    {id: 'ajustes', et: 'Ajustes', ico: '⚙'},
    {id: 'registro', et: 'Registro de conexiones', ico: '⟲', soloSuper: true},
    {id: 'perfil', et: 'Mi perfil', ico: '◉'}
  ];
}

/* ---------- navegación ---------- */
export function ir(ruta) { location.hash = '#' + ruta; }

function rutaActual() {
  const partes = (location.hash || '#panel').slice(1).split('/');
  return {vista: partes[0] || 'panel', id: partes[1] ? decodeURIComponent(partes[1]) : null};
}

/* Menú corto (02/11/2026): solo lo que cada uno usa a diario. Se cambia
   abajo del menú y queda guardado en ese aparato. */
const K_MENU = 'zw.crm.menuSimple';
const MENU_CORTO = {
  captador: ['hoy', 'agenda', 'captaciones', 'estadisticas', 'clientes', 'parte', 'tramites', 'avisar', 'perfil'],
  comercial: ['hoy', 'agenda', 'clientes', 'visor', 'cotizador', 'operaciones', 'parte', 'avisar', 'perfil'],
  otro: ['hoy', 'panel', 'tablero', 'incidencias', 'agenda', 'clientes', 'operaciones', 'tramites', 'captaciones', 'estadisticas', 'cobros', 'banco', 'perfil']
};
const menuCorto = () => { try { return localStorage.getItem(K_MENU) === '1'; } catch (e) { return false; } };

function pintaMenu() {
  const menu = $('#menu');
  const {vista} = rutaActual();
  const rol = api.estado.usuario.rol;
  const corto = menuCorto();
  const deja = MENU_CORTO[rol] || MENU_CORTO.otro;
  const items = menuDe(rol).filter(x => !corto || x.grupo === 'Trabajo diario' || (x.id && deja.includes(x.id)));
  const cambiar = h('a.nav', {onclick: () => {
    try { localStorage.setItem(K_MENU, corto ? '0' : '1'); } catch (e) { /* nada */ }
    pintaMenu();
  }}, h('span.ico', corto ? '⊕' : '⊖'), corto ? 'Ver menú completo' : 'Menú corto');
  poner(menu, items.map(x => {
    if (x.grupo) return h('.grupo', x.grupo);
    if (x.soloSuper && rol !== 'superadmin') return null;
    const def = VISTAS[x.id];
    if (def && def.permiso === 'direccion' && !api.esDireccion()) return null;
    if (def && def.permiso === 'visor') { if (!veVisor()) return null; }
    else if (def && def.permiso === 'cotizador') { if (!veCotizador()) return null; }
    else if (def && def.permiso === 'tramites') { if (!veTramites()) return null; }
    else if (def && def.permiso && def.permiso !== 'direccion' && !api.puede(def.permiso)) return null;
    return h('a.nav' + (vista === x.id ? '.activo' : ''),
      {onclick: () => { ir(x.id); $('#lateral').classList.remove('abierto'); }},
      h('span.ico', x.ico), x.et);
  }).filter(Boolean), cambiar);
}

/* Buscador de arriba: clientes por calle, nombre, teléfono o correo,
   instalaciones por referencia y, para dirección, facturas por número. */
function pintaBuscador() {
  const entrada = $('#buscador');
  if (!entrada || entrada.dataset.vivo) return;
  entrada.dataset.vivo = '1';
  const caja = entrada.parentNode;
  caja.classList.add('buscador-global');
  const res = h('.resultados', {hidden: true});
  const cerrar = () => { res.hidden = true; };
  entrada.addEventListener('input', () => {
    const q = normal(entrada.value);
    if (q.length < 2) return cerrar();
    const dig = q.replace(/\D/g, '');
    const cl = api.estado.clientes.filter(c => [c.nombre, c.direccion, c.municipio, c.email, c.id].some(v => normal(v).includes(q)) ||
      (dig.length >= 4 && txt(c.telefono).replace(/\D/g, '').includes(dig))).slice(0, 12)
      .map(c => h('a', {onclick: () => { cerrar(); entrada.value = ''; ir('cliente/' + c.id); }},
        h('b', etiquetaCliente(c)), h('span.nota', ' · ' + (txt(c.telefono) || c.id))));
    const ops = api.estado.operaciones.filter(o => normal(o.referencia).includes(q) || normal(o.id).includes(q)).slice(0, 5)
      .map(o => h('a', {onclick: () => { cerrar(); entrada.value = ''; ir('cliente/' + o.cliente_id); }},
        h('b', txt(o.referencia || o.id)), h('span.nota', ' · instalación de ' + etiquetaCliente(api.cliente(o.cliente_id) || {}))));
    const fac = (api.estado.facturas || []).filter(f => normal(f.numero).includes(q)).slice(0, 5)
      .map(f => h('a', {onclick: () => { cerrar(); entrada.value = ''; ir('facturas'); }},
        h('b', 'Factura ' + txt(f.numero)), h('span.nota', ' · ' + txt(f.total) + ' €')));
    const todo = [...cl, ...ops, ...fac];
    poner(res, todo.length ? todo : h('a', h('span.nota', 'Nada con «' + entrada.value + '»')));
    res.hidden = false;
  });
  entrada.addEventListener('blur', () => setTimeout(cerrar, 200));
  caja.appendChild(res);
}

function pintaYo() {
  const u = api.estado.usuario;
  poner($('#yo'),
    h('.avatar', iniciales(u.nombre)),
    h('div', {estilo: {flex: '1', minWidth: 0}},
      h('b', u.nombre), h('small', u.rol === 'superadmin' ? 'Superadmin' : capital(u.rol))),
    h('button', {title: 'Salir', onclick: async () => { await api.salir(); location.reload(); }}, 'Salir'));
}

/* Cada pintado lleva su número: si el usuario cambia de pantalla mientras
   una tarda en cargar, la que llegue tarde ya no escribe en la vista. */
let turno = 0;

/* Los captadores no sacan nada del CRM a Excel, CSV ni PDF (orden de Nando,
   26/10/2026): se quitan esos botones en cuanto aparecen y las funciones de
   descarga se niegan (util.js y exportar.js miran data-sin-exportar). Su propia
   nómina («Ver PDF») sí la pueden abrir. */
const BOTON_EXPORTAR = /^(⤓\s*)?(exportar|descargar)\b|excel|\bcsv\b|\bpdf\b|imprimir/i;
function quitaExportar(raiz) {
  if (document.documentElement.dataset.sinExportar !== '1') return;
  raiz.querySelectorAll('button, a.btn').forEach(b => {
    const t = (b.textContent || '').trim();
    if (BOTON_EXPORTAR.test(t) && !/^ver pdf$/i.test(t)) b.remove();
  });
}
let vigilaExportar = null;
function aplicaPermisoExportar() {
  const captador = !!(api.estado.usuario && api.estado.usuario.rol === 'captador');
  document.documentElement.dataset.sinExportar = captador ? '1' : '';
  if (captador && !vigilaExportar) {
    vigilaExportar = new MutationObserver(() => quitaExportar(document.body));
    vigilaExportar.observe(document.body, {childList: true, subtree: true});
  }
  quitaExportar(document.body);
}

export async function pintar() {
  const mio = ++turno;
  aplicaPermisoExportar();
  const {vista, id} = rutaActual();
  const def = VISTAS[vista] || VISTAS.panel;

  $('#titulo').textContent = vista === 'tablero' ? tituloTablero(api.estado.usuario) : def.titulo;
  poner($('#acciones-barra'));
  pintaMenu();

  const fuera = (def.permiso === 'direccion' && !api.esDireccion()) ||
                (def.permiso === 'visor' ? !veVisor() : def.permiso === 'cotizador' ? !veCotizador() : def.permiso === 'tramites' ? !veTramites() : (def.permiso && def.permiso !== 'direccion' && !api.puede(def.permiso)));
  if (fuera) {
    return poner($('#vista'), h('.tarjeta', h('.cuerpo',
      h('h2', 'Esta parte del CRM no está abierta para tu usuario'),
      h('p.nota', 'Si necesitas acceso, pídeselo a dirección.'))));
  }

  poner($('#vista'), cargando());
  try {
    const contenido = await def.pinta({id, ir, refrescar: recargar});
    if (mio !== turno) return;               // el usuario ya se ha ido a otra pantalla
    poner($('#vista'), contenido);
    window.scrollTo({top: 0});
  } catch (e) {
    if (mio !== turno) return;
    avisoError(e);
    poner($('#vista'), h('.tarjeta', h('.cuerpo',
      h('h2', 'No se ha podido abrir esta pantalla'),
      h('p.nota', txt(e.message)),
      h('button.btn', {onclick: () => pintar()}, 'Reintentar'))));
  }
}

export async function recargar() {
  await api.cargarDatos();
  await pintar();
}

/* ---------- entrada ---------- */
function mostrarApp() {
  $('#acceso').style.display = 'none';
  $('#app').classList.add('visible');
  pintaYo();
  pintaMenu();
  pintaBuscador();
  dictadoEnTodo(document.body);
  vaciarColaVisita();
}

/* ---------- recordar los datos de entrada ---------- */
/* Para no teclear usuario y clave cada vez en el movil, la tableta o el
   ordenador de siempre. Solo se guarda si se marca la casilla, y queda en
   ese aparato, no en el servidor. Al desmarcarla se borra en el acto. */
const K_RECORDAR = 'zw.crm.recordar';

function datosRecordados() {
  try { return JSON.parse(localStorage.getItem(K_RECORDAR) || 'null'); } catch (e) { return null; }
}
function recordarDatos(usuario, clave) {
  try { localStorage.setItem(K_RECORDAR, JSON.stringify({usuario: usuario, clave: clave})); }
  catch (e) { /* si el navegador no deja guardar, se entra a mano y ya */ }
}
function olvidarDatos() {
  try { localStorage.removeItem(K_RECORDAR); } catch (e) { /* nada que borrar */ }
}

/* Cuando el servidor no reconoce el equipo, la misma pantalla se convierte
   en el paso del código: se esconden usuario y clave y se pide el número
   que acaba de llegar al correo. */
let pendienteCodigo = null;

function pasoCodigo(datos) {
  pendienteCodigo = datos.pendiente;
  $('#campo-usuario').style.display = 'none';
  $('#campo-clave').style.display = 'none';
  $('#campo-recordar').style.display = 'none';
  $('#paso-codigo').style.display = '';
  $('#btn-otra-cuenta').style.display = '';
  $('#codigo-texto').textContent = 'Este equipo es nuevo. Te hemos mandado un código a ' +
    txt(datos.correo) + '. Caduca en ' + (datos.minutos || 10) + ' minutos.';
  $('#btn-entrar').textContent = 'Verificar';
  $('#codigo').value = '';
  $('#codigo').focus();
}

function pasoClave() {
  pendienteCodigo = null;
  $('#campo-usuario').style.display = '';
  $('#campo-clave').style.display = '';
  $('#campo-recordar').style.display = '';
  $('#paso-codigo').style.display = 'none';
  $('#btn-otra-cuenta').style.display = 'none';
  $('#acceso-error').style.display = 'none';
  $('#btn-entrar').textContent = 'Entrar';
  $('#clave').value = '';
  $('#usuario').focus();
}

async function dentro() {
  await api.cargarDatos();
  mostrarApp();
  if (!location.hash || location.hash === '#') location.hash = '#panel';
  await pintar();
  if (api.estado.usuario.debe_cambiar_clave === 'si') {
    aviso('Tu clave es la inicial: cámbiala desde Mi perfil.');
  }
}

async function intentarEntrar(usuario, clave) {
  const err = $('#acceso-error');
  const btn = $('#btn-entrar');
  err.style.display = 'none';
  btn.disabled = true;
  const original = btn.textContent;
  poner(btn, h('span.cargando'), pendienteCodigo ? ' Verificando' : ' Entrando');
  try {
    if (pendienteCodigo) {
      await api.entrarConCodigo(pendienteCodigo, $('#codigo').value);
    } else {
      const d = await api.entrar(usuario, clave);
      if (d && d.requiere_codigo) { pasoCodigo(d); return; }
    }
    if ($('#recordar').checked) recordarDatos($('#usuario').value.trim(), $('#clave').value);
    else olvidarDatos();
    await dentro();
  } catch (e) {
    err.textContent = txt(e.message);
    err.style.display = '';
    if (pendienteCodigo) { $('#codigo').value = ''; $('#codigo').focus(); }
  } finally { btn.disabled = false; btn.textContent = original; }
}

/* ---------- arranque ---------- */
async function arrancar() {
  $('#version-app').textContent = VERSION;

  /* Un equipo nuevo puede quedar configurado abriendo el CRM con la direccion
     del servidor en la propia URL: .../crm/?srv=https://script.google.com/...
     Asi nadie tiene que teclearla a mano en un movil o en una tableta. Se
     guarda y se limpia la barra de direcciones para no dejarla a la vista. */
  try {
    const q = new URLSearchParams(location.search);
    const srv = (q.get('srv') || '').trim();
    if (srv) {
      api.guardarEndpoint(srv);   /* las del Apps Script antiguo se descartan solas */
      q.delete('srv');
      const limpia = location.pathname + (q.toString() ? '?' + q : '') + (location.hash || '');
      history.replaceState(null, '', limpia);
    }
  } catch (e) { /* si el navegador no deja tocar la URL, se sigue igual */ }

  $('#form-acceso').addEventListener('submit', e => {
    e.preventDefault();
    intentarEntrar($('#usuario').value.trim(), $('#clave').value);
  });
  $('#btn-otra-cuenta').addEventListener('click', pasoClave);
  $('#recordar').addEventListener('change', e => { if (!e.target.checked) olvidarDatos(); });
  $('#ver-config').addEventListener('click', e => {
    e.preventDefault();
    const caja = $('#acceso-config');
    caja.style.display = caja.style.display === 'none' ? '' : 'none';
    $('#endpoint').value = api.endpoint();
  });
  $('#btn-guardar-endpoint').addEventListener('click', () => {
    api.guardarEndpoint($('#endpoint').value);
    aviso('Dirección del servidor guardada.');
  });
  $('#btn-menu').addEventListener('click', () => $('#lateral').classList.toggle('abierto'));
  $('#buscador').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) { ir('clientes'); setTimeout(() => {
        const campo = document.querySelector('.filtros input');
        if (campo) { campo.value = q; campo.dispatchEvent(new Event('input')); }
      }, 120); }
    }
  });

  api.cuandoCaduque(() => {
    aviso('La sesión ha caducado. Vuelve a entrar.', 'error');
    setTimeout(() => location.reload(), 1200);
  });

  window.addEventListener('hashchange', pintar);

  if (!api.endpoint()) {
    $('#acceso-config').style.display = '';
    $('#endpoint').value = '';
  }

  /* ¿Había sesión abierta? */
  if (api.token()) {
    try {
      await api.cargarDatos();
      mostrarApp();
      if (!location.hash || location.hash === '#') location.hash = '#panel';
      await pintar();
      return;
    } catch (e) { api.olvidarSesion(); }
  }
  /* Lo recordado en este aparato se deja puesto: asi solo hay que dar a Entrar. */
  const recordado = datosRecordados();
  if (recordado && recordado.usuario) {
    $('#usuario').value = recordado.usuario;
    $('#clave').value = recordado.clave || '';
    $('#recordar').checked = true;
    $('#btn-entrar').focus();
  } else {
    $('#usuario').focus();
  }
}

arrancar();
