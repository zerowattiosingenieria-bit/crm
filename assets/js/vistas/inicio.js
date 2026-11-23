/* vistas/inicio.js — Una sola pantalla de inicio (21/11/2026): arriba lo que toca hoy
   (citas, llamadas, propuestas, avisos de clientes) y debajo las cifras del panel. Antes
   eran dos entradas del menú («Hoy» y «Panel») que se pisaban. Las dos siguen existiendo
   por dentro para que los enlaces antiguos funcionen. */
import {h} from '../util.js';
import * as api from '../api.js';
import {tarjeta} from '../ui.js';
import {vistaHoy} from './hoy.js';
import {vistaPanel} from './panel.js';
import {tarjetaMensajes} from './mensajes.js';

export async function vistaInicio(ctx) {
  const [hoy, panel, al, msg, sinEnv] = await Promise.all([vistaHoy(ctx), vistaPanel({...ctx, enInicio: true}), api.pedir('alertas').catch(() => ({alertas: []})),
    (api.esDireccion() || ['U-000001', 'U-000002', 'U-000003', 'U-000004'].includes((api.estado.usuario || {}).id) ? api.pedir('mensajesPendientes').catch(() => null) : null),
    api.puede('sinenviar') ? api.pedir('proyectosSinEnviar').catch(() => null) : null]);
  /* 23/11/2026: solo Nando y superadmin, por separado: todos los proyectos hechos que no se han enviado. */
  const PS = (sinEnv && sinEnv.proyectos) || [];
  const viejos = PS.filter(p => p.dias != null && p.dias > 7).length;
  const sinEnviar = PS.length ? h('div', {onclick: () => ctx.ir('sinenviar'), title: 'Ver todos los proyectos sin enviar', estilo: {cursor: 'pointer', background: '#FFF4DE',
      border: '1px solid #f1d9a6', borderRadius: '10px', padding: '10px 14px', margin: '0 0 14px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap'}},
    h('b', {estilo: {fontSize: '20px', color: '#9a6a00'}}, '✉'),
    h('div', {estilo: {flex: 1, minWidth: '200px'}}, h('b', PS.length + (PS.length === 1 ? ' proyecto hecho sin enviar' : ' proyectos hechos sin enviar') + ' al cliente'),
      h('div.nota', (viejos ? viejos + ' llevan más de 7 días · ' : '') + 'de todos los comerciales')),
    h('span.btn.mini', 'Ver la lista ›')) : null;
  /* Avisos de seguimiento de los clientes, arriba y pulsables (llevan a la ficha). */
  const L = (al.alertas || []);
  const avisos = L.length ? tarjeta('Avisos (' + L.length + ')', h('ul.lista-avisos', L.slice(0, 25).map(a =>
    h('li', a.cliente_id ? {onclick: () => ctx.ir('cliente/' + a.cliente_id), estilo: {cursor: 'pointer'}, title: 'Abrir la ficha'} : null,
      h('span.nivel.' + a.nivel), h('span', a.texto)))),
    {subtitulo: 'Pulsa uno para abrir la ficha del cliente' + (L.length > 25 ? ' · se ven los 25 más urgentes' : '')}) : null;
  /* Solo Nando y Rubén (y superadmin) reciben la lista: a los demás el servidor se la niega. */
  const mensajes = msg && msg.ok && (msg.mensajes || []).length ? tarjetaMensajes(ctx, msg.mensajes) : null;
  return h('div', mensajes, sinEnviar, hoy, avisos,
    h('h2', {estilo: {margin: '28px 0 6px', paddingTop: '18px', borderTop: '2px solid var(--borde, #e5e5e5)'}}, '📊 Cifras y seguimiento'),
    panel);
}
