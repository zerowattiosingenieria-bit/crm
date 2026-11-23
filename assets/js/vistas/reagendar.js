/* vistas/reagendar.js — Citas por reagendar (23/11/2026, Nando).
   «Las que se tengan que reagendar, que se haga lo mismo que con los KO; estas solo le saldrán
   a los captadores de sus clientes.» El captador ve las suyas; dirección, todas. Los comerciales
   no: les vuelve la cita a la agenda cuando el captador le pone fecha. */
import {h, poner, txt, fechaCorta, normal, telHref} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, cargando, filtros} from '../ui.js';
import {ventanaReagendar} from './citas-cambios.js';
import {nuevaCita} from './citas.js';

export async function vistaReagendar({refrescar}) {
  const caja = h('div', cargando('Cargando las citas por reagendar…'));
  const arriba = h('div'), hueco = h('div'), abajo = h('div');
  let datos = null, barraNodo = null;
  const est = {q: '', motivo: '', persona: '', cuando: ''};
  const hoy = new Date().toLocaleDateString('sv-SE');

  async function cargar() {
    try { datos = await api.pedir('porReagendar'); } catch (e) { return poner(caja, h('p.nota', e.message)); }
    pinta();
  }
  const recargar = async () => { if (refrescar) await refrescar(); await cargar(); };

  function pinta() {
    const todos = datos.citas || [];
    const q = normal(est.q);
    const l = todos.filter(c => (!est.motivo || c.motivo === est.motivo)
      && (!est.persona || c.captador_id === est.persona || c.comercial_id === est.persona)
      && (!est.cuando || (est.cuando === 'hoy' ? (c.volver_llamar && c.volver_llamar <= hoy) : !c.volver_llamar))
      && (!q || normal([c.direccion, c.nombre, c.municipio, c.telefono, c.detalle, c.motivo_et].join(' ')).includes(q)));
    const tocaHoy = todos.filter(c => c.volver_llamar && c.volver_llamar <= hoy).length;
    const sinDia = todos.filter(c => !c.volver_llamar).length;
    const personas = [...new Map(todos.flatMap(c => [[c.captador_id, c.captador], [c.comercial_id, c.comercial]]).filter(x => x[0])).entries()];
    if (!barraNodo) barraNodo = filtros([
      {id: 'q', et: 'Buscar por dirección, nombre, teléfono o motivo…'},
      {id: 'motivo', tipo: 'select', opciones: [['', 'Todos los motivos']].concat(datos.motivos || [])},
      {id: 'cuando', tipo: 'select', opciones: [['', 'Todas'], ['hoy', 'Toca llamar hoy o atrasadas'], ['sin', 'Sin día para llamar']]},
      personas.length > 1 ? {id: 'persona', tipo: 'select', opciones: [['', 'Todas las personas']].concat(personas)} : null
    ].filter(Boolean), v => { Object.assign(est, v); pinta(); }).nodo;
    if (!arriba.isConnected) poner(caja, arriba, hueco, abajo);
    if (hueco.firstChild !== barraNodo) poner(hueco, barraNodo);
    poner(arriba,
      h('div', {estilo: {margin: '0 0 12px'}}, h('h2', {estilo: {margin: 0}}, '↻ Por reagendar'),
        h('p.nota', {estilo: {margin: '2px 0 0'}}, 'Citas que se han quedado sin fecha. Las llama el captador de cada cliente; cuando les pone fecha, vuelven a la agenda del comercial.')),
      kpis(kpi('Por reagendar', String(todos.length), 'citas sin fecha'),
        kpi('Toca llamar', String(tocaHoy), 'hoy o atrasadas', {estado: tocaHoy ? 'aviso' : 'bien'}),
        kpi('Sin día para llamar', String(sinDia), 'pon cuándo volver a llamar')));
    poner(abajo, tabla([
      {clave: 'direccion', et: 'Cliente', valor: c => [c.direccion, c.nombre].filter(Boolean).join(' · '),
        pinta: c => h('a', {href: '#cliente/' + c.cliente_id}, h('b', c.direccion || c.nombre), c.direccion ? h('div.nota', c.nombre) : null)},
      {clave: 'motivo_et', et: 'Motivo', pinta: c => h('div', h('b', c.motivo_et), c.detalle ? h('div.nota', {estilo: {maxWidth: '340px'}}, c.detalle) : null)},
      {clave: 'volver_llamar', et: 'Volver a llamar', pinta: c => c.volver_llamar
        ? h('span', {estilo: {fontWeight: c.volver_llamar <= hoy ? 700 : 400, color: c.volver_llamar <= hoy ? '#b06f00' : 'inherit'}}, fechaCorta(c.volver_llamar) + (c.volver_llamar <= hoy ? ' · toca' : ''))
        : h('span.nota', 'sin día')},
      {clave: 'desde', et: 'Desde', pinta: c => c.desde ? fechaCorta(c.desde) : ''},
      {clave: 'captador', et: 'Captador'},
      {clave: 'comercial', et: 'Comercial'},
      {clave: 'captacion_id', et: '', noOrden: true, pinta: c => h('div', {estilo: {display: 'flex', gap: '4px', justifyContent: 'flex-end'}},
        c.telefono ? h('a.btn.mini', {href: telHref(c.telefono), onclick: e => e.stopPropagation()}, '📞') : null,
        h('button.btn.mini.primario', {onclick: e => { e.stopPropagation();
          const k = c.captacion_id && api.captacionesDe(c.cliente_id).find(x => x.id === c.captacion_id);
          if (k) ventanaReagendar(k, recargar); else nuevaCita({refrescar: recargar, clienteId: c.cliente_id}); }}, 'Dar fecha'))}
    ], l, {vacio: 'No hay citas por reagendar.', ordenInicial: {clave: 'volver_llamar'}}));
  }

  cargar();
  return caja;
}
