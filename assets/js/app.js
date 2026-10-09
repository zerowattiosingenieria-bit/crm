/* app.js — armazón: entrada, menú según el rol y reparto de pantallas. */

import {$, h, poner, txt, iniciales, capital} from './util.js';
import * as api from './api.js';
import {aviso, avisoError, cargando} from './ui.js';

import {vistaPanel} from './vistas/panel.js';
import {vistaAgenda} from './vistas/agenda.js';
import {vistaClientes, vistaCliente} from './vistas/clientes.js';
import {vistaOperaciones} from './vistas/operaciones.js';
import {vistaCaptaciones} from './vistas/captaciones.js';
import {vistaMapa} from './vistas/mapa.js';
import {vistaDirectorio} from './vistas/directorio.js';
import {vistaContabilidad, vistaFacturas, vistaGastos, vistaCobros} from './vistas/finanzas.js';
import {vistaBanco} from './vistas/banco.js';
import {vistaEquipo, vistaResumen, vistaPartes} from './vistas/equipo.js';
import {vistaParte} from './vistas/parte.js';
import {vistaNomina} from './vistas/nominas.js';
import {vistaVacaciones} from './vistas/vacaciones.js';
import {vistaUsuarios, vistaAjustes, vistaPerfil, vistaRegistro} from './vistas/ajustes.js';
import {vistaDashboard} from './vistas/dashboard.js?v=2';

export const VERSION = '1.0.0';

/* ---------- pantallas ---------- */
const VISTAS = {
  panel:        {titulo: 'Panel',              pinta: vistaPanel},
  agenda:       {titulo: 'Agenda',             pinta: vistaAgenda},
  clientes:     {titulo: 'Clientes',           pinta: vistaClientes},
  cliente:      {titulo: 'Ficha de cliente',   pinta: vistaCliente},
  operaciones:  {titulo: 'Instalaciones',      pinta: vistaOperaciones},
  captaciones:  {titulo: 'Captaciones',        pinta: vistaCaptaciones},
  mapa:         {titulo: 'Mapa de clientes',   pinta: vistaMapa,          permiso: 'direccion'},
  directorio:   {titulo: 'Directorio y puertas', pinta: vistaDirectorio,  permiso: 'directorio'},
  contabilidad: {titulo: 'Contabilidad',       pinta: vistaContabilidad,  permiso: 'finanzas'},
  facturas:     {titulo: 'Facturas',           pinta: vistaFacturas,      permiso: 'finanzas'},
  gastos:       {titulo: 'Gastos',             pinta: vistaGastos,        permiso: 'finanzas'},
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
  registro:     {titulo: 'Registro de actividad', pinta: vistaRegistro,   permiso: 'config'},
  dashboard:    {titulo: 'Dashboard interactivo', pinta: vistaDashboard, permiso: 'usuarios'},
  perfil:       {titulo: 'Mi perfil',          pinta: vistaPerfil}
};

/* ---------- menú por rol ---------- */
function menuDe(rol) {
  const trabajo = {grupo: 'Trabajo diario'};
  if (rol === 'captador') {
    return [
      trabajo,
      {id: 'panel', et: 'Panel', ico: '▦'},
      {id: 'agenda', et: 'Agenda', ico: '◷'},
      {id: 'captaciones', et: 'Mis captaciones', ico: '⚑'},
      {id: 'clientes', et: 'Mis clientes', ico: '☰'},
      {id: 'parte', et: 'Parte del día', ico: '✓'},
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
      {id: 'panel', et: 'Panel', ico: '▦'},
      {id: 'agenda', et: 'Agenda', ico: '◷'},
      {id: 'clientes', et: 'Mis clientes', ico: '☰'},
      {id: 'operaciones', et: 'Mis instalaciones', ico: '⚡'},
      {id: 'captaciones', et: 'Captaciones', ico: '⚑'},
      {id: 'parte', et: 'Parte del día', ico: '✓'},
      {id: 'directorio', et: 'Directorio', ico: '🗂'},
      {grupo: 'Lo mío'},
      {id: 'resumen', et: 'Mi resumen', ico: '◔'},
      {id: 'nomina', et: 'Mi nómina', ico: '€'},
      {id: 'vacaciones', et: 'Mis vacaciones', ico: '☀'},
      {id: 'perfil', et: 'Mi perfil', ico: '◉'}
    ];
  }
  return [
    trabajo,
    {id: 'panel', et: 'Panel', ico: '▦'},
    {id: 'agenda', et: 'Agenda', ico: '◷'},
    {id: 'clientes', et: 'Clientes', ico: '☰'},
    {id: 'operaciones', et: 'Instalaciones', ico: '⚡'},
    {id: 'captaciones', et: 'Captaciones', ico: '⚑'},
    {id: 'mapa', et: 'Mapa', ico: '◎'},
    {id: 'directorio', et: 'Directorio y puertas', ico: '🗂'},
    {grupo: 'Dinero'},
    {id: 'contabilidad', et: 'Contabilidad', ico: '€'},
    {id: 'facturas', et: 'Facturas', ico: '▤'},
    {id: 'cobros', et: 'Cobros', ico: '↓'},
    {id: 'gastos', et: 'Gastos', ico: '↑'},
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
    {id: 'registro', et: 'Registro', ico: '⟲'},
    {id: 'perfil', et: 'Mi perfil', ico: '◉'}
  ];
}

/* ---------- navegación ---------- */
export function ir(ruta) { location.hash = '#' + ruta; }

function rutaActual() {
  const partes = (location.hash || '#panel').slice(1).split('/');
  return {vista: partes[0] || 'panel', id: partes[1] ? decodeURIComponent(partes[1]) : null};
}

function pintaMenu() {
  const menu = $('#menu');
  const {vista} = rutaActual();
  const rol = api.estado.usuario.rol;
  poner(menu, menuDe(rol).map(x => {
    if (x.grupo) return h('.grupo', x.grupo);
    if (x.soloSuper && rol !== 'superadmin') return null;
    const def = VISTAS[x.id];
    if (def && def.permiso === 'direccion' && !api.esDireccion()) return null;
    if (def && def.permiso && def.permiso !== 'direccion' && !api.puede(def.permiso)) return null;
    return h('a.nav' + (vista === x.id ? '.activo' : ''),
      {onclick: () => { ir(x.id); $('#lateral').classList.remove('abierto'); }},
      h('span.ico', x.ico), x.et);
  }).filter(Boolean));
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

export async function pintar() {
  const mio = ++turno;
  const {vista, id} = rutaActual();
  const def = VISTAS[vista] || VISTAS.panel;

  $('#titulo').textContent = def.titulo;
  poner($('#acciones-barra'));
  pintaMenu();

  const fuera = (def.permiso === 'direccion' && !api.esDireccion()) ||
                (def.permiso && def.permiso !== 'direccion' && !api.puede(def.permiso));
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
}

/* Cuando el servidor no reconoce el equipo, la misma pantalla se convierte
   en el paso del código: se esconden usuario y clave y se pide el número
   que acaba de llegar al correo. */
let pendienteCodigo = null;

function pasoCodigo(datos) {
  pendienteCodigo = datos.pendiente;
  $('#campo-usuario').style.display = 'none';
  $('#campo-clave').style.display = 'none';
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
    if (/^https:\/\/script\.google\.com\//.test(srv)) {
      api.guardarEndpoint(srv);
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
  $('#usuario').focus();
}

arrancar();
