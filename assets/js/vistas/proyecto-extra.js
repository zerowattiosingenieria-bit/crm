/* vistas/proyecto-extra.js — lo que se añadió a la pestaña Proyecto el 02/11/2026:
 * enviar la propuesta al cliente desde la ficha, pedir cambios al ingeniero
 * y la aceptación firmada en el móvil con la foto del DNI. */

import {h, poner, txt, fechaCorta, waHref} from '../util.js';
import * as api from '../api.js';
import {tarjeta, aviso, avisoError, ventana, marca} from '../ui.js';
import {prepara, abrirArchivo} from './proyecto.js';

const nombreDe = c => txt(c.nombre).split(/\s+/)[0] || '';

/** Enviar al cliente: descarga el PDF y abre WhatsApp o el correo con el texto hecho. */
export function tarjetaEnviar(cliente, proy, pdf, recargar) {
  if (!pdf || txt(proy.estado) === 'enviado') return null;
  const texto = 'Hola ' + nombreDe(cliente) + ', te adjunto la propuesta de tu instalación de ZERO WATTIOS. ' +
    'La cuota está calculada a 10 años y la amortización anticipada es a coste 0. ' +
    'Cualquier duda me dices. Un saludo.';
  const asunto = 'Tu propuesta de ZERO WATTIOS · ' + txt(cliente.direccion || cliente.nombre);
  return tarjeta('Enviar la propuesta al cliente', h('div',
    h('p.nota', '1) Descarga el PDF. 2) Ábrelo por WhatsApp o correo con el texto ya escrito y adjúntalo. ' +
      '3) Cuando se lo hayas mandado, márcalo: se apunta la llamada de seguimiento a 7 días.'),
    h('.acciones',
      h('button.btn', {onclick: e => espera(e, () => abrirArchivo(pdf))}, '⤓ 1. Descargar PDF'),
      txt(cliente.telefono) ? h('a.btn', {href: waHref(cliente.telefono) + '?text=' + encodeURIComponent(texto),
        target: '_blank', rel: 'noopener'}, '2. WhatsApp') : null,
      txt(cliente.email) ? h('a.btn', {href: 'mailto:' + txt(cliente.email) + '?subject=' + encodeURIComponent(asunto) +
        '&body=' + encodeURIComponent(texto)}, '2. Correo') : null,
      h('button.btn.primario', {onclick: e => espera(e, async () => {
        const r = await api.enviadoProyecto(cliente.id);
        aviso(r.llamada ? 'Marcado como enviado. Llamada de seguimiento el ' + fechaCorta(r.llamada) + '.'
                        : 'Marcado como enviado al cliente.');
        await recargar();
      })}, '✓ 3. Ya se lo he enviado'))),
    {subtitulo: 'Sin salir de la ficha'});
}

/** Pedir cambios al ingeniero sobre la propuesta que ya está hecha. */
export function tarjetaCambios(cliente, proy, recargar) {
  if (!['entregado', 'enviado'].includes(txt(proy.estado))) return null;
  const t = h('textarea', {placeholder: 'Qué hay que cambiar: equipos, número de placas, batería, precio, opción B…',
    estilo: {minHeight: '80px'}});
  return tarjeta('Pedir cambios al ingeniero', h('div', t,
    h('.acciones', {estilo: {marginTop: '8px'}},
      h('button.btn.primario', {onclick: e => espera(e, async () => {
        if (!txt(t.value)) return aviso('Escribe qué hay que cambiar.', 'error');
        await api.pedirCambios(cliente.id, t.value);
        aviso('Pedido. El proyecto vuelve a la cola del ingeniero con tus cambios.');
        await recargar();
      })}, 'Pedir la versión nueva'))),
    {subtitulo: 'Queda en el historial y sale una versión nueva'});
}

/** Aceptación del cliente: firma en la pantalla y foto del DNI. */
export function tarjetaAceptacion(cliente, archivos, recargar) {
  const firmas = archivos.filter(a => a.clase === 'aceptacion');
  const dnis = archivos.filter(a => a.clase === 'dni');
  const camaraDni = h('input', {type: 'file', accept: 'image/*,application/pdf', capture: 'environment', estilo: {display: 'none'}});
  camaraDni.addEventListener('change', async () => {
    const f = camaraDni.files[0]; camaraDni.value = '';
    if (!f) return;
    try {
      const listo = await prepara(f, 'dni');
      await api.subirArchivo({cliente_id: cliente.id, ...listo, clase: 'dni', nombre: 'DNI_' + f.name});
      aviso('DNI guardado en la carpeta del cliente.'); await recargar();
    } catch (e) { avisoError(e); }
  });
  const lista = (l, vacio) => l.length ? h('ul.zw-docs', l.map(a => h('li', h('span', txt(a.nombre)),
    h('span.nota', fechaCorta(a.subido)), h('button.btn.plano', {onclick: e => espera(e, () => abrirArchivo(a))}, '⤓'))))
    : h('p.nota', vacio);
  return tarjeta('Aceptación del cliente', h('div',
    lista(firmas, 'Sin firmar todavía.'), lista(dnis, 'Sin DNI.'),
    h('.acciones', {estilo: {marginTop: '8px'}},
      h('button.btn.primario', {onclick: () => firmar(cliente, recargar)}, '✍ Firmar en la pantalla'),
      h('button.btn', {onclick: () => camaraDni.click()}, '📷 Foto del DNI'), camaraDni)),
    {subtitulo: 'El cliente acepta la propuesta en el móvil o la tablet'});
}

