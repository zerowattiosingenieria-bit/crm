/* vistas/visita.js — «Modo visita»: todo lo de la visita en una pantalla del móvil (02/11/2026).
 *
 * Fotos de la casa, facturas de luz y gas con la cámara, la nota de la
 * visita (escrita o dictada) y el botón de mandar al ingeniero. Si no hay
 * cobertura, las notas se guardan en el móvil y se mandan solas al volver.
 * Las fotos sí necesitan conexión (pesan): se avisa y se reintentan.
 */

import {h, poner, txt, hoyISO, telHref, comoLlegarHref, destinoDe, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {tarjeta, aviso, avisoError} from '../ui.js';
import {prepara} from './proyecto.js';
import {botonDictado} from '../voz.js';

const K_COLA = 'zw.crm.colaVisita';
const cola = () => { try { return JSON.parse(localStorage.getItem(K_COLA) || '[]'); } catch (e) { return []; } };
const guardaCola = l => { try { localStorage.setItem(K_COLA, JSON.stringify(l)); } catch (e) { /* sin hueco */ } };

/* Lo pendiente se manda en cuanto vuelve la conexión. */
export async function vaciarColaVisita() {
  const l = cola();
  if (!l.length || !navigator.onLine) return 0;
  const quedan = [];
  for (const x of l) {
    try {
      if (x.tipo === 'nota') await api.guardarSeguimiento(x.datos);
      else if (x.tipo === 'proyecto') await api.guardarProyecto(x.datos);
    } catch (e) { quedan.push(x); }
  }
  guardaCola(quedan);
  const hechos = l.length - quedan.length;
  if (hechos) aviso(hechos + ' cosa(s) de la visita enviadas al volver la conexión.');
  return hechos;
}
window.addEventListener('online', () => { vaciarColaVisita(); });

export async function vistaVisita({id, ir, refrescar}) {
  const c = api.cliente(id);
  if (!c) return h('.tarjeta', h('.cuerpo', h('p', 'No encuentro ese cliente.')));
  const estado = h('p.nota');

  const subir = clase => {
    const inp = h('input', {type: 'file', accept: clase === 'foto' ? 'image/*' : 'image/*,application/pdf',
      capture: 'environment', multiple: clase === 'foto', estilo: {display: 'none'}});
    inp.addEventListener('change', async () => {
      const lista = Array.from(inp.files || []); inp.value = '';
      if (!lista.length) return;
      if (!navigator.onLine) return aviso('Sin conexión: haz la foto y súbela cuando tengas cobertura.', 'error');
      let n = 0;
      for (const f of lista) {
        estado.textContent = 'Subiendo ' + (++n) + ' de ' + lista.length + '…';
        try { await api.subirArchivo({cliente_id: c.id, ...(await prepara(f, clase)), clase}); }
        catch (e) { avisoError(e); }
      }
      estado.textContent = n + ' archivo(s) subidos a la carpeta del cliente.';
    });
    return inp;
  };
  const fotos = subir('foto'), luz = subir('factura_luz'), gas = subir('factura_gas');

  const nota = h('textarea', {'data-voz': '1', placeholder: 'Cómo ha ido: qué quiere, qué has visto, objeciones, próximo paso…',
    estilo: {minHeight: '140px'}});
  const resultado = h('select', ['sentada', 'potencial', 'venta', 'no_sentada'].map(v =>
    h('option', {value: v}, {sentada: 'Sentada', potencial: 'Potencial', venta: 'Venta', no_sentada: 'No sentada'}[v])));
  const proximo = h('input', {placeholder: 'Próximo paso (p. ej. mandar propuesta)'});
  const fechaProx = h('input', {type: 'date', value: hoyISO()});

  async function guardarNota(alIngeniero) {
    if (!txt(nota.value)) return aviso('Escribe o dicta la nota de la visita.', 'error');
    const seg = {cliente_id: c.id, canal: 'visita', nota: txt(nota.value), proximo_paso: txt(proximo.value),
                 proxima_fecha: txt(proximo.value) ? fechaProx.value : '', fecha: hoyISO()};
    const proy = alIngeniero ? {cliente_id: c.id, descripcion: 'VISITA ' + hoyISO() + ' (' +
      ((api.estado.usuario || {}).nombre || '') + '): ' + txt(nota.value)} : null;
    if (!navigator.onLine) {
      const l = cola(); l.push({tipo: 'nota', datos: seg}); if (proy) l.push({tipo: 'proyecto', datos: proy}); guardaCola(l);
      aviso('Sin conexión: guardado en el móvil, se manda solo al volver la cobertura.');
      return;
    }
    await api.guardarSeguimiento(seg);
    const cap = api.captacionDe(c.id);
    if (cap && cap.id && txt(cap.resultado || 'pendiente') === 'pendiente') {
      await api.guardarCaptacion({...cap, _fila: undefined, resultado: resultado.value, fecha_resultado: hoyISO()});
    }
    if (proy) {
      const actual = await api.proyectoDe(c.id).catch(() => ({}));
      const previa = txt((actual.proyecto || {}).descripcion);
      await api.guardarProyecto({cliente_id: c.id, descripcion: (previa ? previa + '\n\n' : '') + proy.descripcion});
    }
    aviso(alIngeniero ? 'Nota guardada y enviada al ingeniero (con una foto entra en su cola).' : 'Nota de la visita guardada.');
    nota.value = '';
    await refrescar();
  }

  const pend = cola().length;
  return h('div',
    tarjeta(etiquetaCliente(c), h('div',
      h('.acciones',
        txt(c.telefono) ? h('a.btn', {href: telHref(c.telefono)}, '📞 Llamar') : null,
        h('a.btn', {href: comoLlegarHref(destinoDe(c)), target: '_blank', rel: 'noopener'}, '🚗 Ir'),
        h('button.btn', {onclick: () => ir('cliente/' + c.id)}, 'Ficha completa')),
      pend ? h('p.nota', pend + ' cosa(s) guardadas sin conexión, pendientes de mandar.') : null),
      {subtitulo: 'Modo visita'}),
    tarjeta('1 · Fotos y facturas', h('div',
      h('.acciones',
        h('button.btn.primario', {onclick: () => fotos.click()}, '📷 Fotos de la casa'),
        h('button.btn', {onclick: () => luz.click()}, '💡 Factura de luz'),
        h('button.btn', {onclick: () => gas.click()}, '🔥 Factura de gas / gasóleo'),
        fotos, luz, gas),
      h('p.nota', 'Tejado, cuadro eléctrico, contador, caldera, radiadores, sitio de la máquina y fachada.'),
      estado)),
    tarjeta('2 · Cómo ha ido', h('div',
      h('.acciones', nota, botonDictado(nota)),
      h('.rejilla', h('label.campo', h('span', 'Resultado'), resultado),
        h('label.campo', h('span', 'Próximo paso'), proximo), h('label.campo', h('span', 'Fecha'), fechaProx)),
      h('.acciones', {estilo: {marginTop: '8px'}},
        h('button.btn', {onclick: e => conEspera(e, () => guardarNota(false))}, 'Guardar nota'),
        h('button.btn.primario', {onclick: e => conEspera(e, () => guardarNota(true))}, 'Guardar y mandar al ingeniero')))),
    tarjeta('3 · Dimensionado', h('div',
      h('p.nota', 'La ficha de dimensionado (equipos, cuota a 10 años, ayudas) está en la ficha del cliente, pestaña Ficha.'),
      h('button.btn', {onclick: () => ir('cliente/' + c.id)}, 'Abrir la ficha de dimensionado'))));
}

async function conEspera(ev, fn) {
  const b = ev && ev.currentTarget; if (b) b.disabled = true;
  try { await fn(); } catch (e) { avisoError(e); } finally { if (b) b.disabled = false; }
}
