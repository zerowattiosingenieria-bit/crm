/* vistas/leads.js — leads que se caen o desaparecen.
 *
 * Caído: la cita se canceló, no llegó a sentada o el cliente dijo que no
 * le interesa. Desaparecido: nadie sabe qué pasó (sigue pendiente y la
 * fecha de la visita pasó hace más de un día sin sentada ni venta), lo
 * quitaron de Trello, o quedó como potencial sacado de la agenda («sin
 * día»). Se ve por captador en el panel de cada uno y en el de dirección.
 */

import {h, poner, txt, miles, pct, fechaCorta, normal, hoyISO, sumarDias, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, marca, filtros} from '../ui.js';
import {captacionEsSentada, captacionEsVenta, fechaAlta} from './captaciones.js';

export const MOTIVOS = [
  ['cancelada', 'Cancelada', 'caido'],
  ['no_sentada', 'No llegó a sentada', 'caido'],
  ['no_interesa', 'No interesa', 'caido'],
  ['sin_resultado', 'Desaparecido: sin resultado', 'desaparecido'],
  ['trello', 'Quitado de Trello', 'desaparecido'],
  ['sin_dia', 'Quitado de la agenda (sin día)', 'desaparecido']
];
const MOTIVO = Object.fromEntries(MOTIVOS.map(([k, et, tipo]) => [k, {k, et, tipo}]));

const RE_TRELLO = /ya no est[aá] en trello|desaparec/i;
const RE_SIN_DIA = /sin d[ií]a/i;

/** ¿Se ha caído o desaparecido este lead? Devuelve {tipo, motivo} o null. */
export function estadoLead(c, hoy = hoyISO()) {
  const res = normal(c.resultado);
  if (res === 'cancelada') return MOTIVO.cancelada;
  if (res === 'no_sentada') return MOTIVO.no_sentada;
  if (normal(c.estado_cita) === 'no_interesa') return MOTIVO.no_interesa;
  if (['venta', 'sentada'].includes(res)) return null;
  if (RE_TRELLO.test(txt(c.notas))) return MOTIVO.trello;
  if (res === 'potencial' && RE_SIN_DIA.test(txt(c.notas))) return MOTIVO.sin_dia;
  if ((res === 'pendiente' || !res) && txt(c.fecha) && txt(c.fecha) < sumarDias(hoy, -1) &&
      !captacionEsSentada(c) && !captacionEsVenta(c)) return MOTIVO.sin_resultado;
  return null;
}

export const PERIODOS = [['mes', 'Este mes'], ['90', 'Últimos 90 días']];
export function enPeriodo(c, periodo, hoy = hoyISO()) {
  const f = fechaAlta(c);
  if (!f) return false;
  return periodo === 'mes' ? f.slice(0, 7) === hoy.slice(0, 7) : f >= sumarDias(hoy, -90) && f <= hoy;
}

/** Cifras de un grupo de fichas. */
export function cifrasLeads(lista) {
  const r = {fichas: lista.length, sentadas: 0, caidos: 0, desaparecidos: 0};
  lista.forEach(c => {
    if (captacionEsSentada(c)) r.sentadas++;
    const e = estadoLead(c);
    if (e && e.tipo === 'caido') r.caidos++;
    if (e && e.tipo === 'desaparecido') r.desaparecidos++;
  });
  r.pct_caida = r.fichas ? r.caidos * 100 / r.fichas : 0;
  r.pct_desaparicion = r.fichas ? r.desaparecidos * 100 / r.fichas : 0;
  return r;
}

const pct1 = n => pct(Math.round(n * 10) / 10);

function tablaLeads(lista, ir, {conCaptador} = {}) {
  return tabla([
    {clave: 'cliente', et: 'Cliente', valor: c => etiquetaCliente(api.cliente(c.cliente_id)),
     pinta: c => { const cli = api.cliente(c.cliente_id) || {};
       return h('div', h('b', etiquetaCliente(cli)), txt(cli.municipio) ? h('div.nota', cli.municipio) : null); }},
    {clave: 'fecha', et: 'Visita', valor: c => txt(c.fecha), pinta: c => fechaCorta(c.fecha)},
    {clave: 'motivo', et: 'Motivo', valor: c => (estadoLead(c) || {}).et || '',
     pinta: c => { const e = estadoLead(c) || {}; return marca(e.et || '—', e.tipo === 'caido' ? 'mal' : 'aviso'); }},
    ...(conCaptador ? [{clave: 'captador', et: 'Captador', valor: c => api.nombrePersona(c.captador_id)}] : []),
    {clave: 'comercial', et: 'Comercial', valor: c => txt(c.comercial_id) ? api.nombrePersona(c.comercial_id) : 'sin adjudicar'}
  ], lista, {alPulsar: c => ir('cliente/' + c.cliente_id), csv: 'leads_caidos_desaparecidos.csv',
             vacio: 'Ningún lead caído ni desaparecido.', ordenInicial: {clave: 'fecha', desc: true}});
}

