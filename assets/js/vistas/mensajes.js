/* vistas/mensajes.js — Mensajes por aprobar (21/11/2026, Nando: «no mandes ningún WhatsApp
   ni email a cliente o proveedor sin mi aprobación o la de Rubén»).
   El CRM solo PREPARA: bienvenidas a la app del cliente, recordatorios a instaladores que no
   entran, peticiones de documentación… Aquí Nando o Rubén leen el texto, lo cambian si
   quieren y lo aprueban (correo: sale en ese momento; WhatsApp: se abre su WhatsApp con el
   texto puesto y luego lo marcan como enviado) o lo descartan. */
import {h, poner, txt, fechaCorta} from '../util.js';
import * as api from '../api.js';
import {tarjeta, aviso, avisoError} from '../ui.js';

const TIPO = {bienvenida: '📱 Acceso a su app', recordatorio_contrata: '⏰ Instalador sin entrar en su app', docs_contrata: '📄 Documentación del instalador'};

export function tarjetaMensajes(ctx, mensajes) {
  const caja = h('div');
  const pintar = L => {
    if (!L.length) { caja.innerHTML = ''; return; }
    poner(caja, tarjeta('✋ Mensajes por aprobar (' + L.length + ')', h('div', {estilo: {display: 'grid', gap: '12px'}}, L.map(m => fila(m, recargar))),
      {subtitulo: 'Nada sale a un cliente ni a un proveedor sin que lo apruebes tú o Rubén.'}));
  };
  const recargar = () => api.pedir('mensajesPendientes').then(r => pintar(r.mensajes || [])).catch(() => {});
  pintar(mensajes);
  return caja;
}

function fila(m, recargar) {
  const cuerpo = h('textarea', {rows: 5, estilo: {width: '100%', fontSize: '13.5px'}}); cuerpo.value = txt(m.cuerpo);
  const asunto = h('input', {value: txt(m.asunto), estilo: {width: '100%'}});
  const canal = h('select', {estilo: {width: 'auto'}}, h('option', {value: 'email'}, '✉️ Correo'), h('option', {value: 'whatsapp'}, '💬 WhatsApp'));
  canal.value = m.canal === 'whatsapp' ? 'whatsapp' : 'email';
  const destino = m.canal === 'whatsapp' ? (m.telefono || m.destino) : m.destino;
  const quien = m.destino_tipo === 'contrata' ? 'Instalador' : 'Cliente';
  const enviadoYa = m.estado === 'aprobado';
  const boton = (t, cls, fn) => h('button.btn.mini' + (cls ? '.' + cls : ''), {onclick: async e => { e.currentTarget.disabled = true; try { await fn(); } catch (er) { avisoError(er); } e.currentTarget.disabled = false; }}, t);
  return h('div', {estilo: {border: '1px solid var(--borde, #e5e5e5)', borderRadius: '10px', padding: '10px 12px'}},
    h('div', {estilo: {display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px'}},
      h('b', (TIPO[m.tipo] || m.tipo) + ' · ' + quien + (destino ? ': ' + destino : '')),
      h('span.nota', 'Preparado ' + fechaCorta(m.creado) + (m.cliente_id ? ' · ' : ''), m.cliente_id ? h('a', {href: '#cliente/' + m.cliente_id}, 'ver ficha') : null)),
    enviadoYa ? h('p.nota', {estilo: {margin: '0 0 6px'}}, 'Aprobado por WhatsApp el ' + fechaCorta(m.revisado) + '. ¿Ya lo has mandado?') : null,
    enviadoYa ? null : h('div', {estilo: {display: 'grid', gap: '6px'}}, canal.value === 'email' ? asunto : null, cuerpo),
    h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center'}},
      enviadoYa ? boton('Sí, ya enviado', 'primario', async () => { await api.pedir('marcarMensaje', {id: m.id, estado: 'enviado'}); aviso('Marcado como enviado', 'ok'); recargar(); })
        : [canal,
          boton('Aprobar y enviar', 'primario', async () => {
            const r = await api.pedir('aprobarMensaje', {id: m.id, canal: canal.value, cuerpo: cuerpo.value, asunto: asunto.value});
            if (r.whatsapp) { window.open(r.whatsapp, '_blank', 'noopener'); aviso('Se abre WhatsApp con el texto. Cuando lo mandes, márcalo como enviado.', 'ok'); }
            else aviso('Enviado', 'ok');
            recargar();
          })],
      boton('Descartar', '', async () => { await api.pedir('marcarMensaje', {id: m.id, estado: 'descartado'}); aviso('Descartado', 'ok'); recargar(); })));
}
