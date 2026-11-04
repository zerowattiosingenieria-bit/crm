/* vistas/citas-cambios.js — reagendar o cancelar una cita (02/11/2026).
 *
 * Cada cambio queda guardado en el servidor (CITAS_CAMBIOS) para saber
 * cuántas citas se aplazan y cuántas se caen, por captador y por fechas.
 */

import {h, txt, normal, fechaCorta, hoyISO, sumarDias, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {ventanaFormulario, aviso, confirmar} from '../ui.js';

/**
 * Reglas de la agenda de Nando (02/11/2026): los captadores no le pueden dar
 * más de 3 visitas al día, ni los viernes, ni después de las 17:30, salvo que
 * él lo autorice. Si el servidor lo rechaza, se ofrece guardarla sin
 * adjudicar y pedirle la autorización por correo.
 */
export async function conAutorizacion(guardar) {
  try {
    return await guardar(false);
  } catch (e) {
    if (!e.datos || !e.datos.requiere_autorizacion) throw e;
    const si = await confirmar(e.message + ' ¿La guardo sin adjudicar y le pido autorización por correo? Si no, cambia el día o la hora.',
      {titulo: 'Hace falta la autorización de ' + (e.datos.comercial || 'el comercial'), botón: 'Pedir autorización', peligro: false});
    if (!si) throw new Error('No se ha guardado: elige otro día u hora.');
    const r = await guardar(true);
    if (r && r.pendiente_autorizacion) aviso(r.pendiente_autorizacion);
    return r;
  }
}

export const MOTIVOS_CANCELACION = [
  ['no_interesa', 'Ya no le interesa'],
  ['no_contesta', 'No contesta / no abre'],
  ['no_decide', 'No está quien decide'],
  ['ya_tiene', 'Ya lo tiene o lo ha contratado con otro'],
  ['no_viable', 'No es viable (vivienda, tejado, comunidad…)'],
  ['precio', 'Por el precio / no puede pagarlo'],
  ['otro', 'Otro motivo']
];

/** ¿Se puede todavía reagendar o cancelar esta cita? */
export const citaAbierta = k => !['venta', 'sentada'].includes(normal(k.resultado));
export const citaCancelada = k => normal(k.resultado) === 'cancelada';

export function ventanaReagendar(k, refrescar) {
  const c = api.cliente(k.cliente_id) || {};
  const vf = ventanaFormulario({
    titulo: (txt(k.fecha) ? 'Reagendar la cita · ' : 'Dar fecha a la cita · ') + etiquetaCliente(c),
    campos: [
      {id: 'cuando', et: '¿Ya tiene nuevo día?', tipo: 'select', vacio: false, ancho: 3,
       opciones: [['si', 'Sí, le pongo el nuevo día'], ['no', 'Aún no puede: queda pendiente de reagendar']]},
      {id: 'fecha', et: 'Nuevo día', tipo: 'fecha'},
      {id: 'hora_cita', et: 'Nueva hora', tipo: 'hora'},
      {id: 'volver_llamar', et: 'Volver a llamar el (opcional)', tipo: 'fecha'},
      {id: 'confirmada', et: 'El cliente ya la ha confirmado', tipo: 'select', opciones: [['', 'No, hay que confirmarla'], ['si', 'Sí, confirmada']]},
      {id: 'motivo', et: 'Por qué se cambia', ancho: 3, pista: 'Corto: «le surgió un viaje», «no estaba el marido»…'}
    ],
    valores: {cuando: 'si', fecha: txt(k.fecha) > hoyISO() ? k.fecha : sumarDias(hoyISO(), 1), hora_cita: k.hora_cita || '17:00',
              volver_llamar: txt(k.volver_llamar)},
    textoBoton: 'Reagendar',
    extra: h('p.nota', (txt(k.fecha) ? 'Estaba el ' + fechaCorta(k.fecha) + (txt(k.hora_cita) ? ' a las ' + k.hora_cita : '') +
      '. Queda apuntado como cita reagendada en las estadísticas.' : 'Ahora está pendiente de reagendar, sin fecha.') +
      ' Si el cliente aún no puede, déjala pendiente de reagendar: no hace falta inventar una fecha.'),
    alGuardar: async d => {
      if (d.cuando === 'no') {
        const r = await api.reagendarCita({id: k.id, sin_fecha: true, volver_llamar: d.volver_llamar, motivo: d.motivo});
        if (!r.ok) throw new Error(r.error || 'No se ha podido guardar.');
        aviso('Queda pendiente de reagendar' + (txt(d.volver_llamar) ? ': volver a llamar el ' + fechaCorta(d.volver_llamar) : '') + '.');
        await refrescar();
        return;
      }
      if (!txt(d.fecha) || !txt(d.hora_cita)) throw new Error('Pon el nuevo día y la hora, o elige «Aún no puede».');
      const r = await conAutorizacion(pedir => api.reagendarCita({id: k.id, fecha: d.fecha, hora_cita: d.hora_cita, motivo: d.motivo,
        confirmada: d.confirmada === 'si', pedir_autorizacion: pedir}));
      if (!r.ok) throw new Error(r.error || 'No se ha podido reagendar.');
      aviso('Cita reagendada al ' + fechaCorta(d.fecha) + ' a las ' + d.hora_cita + '.');
      if (r.aviso_agenda) aviso('Ojo con la cita: ' + r.aviso_agenda, 'error');
      await refrescar();
    }
  });
  /* Con «Aún no puede» no se piden día ni hora; con «Sí», no se pide cuándo volver a llamar. */
  const f = vf.formulario;
  const ctl = id => f.nodos[id] && f.nodos[id].control;
  const campo = id => ctl(id) && ctl(id).closest('.campo, label');
  const ajustar = () => {
    const sin = ctl('cuando').value === 'no';
    ['fecha', 'hora_cita', 'confirmada'].forEach(id => { if (campo(id)) campo(id).style.display = sin ? 'none' : ''; });
    if (campo('volver_llamar')) campo('volver_llamar').style.display = sin ? '' : 'none';
  };
  ctl('cuando').addEventListener('change', ajustar);
  ajustar();
  return vf;
}

export function ventanaCancelar(k, refrescar) {
  const c = api.cliente(k.cliente_id) || {};
  return ventanaFormulario({
    titulo: 'Cancelar la cita · ' + etiquetaCliente(c),
    campos: [
      {id: 'motivo', et: 'Motivo', tipo: 'select', opciones: MOTIVOS_CANCELACION, requerido: true, ancho: 2},
      {id: 'detalle', et: 'Detalle (opcional)', ancho: 3, pista: 'Una línea, sin novelas'}
    ],
    valores: {motivo: 'no_interesa'},
    textoBoton: 'Sí, cancelar la cita',
    extra: h('p.nota', 'La cita del ' + fechaCorta(k.fecha) + ' queda cancelada y cuenta en las estadísticas. ' +
      'Si más adelante vuelve a querer, usa «Reagendar».'),
    alGuardar: async d => {
      const r = await api.cancelarCita({id: k.id, motivo: d.motivo, detalle: d.detalle});
      if (!r.ok) throw new Error(r.error || 'No se ha podido cancelar.');
      aviso('Cita cancelada.');
      await refrescar();
    }
  });
}

/** Marcar que la visita se hizo (sentada). También lo puede hacer el captador (02/11/2026). */
export async function marcarSentada(k, refrescar) {
  const r = await api.guardarCaptacion({id: k.id, cliente_id: k.cliente_id, resultado: 'sentada', fecha_resultado: hoyISO()});
  if (!r.ok) throw new Error(r.error || 'No se ha podido marcar.');
  aviso('Marcada como sentada.');
  await refrescar();
}

/** Los botones de la cita, para una fila o una tarjeta. */
export function botonesCita(k, refrescar) {
  if (!citaAbierta(k)) return null;
  const pendiente = ['', 'pendiente'].includes(normal(k.resultado));
  const yaPaso = txt(k.fecha) && txt(k.fecha).slice(0, 10) <= hoyISO();
  return h('span.acciones', {estilo: {display: 'inline-flex', gap: '6px', flexWrap: 'wrap'}},
    pendiente && yaPaso ? h('button.btn.mini', {estilo: {color: 'var(--bien)'}, onclick: async e => {
      e.stopPropagation();
      try { await marcarSentada(k, refrescar); } catch (err) { aviso(err.message, 'error'); }
    }}, '✓ Sentada') : null,
    h('button.btn.mini', {onclick: e => { e.stopPropagation(); ventanaReagendar(k, refrescar); }}, '↻ Reagendar'),
    citaCancelada(k) ? null
      : h('button.btn.mini', {estilo: {color: 'var(--mal)'}, onclick: e => { e.stopPropagation(); ventanaCancelar(k, refrescar); }}, '✕ Cancelar'));
}