function firmar(cliente, recargar) {
  const lienzo = h('canvas', {width: 600, height: 220,
    estilo: {width: '100%', maxWidth: '600px', height: '220px', border: '1px solid var(--linea)', borderRadius: '8px',
             touchAction: 'none', background: '#fff'}});
  const nombre = h('input', {placeholder: 'Nombre y apellidos de quien firma', value: txt(cliente.nombre)});
  const dni = h('input', {placeholder: 'DNI / NIE'});
  const importe = h('input', {placeholder: 'Importe aceptado (IVA incluido), p. ej. 33.662 €'});
  const ctx = lienzo.getContext('2d');
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#17191c';
  let pinta = false, hay = false;
  const pos = e => { const r = lienzo.getBoundingClientRect(); return [(e.clientX - r.left) * lienzo.width / r.width,
    (e.clientY - r.top) * lienzo.height / r.height]; };
  lienzo.addEventListener('pointerdown', e => { pinta = true; hay = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); lienzo.setPointerCapture(e.pointerId); });
  lienzo.addEventListener('pointermove', e => { if (!pinta) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => lienzo.addEventListener(t, () => { pinta = false; }));
  const guardar = h('button.btn.primario', 'Guardar la aceptación');
  const v = ventana({titulo: 'Aceptación de la propuesta', ancha: true,
    cuerpo: h('div',
      h('p', 'Acepto la propuesta de ZERO WATTIOS INGENIERÍA, S.L. para la vivienda de ', h('b', txt(cliente.direccion)), '.'),
      h('.rejilla', nombre, dni, importe), h('p.nota', 'Firma aquí con el dedo:'), lienzo,
      h('.acciones', h('button.btn.plano', {onclick: () => { ctx.clearRect(0, 0, lienzo.width, lienzo.height); hay = false; }}, 'Borrar firma'))),
    acciones: [h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'), guardar]});
  guardar.addEventListener('click', async () => {
    if (!hay) return aviso('Falta la firma.', 'error');
    if (!txt(nombre.value)) return aviso('Falta el nombre de quien firma.', 'error');
    guardar.disabled = true;
    try {
      /* Una sola imagen con el texto, los datos, la fecha y la firma. */
      const hoja = document.createElement('canvas'); hoja.width = 1000; hoja.height = 560;
      const c = hoja.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, 1000, 560); c.fillStyle = '#17191c';
      c.font = 'bold 26px Arial'; c.fillText('ACEPTACIÓN DE LA PROPUESTA · ZERO WATTIOS', 30, 50);
      c.font = '20px Arial';
      [['Vivienda', txt(cliente.direccion)], ['Firma', txt(nombre.value)], ['DNI / NIE', txt(dni.value)],
       ['Importe aceptado (IVA incl.)', txt(importe.value)], ['Fecha y hora', new Date().toLocaleString('es-ES')],
       ['Recogida por', (api.estado.usuario || {}).nombre || '']]
        .forEach(([k, val], i) => c.fillText(k + ': ' + val, 30, 95 + i * 32));
      c.drawImage(lienzo, 30, 300, 600, 220);
      c.strokeStyle = '#999'; c.strokeRect(30, 300, 600, 220);
      const datos = hoja.toDataURL('image/png').split(',')[1];
      await api.subirArchivo({cliente_id: cliente.id, clase: 'aceptacion', mime: 'image/png',
        nombre: 'Aceptacion_' + new Date().toISOString().slice(0, 10) + '.png', datos, miniatura: ''});
      aviso('Aceptación guardada en la carpeta del cliente.'); v.cerrar(); await recargar();
    } catch (e) { avisoError(e); guardar.disabled = false; }
  });
}

async function espera(ev, fn) {
  const b = ev && ev.currentTarget; if (b) b.disabled = true;
  try { await fn(); } catch (e) { avisoError(e); } finally { if (b) b.disabled = false; }
}
