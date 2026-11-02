/* vistas/hoy.js — «Hoy»: lo que le toca a cada uno hoy, con un botón por cosa (02/11/2026).
 *
 * Comercial: visitas de hoy (con modo visita y coche), llamadas que tocan,
 * propuestas listas para mandar, semáforo de la cartera (propuestas sin
 * respuesta y sentadas sin resultado). Captador: sus citas de hoy y
 * mañana, fichas sin adjudicar y leads sin cita. Dirección: además cobros
 * vencidos o de esta semana, hitos sin factura y entradas del banco sin casar.
 */

import {h, poner, txt, normal, hoyISO, sumarDias, fechaCorta, fechaLarga, eur, telHref, waHref,
        comoLlegarHref, destinoDe, etiquetaCliente, dias} from '../util.js';
import * as api from '../api.js';
import {tarjeta, kpi, kpis, marca, aviso} from '../ui.js';
import {nuevaCita} from './citas.js';
import {nuevoSeguimiento} from './clientes.js';
import {citaSinConfirmar} from './panel.js';

const OPERACION_GANADA = ['firmada', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];

export async function vistaHoy({ir, refrescar}) {
  const yo = api.estado.usuario || {};
  const hoy = hoyISO();
  const manana = sumarDias(hoy, 1);
  const esDir = api.esDireccion();
  const esCap = yo.rol === 'captador';
  const cliente = id => api.cliente(id) || {};
  const nom = c => etiquetaCliente(c);

  const mias = api.estado.captaciones.filter(c => esDir ? true
    : esCap ? txt(c.captador_id) === txt(yo.id)
    : txt(c.comercial_id || cliente(c.cliente_id).comercial_id) === txt(yo.id));
  const vivas = mias.filter(c => !['no_sentada', 'cancelada'].includes(normal(c.resultado)));
  const delDia = f => vivas.filter(c => txt(c.fecha).slice(0, 10) === f)
    .sort((a, b) => txt(a.hora_cita).localeCompare(txt(b.hora_cita)));

  const lineaCita = c => {
    const cli = cliente(c.cliente_id);
    return h('li',
      h('span.que', h('b', txt(c.hora_cita).slice(0, 5) || '—'), ' · ', nom(cli),
        esDir || esCap ? h('span.nota', ' · ' + api.nombrePersona(c.comercial_id)) : null,
        citaSinConfirmar(c) ? marca('SIN CONFIRMAR', 'mal') : null),
      txt(cli.telefono) ? h('a.btn.mini', {href: telHref(cli.telefono)}, '📞') : null,
      !esCap ? h('a.btn.mini', {href: comoLlegarHref(destinoDe(cli)), target: '_blank', rel: 'noopener'}, '🚗') : null,
      !esCap ? h('button.btn.mini.primario', {onclick: () => ir('visita/' + cli.id)}, 'Modo visita') : null,
      h('button.btn.mini', {onclick: () => ir('cliente/' + cli.id)}, 'Ficha'));
  };

  const bloques = [];
  const cifras = [];

  /* --- visitas --- */
  const hoyC = delDia(hoy), mananaC = delDia(manana);
  cifras.push(kpi(esCap ? 'Tus citas hoy' : 'Visitas hoy', String(hoyC.length), fechaLarga(hoy)));
  bloques.push(tarjeta(esCap ? 'Tus citas de hoy' : 'Visitas de hoy',
    hoyC.length ? h('ul.hoy-lista', hoyC.map(lineaCita)) : h('p.nota', 'Hoy no hay visitas.'),
    {acciones: h('button.btn.mini', {onclick: () => nuevaCita({refrescar})}, '+ Nueva cita')}));
  if (mananaC.length) bloques.push(tarjeta('Mañana', h('ul.hoy-lista', mananaC.map(lineaCita)),
    {subtitulo: mananaC.filter(citaSinConfirmar).length ? mananaC.filter(citaSinConfirmar).length + ' sin confirmar' : 'Todas confirmadas'}));

  if (!esCap) {
    /* --- llamadas y próximos pasos que tocan --- */
    const visibles = api.estado.clientes.filter(c => esDir || txt(c.comercial_id) === txt(yo.id));
    const tocan = visibles.filter(c => txt(c.proxima_fecha) && txt(c.proxima_fecha) <= hoy &&
      !['ganado', 'perdido'].includes(normal(c.estado)))
      .sort((a, b) => txt(a.proxima_fecha).localeCompare(txt(b.proxima_fecha)));
    cifras.push(kpi('Llamadas y pasos', String(tocan.length), 'para hoy o atrasados', {estado: tocan.length ? 'aviso' : 'bien'}));
    if (tocan.length) bloques.push(tarjeta('Llamadas y próximos pasos', h('ul.hoy-lista', tocan.slice(0, 25).map(c => h('li',
      h('span.que', nom(c), h('span.nota', ' · ' + txt(c.proxima_accion) + ' · ' + fechaCorta(c.proxima_fecha))),
      txt(c.telefono) ? h('a.btn.mini', {href: telHref(c.telefono)}, '📞') : null,
      txt(c.telefono) ? h('a.btn.mini', {href: waHref(c.telefono), target: '_blank', rel: 'noopener'}, 'WhatsApp') : null,
      h('button.btn.mini.primario', {onclick: () => nuevoSeguimiento(c, refrescar)}, 'Apuntar'))))));

    /* --- semáforo de la cartera --- */
    const propuestas = api.estado.operaciones.filter(o => (esDir || txt(o.comercial_id) === txt(yo.id)) &&
      normal(o.estado) === 'propuesta');
    const diasDesde = o => {
      const segs = api.seguimientoDe(o.cliente_id) || [];
      const ultima = segs.map(s => txt(s.fecha)).sort().pop() || txt(o.fecha_propuesta) || txt(o.creado);
      return ultima ? dias(ultima.slice(0, 10), hoy) : 0;
    };
    const conDias = propuestas.map(o => ({o, d: diasDesde(o)})).sort((a, b) => b.d - a.d);
    const rojas = conDias.filter(x => x.d > 7);
    const sentadasSin = mias.filter(c => normal(c.resultado) === 'sentada' &&
      !api.estado.operaciones.some(o => o.cliente_id === c.cliente_id) && dias(txt(c.fecha).slice(0, 10), hoy) >= 2);
    const pendientesPasadas = mias.filter(c => normal(c.resultado || 'pendiente') === 'pendiente' &&
      txt(c.fecha) && txt(c.fecha).slice(0, 10) < sumarDias(hoy, -1));
    cifras.push(kpi('Propuestas sin respuesta', String(rojas.length), 'más de 7 días', {estado: rojas.length ? 'mal' : 'bien'}));
    bloques.push(tarjeta('Semáforo de la cartera', h('ul.hoy-lista',
      conDias.slice(0, 20).map(({o, d}) => h('li', h('span.que',
        h('span.semaforo.' + (d > 7 ? 'rojo' : d > 3 ? 'ambar' : 'verde')), nom(cliente(o.cliente_id)),
        h('span.nota', ' · propuesta ' + eur(o.total) + ' · ' + d + ' días sin contacto')),
        h('button.btn.mini', {onclick: () => ir('cliente/' + o.cliente_id)}, 'Abrir'))),
      sentadasSin.map(c => h('li', h('span.que', h('span.semaforo.rojo'), nom(cliente(c.cliente_id)),
        h('span.nota', ' · sentada del ' + fechaCorta(c.fecha) + ' sin propuesta')),
        h('button.btn.mini', {onclick: () => ir('cliente/' + c.cliente_id)}, 'Abrir'))),
      pendientesPasadas.slice(0, 15).map(c => h('li', h('span.que', h('span.semaforo.ambar'), nom(cliente(c.cliente_id)),
        h('span.nota', ' · visita del ' + fechaCorta(c.fecha) + ' sin resultado')),
        h('button.btn.mini', {onclick: () => ir('cliente/' + c.cliente_id)}, 'Apuntar resultado')))),
      {subtitulo: 'Rojo: más de 7 días sin contacto o sentada sin propuesta · Ámbar: 4-7 días o visita sin resultado'}));

    /* --- propuestas listas para mandar --- */
    try {
      const listos = (await api.proyectosPendientes('entregado')).proyectos || [];
      cifras.push(kpi('Propuestas para enviar', String(listos.length), 'listas del ingeniero', {estado: listos.length ? 'aviso' : 'bien'}));
      if (listos.length) bloques.push(tarjeta('Propuestas listas para enviar', h('ul.hoy-lista', listos.map(p => h('li',
        h('span.que', txt(p.direccion || p.cliente), h('span.nota', ' · lista el ' + fechaCorta(p.entregado))),
        h('button.btn.mini.primario', {onclick: () => ir('cliente/' + p.cliente_id)}, 'Enviar'))))));
    } catch (e) { /* si no responde, no se enseña */ }
  } else {
    /* --- captador: fichas sin adjudicar y leads parados --- */
    const sinAdj = mias.filter(c => !txt(c.comercial_id) && normal(c.resultado || 'pendiente') === 'pendiente');
    cifras.push(kpi('Sin adjudicar', String(sinAdj.length), 'fichas sin comercial', {estado: sinAdj.length ? 'mal' : 'bien'}));
    /* Lo que se lleva si se venden sus citas de los próximos 7 días (estimado). */
    const cfv = Number(yo.comision_captacion_fv || (api.estado.config || {}).comision_captacion_fv || 0);
    const cae = Number(yo.comision_captacion_aero || (api.estado.config || {}).comision_captacion_aero || 0);
    const prox = vivas.filter(c => txt(c.fecha).slice(0, 10) >= hoy && txt(c.fecha).slice(0, 10) <= sumarDias(hoy, 7));
    const posible = prox.reduce((a, c) => { const t = normal(c.tecnologia);
      return a + (t.includes('foto') ? cfv : 0) + (t.includes('aero') ? cae : 0); }, 0);
    if (posible) cifras.push(kpi('Comisión en juego', eur(posible), prox.length + ' citas de los próximos 7 días si se venden'));
    if (sinAdj.length) bloques.push(tarjeta('Fichas sin adjudicar', h('ul.hoy-lista', sinAdj.map(c => h('li',
      h('span.que', nom(cliente(c.cliente_id)), h('span.nota', ' · ' + fechaCorta(c.fecha))),
      h('button.btn.mini.primario', {onclick: () => ir('captaciones')}, 'Adjudicar'))))));
  }

  /* --- dirección: dinero de hoy --- */
  if (esDir && api.puede('finanzas')) {
    try {
      const fin = await api.pedir('finanzas', {});
      const cob = (fin.cobros || []).filter(c => !txt(c.fecha_cobro) && txt(c.fecha_prevista) && txt(c.fecha_prevista) <= sumarDias(hoy, 7))
        .sort((a, b) => txt(a.fecha_prevista).localeCompare(txt(b.fecha_prevista)));
      const sinFactura = (fin.cobros || []).filter(c => !txt(c.factura_id) && !txt(c.fecha_cobro) &&
        txt(c.fecha_prevista) && txt(c.fecha_prevista) <= sumarDias(hoy, 7));
      cifras.push(kpi('Cobros a mirar', String(cob.length), 'vencidos o esta semana', {estado: cob.length ? 'aviso' : 'bien'}));
      bloques.push(tarjeta('Cobros vencidos o de esta semana', cob.length ? h('ul.hoy-lista', cob.map(c => {
        const op = api.operacion(c.operacion_id) || {};
        return h('li', h('span.que', h('span.semaforo.' + (txt(c.fecha_prevista) < hoy ? 'rojo' : 'ambar')),
          nom(cliente(op.cliente_id)), h('span.nota', ' · ' + txt(c.concepto) + ' · ' + eur(c.importe) + ' · ' + fechaCorta(c.fecha_prevista) +
            (txt(c.factura_id) ? '' : ' · sin factura'))),
          h('button.btn.mini', {onclick: () => ir('cobros')}, 'Cobros'));
      })) : h('p.nota', 'Nada vencido ni previsto esta semana.'),
        {subtitulo: sinFactura.length ? sinFactura.length + ' sin factura emitida: se factura desde Cobros' : ''}));
      const al = await api.alertasBanco().catch(() => null);
      if (al && (al.duplicados.length || al.sin_justificar.length)) {
        bloques.push(tarjeta('Pagos raros en el banco', h('ul.hoy-lista',
          al.duplicados.map(d => h('li', h('span.que', h('span.semaforo.rojo'), 'Posible pago doble: ' + d.concepto,
            h('span.nota', ' · ' + eur(Math.abs(d.importe)) + ' · ' + fechaCorta(d.fecha_a) + ' y ' + fechaCorta(d.fecha_b))))),
          al.sin_justificar.slice(0, 10).map(m => h('li', h('span.que', h('span.semaforo.ambar'), m.concepto,
            h('span.nota', ' · ' + eur(Math.abs(m.importe)) + ' · ' + fechaCorta(m.fecha) + ' · sin gasto ni factura'))))),
          {acciones: h('button.btn.mini', {onclick: () => ir('banco')}, 'Ir al banco')}));
      }
    } catch (e) { /* sin finanzas no pasa nada */ }
  }

  return h('div', kpis(cifras), bloques);
}
