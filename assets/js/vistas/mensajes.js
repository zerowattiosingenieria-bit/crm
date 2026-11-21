/* vistas/mensajes.js — Mensajes por aprobar (21/11/2026, Nando: «no mandes ningún WhatsApp
   ni email a cliente o proveedor sin mi aprobación o la de Rubén»).
   El CRM solo PREPARA: bienvenidas a la app del cliente, recordatorios a instaladores que no
   entran, peticiones de documentación… Aquí Nando o Rubén leen el texto, lo cambian si
   quieren y lo aprueban (correo: se copia el texto para mandarlo desde su correo, nunca sale
   solo; WhatsApp: se abre su WhatsApp con el texto puesto) y luego lo marcan como enviado. */
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

async function copiar(texto, que) {
  try { await navigator.clipboard.writeText(texto); aviso(que + ' copiado', 'ok'); }
  catch (e) { const t = h('textarea', {estilo: {position: 'fixed', opacity: 0}}); t.value = texto; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); aviso(que + ' copiado', 'ok'); } catch (e2) { aviso('No se ha podido copiar: selecciónalo a mano', 'error'); } t.remove(); }
}
/* Para / Asunto / Texto con su botón de copiar, para pegarlo en el correo. */
function bloqueCopiar(para, asunto, cuerpo) {
  const linea = (et, v) => h('div', {estilo: {display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}},
    h('span.nota', {estilo: {minWidth: '52px'}}, et), h('b', {estilo: {flex: 1, minWidth: 0, wordBreak: 'break-all'}}, v), h('button.btn.mini', {onclick: () => copiar(v, et)}, '📋 Copiar'));
  return h('div', {estilo: {display: 'grid', gap: '6px', background: 'var(--fondo-2, #f6f7f2)', padding: '8px 10px', borderRadius: '8px', margin: '6px 0'}},
    linea('Para', para), linea('Asunto', asunto),
    h('div', {estilo: {display: 'flex', gap: '8px', alignItems: 'flex-start'}}, h('span.nota', {estilo: {minWidth: '52px'}}, 'Texto'),
      h('div', {estilo: {flex: 1, whiteSpace: 'pre-wrap', fontSize: '13px'}}, cuerpo), h('button.btn.mini', {onclick: () => copiar(cuerpo, 'Texto')}, '📋 Copiar')));
}

function fila(m, recargar) {
  const cuerpo = h('textarea', {rows: 5, estilo: {width: '100%', fontSize: '13.5px'}}); cuerpo.value = txt(m.cuerpo);
  const asunto = h('input', {value: txt(m.asunto), estilo: {width: '100%'}});
  const canal = h('select', {estilo: {width: 'auto'}}, h('option', {value: 'email'}, '✉️ Correo'), h('option', {value: 'whatsapp'}, '💬 WhatsApp'));
  canal.value = m.canal === 'whatsapp' ? 'whatsapp' : 'email';
  canal.addEventListener('change', () => { const b = canal.nextElementSibling; if (b) b.textContent = canal.value === 'whatsapp' ? 'Aprobar y abrir WhatsApp' : 'Aprobar y copiar el texto'; asunto.hidden = canal.value !== 'email'; });
  asunto.hidden = canal.value !== 'email';
  const destino = m.canal === 'whatsapp' ? (m.telefono || m.destino) : m.destino;
  const quien = m.destino_tipo === 'contrata' ? 'Instalador' : 'Cliente';
  const enviadoYa = m.estado === 'aprobado';
  const boton = (t, cls, fn) => h('button.btn.mini' + (cls ? '.' + cls : ''), {onclick: async e => { e.currentTarget.disabled = true; try { await fn(); } catch (er) { avisoError(er); } e.currentTarget.disabled = false; }}, t);
  return h('div', {estilo: {border: '1px solid var(--borde, #e5e5e5)', borderRadius: '10px', padding: '10px 12px'}},
    h('div', {estilo: {display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px'}},
      h('b', (TIPO[m.tipo] || m.tipo) + ' · ' + quien + (destino ? ': ' + destino : '')),
      h('span.nota', 'Preparado ' + fechaCorta(m.creado) + (m.cliente_id ? ' · ' : ''), m.cliente_id ? h('a', {href: '#cliente/' + m.cliente_id}, 'ver ficha') : null)),
    enviadoYa ? h('p.nota', {estilo: {margin: '0 0 6px'}}, 'Aprobado ' + (m.canal === 'whatsapp' ? 'por WhatsApp' : 'para mandarlo desde tu correo') + ' el ' + fechaCorta(m.revisado) + '. ¿Ya lo has mandado?') : null,
    enviadoYa && m.canal !== 'whatsapp' ? bloqueCopiar(m.destino, m.asunto, m.cuerpo) : null,
    enviadoYa ? null : h('div', {estilo: {display: 'grid', gap: '6px'}}, asunto, cuerpo),
    h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center'}},
      enviadoYa ? boton('Sí, ya enviado', 'primario', async () => { await api.pedir('marcarMensaje', {id: m.id, estado: 'enviado'}); aviso('Marcado como enviado', 'ok'); recargar(); })
        : [canal,
          boton(canal.value === 'whatsapp' ? 'Aprobar y abrir WhatsApp' : 'Aprobar y copiar el texto', 'primario', async () => {
            const r = await api.pedir('aprobarMensaje', {id: m.id, canal: canal.value, cuerpo: cuerpo.value, asunto: asunto.value});
            if (r.whatsapp) { window.open(r.whatsapp, '_blank', 'noopener'); aviso('Se abre WhatsApp con el texto. Cuando lo mandes, márcalo como enviado.', 'ok'); }
            else if (r.email) { await copiar(r.email.cuerpo, 'Texto'); aviso('Texto copiado. Pégalo en tu correo para ' + r.email.para + ' y, cuando lo mandes, márcalo como enviado.', 'ok'); }
            recargar();
          }),
          h('button.btn.mini', {title: 'Copia el texto tal y como está, sin aprobarlo ni enviarlo', onclick: () => copiar(cuerpo.value, 'Texto')}, '📋 Copiar texto'),
          /* Puesto pero desactivado (21/11/2026, Nando): de momento ningún correo sale desde el CRM. */
          h('button.btn.mini', {disabled: true, title: 'Desactivado de momento: copia el texto y mándalo desde tu correo', estilo: {opacity: 0.5, cursor: 'not-allowed'}}, '✉️ Enviar por correo (desactivado)')],
      boton('Descartar', '', async () => { await api.pedir('marcarMensaje', {id: m.id, estado: 'descartado'}); aviso('Descartado', 'ok'); recargar(); })));
}
