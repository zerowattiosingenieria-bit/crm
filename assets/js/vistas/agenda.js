/* vistas/agenda.js — qué toca hoy: citas, seguimientos y cosas vencidas. */

import {h, poner, txt, num, eur, miles, fechaCorta, fechaLarga, haceDias, normal,
        hoyISO, sumarDias, dias, comoLlegarHref, destinoDe, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, filtros, aviso} from '../ui.js';
import {nuevoSeguimiento} from './clientes.js';
import {calendarioMes, COLOR_EVENTO} from '../calendario.js';
import {citaSinConfirmar} from './panel.js';

export async function vistaAgenda({ir, refrescar}) {
  const caja = h('div');
  const contenedor = h('div');
  const est = {persona: ''};

  const controles = [];
  if (api.esDireccion()) controles.push({id: 'persona', tipo: 'select',
    opciones: [['', 'Todo el equipo']].concat(api.estado.usuarios.map(u => [u.id, u.nombre]))});

  const f = controles.length ? filtros(controles, v => { Object.assign(est, v); pinta(); }) : null;

  function pinta() {
    const hoy = hoyISO();
    const finSemana = sumarDias(hoy, 7);

    const mios = c => !est.persona ||
      txt(c.comercial_id) === est.persona || txt(c.captador_id) === est.persona;

    /* Seguimientos con fecha */
    const acciones = api.estado.clientes.filter(c =>
      txt(c.proxima_fecha) && !['ganado', 'perdido'].includes(normal(c.estado)) && mios(c)
    ).map(c => ({
      tipo: 'seguimiento', fecha: txt(c.proxima_fecha), cliente: c,
      texto: txt(c.proxima_accion) || 'Seguimiento'
    }));

    /* Citas de captación aún por celebrar */
    const citas = api.estado.captaciones.filter(c => {
      const cli = api.cliente(c.cliente_id);
      return cli && mios(cli) && txt(c.fecha) >= sumarDias(hoy, -1) &&
             normal(c.resultado) === 'pendiente';
    }).map(c => ({
      tipo: 'cita', fecha: txt(c.fecha), hora: txt(c.hora_cita), cliente: api.cliente(c.cliente_id),
      texto: 'Sentada · ' + txt(c.tecnologia), captacion: c,
      sinConfirmar: citaSinConfirmar(c)
    }));

    /* Instalaciones con fecha prevista */
    const obras = api.estado.operaciones.filter(o => {
      const cli = api.cliente(o.cliente_id);
      return cli && mios(cli) && txt(o.fecha_prevista_instalacion) &&
             !txt(o.fecha_instalacion) && normal(o.estado) !== 'cancelada';
    }).map(o => ({
      tipo: 'obra', fecha: txt(o.fecha_prevista_instalacion), cliente: api.cliente(o.cliente_id),
      texto: 'Instalación · ' + api.etiquetaCatalogo('tiposOperacion', o.tipo) + ' · ' + eur(o.total),
      operacion: o
    }));

    const todo = acciones.concat(citas, obras).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const vencidas = todo.filter(x => x.fecha < hoy);
    const deHoy = todo.filter(x => x.fecha === hoy);
    const semana = todo.filter(x => x.fecha > hoy && x.fecha <= finSemana);
    const despues = todo.filter(x => x.fecha > finSemana);

    const icono = {seguimiento: '☎', cita: '⚑', obra: '⚡'};

    /* Las señas del cliente, para salir de casa sin abrir la ficha. */
    const senas = c => [txt(c.direccion), txt(c.municipio)].filter(Boolean).join(', ');

    const linea = x => h('li',
      h('span.nivel.' + (x.fecha < hoy ? 'alto' : (x.fecha === hoy ? 'medio' : 'bajo'))),
      h('div', {estilo: {flex: '1', cursor: 'pointer'},
        onclick: () => ir('cliente/' + x.cliente.id)},
        h('b', icono[x.tipo] + ' ' + etiquetaCliente(x.cliente)),
        x.sinConfirmar ? h('div', {estilo: {margin: '3px 0 2px'}},
          marca('NO CONFIRMADA', 'mal'),
          h('span', {estilo: {marginLeft: '6px', fontSize: '12px', color: 'var(--mal)'}},
            'Llama antes de ir: la cita no está confirmada')) : null,
        senas(x.cliente) ? h('div.senas', senas(x.cliente)) : null,
        h('div.nota', x.texto + ' · ' + fechaCorta(x.fecha) +
          (x.hora ? ' a las ' + x.hora : ''))),
      h('.acciones',
        txt(x.cliente.telefono)
          ? h('a.btn.mini', {href: 'tel:' + txt(x.cliente.telefono).replace(/\s/g, '')}, 'Llamar') : null,
        txt(x.cliente.direccion) || txt(x.cliente.coordenadas)
          ? h('a.btn.mini', {href: comoLlegarHref(destinoDe(x.cliente)), target: '_blank',
              rel: 'noopener', title: 'Ir en coche'}, '🚗') : null,
        h('button.btn.mini.lima', {onclick: () => nuevoSeguimiento(x.cliente, refrescar)}, 'Apuntar')));

    const bloque = (titulo, lista, vacio) => tarjeta(titulo + ' (' + lista.length + ')',
      lista.length ? h('ul.lista-avisos', lista.map(linea)) : h('.vacio', vacio));

    /* El calendario del mes: un punto por cada cosa que hay ese día. */
    const delDia = h('div');
    const calendario = calendarioMes({
      titulo: 'Visitas',
      eventos: todo.map(x => ({fecha: x.fecha, tipo: x.sinConfirmar ? 'sin_confirmar' : x.tipo,
        texto: (x.sinConfirmar ? '[NO CONFIRMADA] ' : '') + etiquetaCliente(x.cliente) +
               (txt(x.cliente.municipio) ? ', ' + txt(x.cliente.municipio) : '') + ' · ' + x.texto})),
      alPulsarDia: fecha => {
        const dia = todo.filter(x => x.fecha === fecha);
        poner(delDia, fecha
          ? tarjeta(fechaLarga(fecha),
              dia.length ? h('ul.lista-avisos', dia.map(linea))
                         : h('.vacio', 'Ese día no tienes nada apuntado.'))
          : h('div'));
      }
    });

    poner(contenedor,
      kpis(
        kpi('Vencidas', miles(vencidas.length), 'sin hacer y pasadas de fecha',
          {estado: vencidas.length ? 'mal' : 'bien', destacado: vencidas.length > 0}),
        kpi('Hoy', miles(deHoy.length), fechaLarga(hoy)),
        kpi('Esta semana', miles(semana.length), 'próximos 7 días'),
        kpi('Más adelante', miles(despues.length), 'con fecha puesta')
      ),
      h('.doble',
        h('div',
          tarjeta('Calendario de visitas',
            h('div', calendario,
              h('.leyenda-visitas',
                h('span', h('i', {estilo: {background: COLOR_EVENTO.cita}}), 'Sentadas confirmadas'),
                h('span', h('i', {estilo: {background: COLOR_EVENTO.sin_confirmar}}), 'Sentadas sin confirmar'),
                h('span', h('i', {estilo: {background: COLOR_EVENTO.seguimiento}}), 'Seguimientos'),
                h('span', h('i', {estilo: {background: COLOR_EVENTO.obra}}), 'Instalaciones'))),
            {subtitulo: 'Pulsa un día para ver lo que hay'}),
          delDia),
        h('div',
          bloque('Vencido', vencidas, 'Nada pendiente de días anteriores.'),
          bloque('Hoy', deHoy, 'Hoy no tienes nada con fecha.'))),
      bloque('Esta semana', semana, 'La semana está despejada.'),
      bloque('Más adelante', despues, 'Nada más en la agenda.'));
  }

  pinta();
  return poner(caja, f ? f.nodo : null, contenedor);
}
