/* calendario.js — calendario mensual reutilizable.
 *
 * Pinta un mes con un punto de color por cada cosa que pasa ese día:
 * sentadas concertadas, seguimientos con fecha e instalaciones previstas.
 * Al pulsar un día, quien lo use decide qué enseñar debajo.
 */

import {h, poner, txt, hoyISO} from './util.js';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const COLOR_EVENTO = {
  cita: 'var(--bien)',
  seguimiento: 'var(--info)',
  obra: 'var(--lima-osc)',
  vacaciones: 'var(--aviso)'
};

/**
 * eventos: [{fecha, tipo, texto, id}]
 * alPulsarDia(fecha, eventosDelDia) — opcional
 */
export function calendarioMes({eventos = [], mesInicial, alPulsarDia, titulo} = {}) {
  const caja = h('.calendario');
  const hoy = hoyISO();
  let cursor = txt(mesInicial) || hoy.slice(0, 7);
  let elegido = '';

  const porDia = {};
  eventos.forEach(e => {
    const f = txt(e.fecha).slice(0, 10);
    if (!f) return;
    (porDia[f] = porDia[f] || []).push(e);
  });

  function pinta() {
    const anio = Number(cursor.slice(0, 4));
    const mes = Number(cursor.slice(5, 7)) - 1;
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    const hueco = (new Date(anio, mes, 1).getDay() + 6) % 7;

    const celdas = [];
    for (let i = 0; i < hueco; i++) celdas.push(h('.dia.fuera', ''));
    for (let d = 1; d <= ultimo; d++) {
      const fecha = anio + '-' + String(mes + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const delDia = porDia[fecha] || [];
      const w = new Date(anio, mes, d).getDay();
      const clases = ['dia'];
      if (w === 0 || w === 6) clases.push('finde');
      if (fecha === hoy) clases.push('hoy');
      if (fecha === elegido) clases.push('elegido');
      if (delDia.length) clases.push('conEventos');

      celdas.push(h('.' + clases.join('.'), {
        title: delDia.length ? delDia.map(e => e.texto).join(' · ') : '',
        onclick: () => {
          elegido = elegido === fecha ? '' : fecha;
          pinta();
          if (alPulsarDia) alPulsarDia(elegido, elegido ? delDia : []);
        }
      },
        h('span.num', String(d)),
        delDia.length
          ? h('.puntos', [...new Set(delDia.map(e => e.tipo))].slice(0, 3).map(t =>
              h('i', {estilo: {background: COLOR_EVENTO[t] || 'var(--tx-3)'}})))
          : null));
    }

    const mover = n => {
      const d = new Date(anio, mes + n, 1);
      cursor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      pinta();
    };

    poner(caja,
      h('.cal-cabecera',
        h('button.btn.mini.plano', {onclick: () => mover(-1), 'aria-label': 'Mes anterior'}, '‹'),
        h('b', (titulo ? titulo + ' · ' : '') +
          MESES[mes].charAt(0).toUpperCase() + MESES[mes].slice(1) + ' ' + anio),
        h('button.btn.mini.plano', {onclick: () => mover(1), 'aria-label': 'Mes siguiente'}, '›'),
        h('button.btn.mini.plano', {estilo: {marginLeft: 'auto'},
          onclick: () => { cursor = hoy.slice(0, 7); elegido = ''; pinta();
                           if (alPulsarDia) alPulsarDia('', []); }}, 'Hoy')),
      h('.semana', DIAS.map(x => h('.cab', x))),
      h('.semana', celdas));
  }

  pinta();
  return caja;
}