/* ---------- panel del captador: solo los suyos ---------- */
export function bloqueLeadsCaptador(ir) {
  const yo = String((api.estado.usuario || {}).id);
  const mias = api.estado.captaciones.filter(c => String(c.captador_id) === yo);
  const mes = cifrasLeads(mias.filter(c => enPeriodo(c, 'mes')));
  const d90 = cifrasLeads(mias.filter(c => enPeriodo(c, '90')));
  const perdidos = mias.filter(c => enPeriodo(c, '90') && estadoLead(c))
    .sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha)));
  const t = tablaLeads(perdidos, ir);
  return h('div.leads-captador',
    kpis(
      kpi('Fichas este mes', miles(mes.fichas), '90 días: ' + miles(d90.fichas)),
      kpi('Caídos', miles(mes.caidos), '90 días: ' + miles(d90.caidos), {estado: mes.caidos ? 'mal' : null}),
      kpi('Desaparecidos', miles(mes.desaparecidos), '90 días: ' + miles(d90.desaparecidos),
        {estado: mes.desaparecidos ? 'aviso' : null}),
      kpi('% caída', pct1(mes.pct_caida), '90 días: ' + pct1(d90.pct_caida))
    ),
    tarjeta('Tus leads caídos o desaparecidos (' + perdidos.length + ')', t, {sinRelleno: true,
      subtitulo: 'Últimos 90 días · pulsa uno para abrir el cliente',
      acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
}

/* ---------- panel de dirección: todos, por captador ---------- */
export function tarjetaLeadsDireccion(ir) {
  const est = {periodo: 'mes', captador: '', motivo: ''};
  const cuerpo = h('div');
  const captadores = [...new Set(api.estado.captaciones.map(c => txt(c.captador_id)))]
    .sort((a, b) => api.nombrePersona(a).localeCompare(api.nombrePersona(b), 'es'));
  const f = filtros([
    {id: 'periodo', tipo: 'select', opciones: PERIODOS, valor: 'mes'},
    {id: 'captador', tipo: 'select', opciones: [['', 'Todos los captadores']]
      .concat(captadores.map(id => [id, id ? api.nombrePersona(id) : '(sin captador)']))},
    {id: 'motivo', tipo: 'select', opciones: [['', 'Todos los motivos'], ['caido', 'Solo caídos'],
      ['desaparecido', 'Solo desaparecidos']].concat(MOTIVOS.map(([k, et]) => [k, et]))}
  ], v => { Object.assign(est, v); pinta(); });

  function pinta() {
    const delPeriodo = api.estado.captaciones.filter(c => enPeriodo(c, est.periodo));
    const filas = captadores.map(id => Object.assign({id, nombre: id ? api.nombrePersona(id) : '(sin captador)'},
      cifrasLeads(delPeriodo.filter(c => txt(c.captador_id) === id)))).filter(x => x.fichas);
    const total = Object.assign({nombre: 'Total'}, cifrasLeads(delPeriodo));
    const stats = tabla([
      {clave: 'nombre', et: 'Captador'},
      {clave: 'fichas', et: 'Fichas', num: true},
      {clave: 'sentadas', et: 'Sentadas', num: true},
      {clave: 'caidos', et: 'Caídos', num: true},
      {clave: 'desaparecidos', et: 'Desaparecidos', num: true},
      {clave: 'pct_caida', et: '% caída', num: true, valor: x => x.pct_caida, pinta: x => pct1(x.pct_caida)},
      {clave: 'pct_desaparicion', et: '% desaparición', num: true, valor: x => x.pct_desaparicion,
       pinta: x => pct1(x.pct_desaparicion)}
    ], filas, {vacio: 'Sin fichas en este periodo.', csv: 'leads_por_captador.csv',
      pie: [{texto: 'Total'}, {texto: miles(total.fichas), num: true}, {texto: miles(total.sentadas), num: true},
            {texto: miles(total.caidos), num: true}, {texto: miles(total.desaparecidos), num: true},
            {texto: pct1(total.pct_caida), num: true}, {texto: pct1(total.pct_desaparicion), num: true}]});
    const lista = delPeriodo.filter(c => {
      const e = estadoLead(c);
      if (!e) return false;
      if (est.captador && txt(c.captador_id) !== est.captador) return false;
      if (est.motivo && e.tipo !== est.motivo && e.k !== est.motivo) return false;
      return true;
    });
    const t = tablaLeads(lista, ir, {conCaptador: true});
    poner(cuerpo,
      h('div.leads-stats', stats),
      h('h3', {estilo: {margin: '14px 16px 6px', fontSize: '14px'}}, lista.length + ' lead(s) caídos o desaparecidos'),
      t,
      h('.acciones', {estilo: {padding: '10px 16px'}},
        h('button.btn.mini', {onclick: () => stats.exportar && stats.exportar()}, 'Exportar estadística'),
        h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar leads')));
  }
  pinta();
  return tarjeta('Leads caídos y desaparecidos', h('div', h('div', {estilo: {padding: '12px 16px 0'}}, f.nodo), cuerpo),
    {sinRelleno: true, subtitulo: 'Por captador · caído: cancelada, no llegó a sentada o no interesa · ' +
      'desaparecido: sin resultado pasada la visita, quitado de Trello o de la agenda'});
}
