/* vistas/inicio.js — Una sola pantalla de inicio (21/11/2026): arriba lo que toca hoy
   (citas, llamadas, propuestas, avisos de clientes) y debajo las cifras del panel. Antes
   eran dos entradas del menú («Hoy» y «Panel») que se pisaban. Las dos siguen existiendo
   por dentro para que los enlaces antiguos funcionen. */
import {h} from '../util.js';
import * as api from '../api.js';
import {tarjeta} from '../ui.js';
import {vistaHoy} from './hoy.js';
import {vistaPanel} from './panel.js';

export async function vistaInicio(ctx) {
  const [hoy, panel, al] = await Promise.all([vistaHoy(ctx), vistaPanel({...ctx, enInicio: true}), api.pedir('alertas').catch(() => ({alertas: []}))]);
  /* Avisos de seguimiento de los clientes, arriba y pulsables (llevan a la ficha). */
  const L = (al.alertas || []);
  const avisos = L.length ? tarjeta('Avisos (' + L.length + ')', h('ul.lista-avisos', L.slice(0, 25).map(a =>
    h('li', a.cliente_id ? {onclick: () => ctx.ir('cliente/' + a.cliente_id), estilo: {cursor: 'pointer'}, title: 'Abrir la ficha'} : null,
      h('span.nivel.' + a.nivel), h('span', a.texto)))),
    {subtitulo: 'Pulsa uno para abrir la ficha del cliente' + (L.length > 25 ? ' · se ven los 25 más urgentes' : '')}) : null;
  return h('div', hoy, avisos,
    h('h2', {estilo: {margin: '28px 0 6px', paddingTop: '18px', borderTop: '2px solid var(--borde, #e5e5e5)'}}, '📊 Cifras y seguimiento'),
    panel);
}
