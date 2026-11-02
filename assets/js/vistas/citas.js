/* vistas/citas.js — dar citas desde el CRM (02/11/2026).
 *
 * Hoy la agenda buena sigue en Trello y los agentes la copian aquí, pero
 * cualquiera puede ya meter la cita en el CRM: se ve lo que tiene ese día
 * el comercial y el CRM avisa si no le da tiempo. Cada visita dura como
 * mínimo 1 h 45 min y se cuenta lo que tarda en coche de una a otra.
 */

import {h, poner, txt, normal, hoyISO, sumarDias, fechaLarga, debounce, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {ventanaFormulario, aviso, tarjeta, marca} from '../ui.js';

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const aMin = s => { const m = txt(s).match(/^(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : -1; };

export function comercialesParaCitas() {
  return api.estado.usuarios.filter(u => u.rol === 'comercial' && txt(u.activo || 'si') !== 'no')
    .map(u => [u.id, u.nombre]);
}

/* Lo que tiene ocupado un comercial un día (cada visita, 1 h 45 min). */
export async function ocupadoDelDia(comercialId, fecha) {
  const r = await api.agendaHuecos(fecha, fecha);
  const dur = r.duracion_min || 105;
  const bloq = (r.bloqueos || {})[comercialId];
  const dia = new Date(fecha + 'T12:00:00').getDay();
  return {
    dur, fuente: r.fuente,
    bloqueado: bloq && (bloq.dias || []).includes(dia) ? (bloq.nota || 'Día bloqueado') : '',
    citas: (r.citas || []).filter(c => c.comercial_id === comercialId && c.hora)
      .sort((a, b) => a.hora.localeCompare(b.hora))
      .map(c => ({...c, fin: hhmm(aMin(c.hora) + dur)}))
  };
}

/** Ventana para dar una cita a un cliente que ya está en el CRM. */
export function nuevaCita({refrescar, clienteId, fecha} = {}) {
  const yo = api.estado.usuario || {};
  const esComercial = yo.rol === 'comercial';
  const clientes = api.estado.clientes.slice()
    .sort((a, b) => txt(a.direccion || a.nombre).localeCompare(txt(b.direccion || b.nombre)));
  const etiqueta = c => etiquetaCliente(c) + ' · ' + c.id;
  const lista = h('datalist', {id: 'dl-clientes-cita'}, clientes.map(c => h('option', {value: etiqueta(c)})));
  const inicial = clienteId ? api.cliente(clienteId) : null;

  const campos = [
    {id: 'cliente', et: 'Cliente (dirección · nombre)', requerido: true, ancho: 3,
     ayuda: 'Escribe la calle o el nombre y elige. Si es nuevo, da antes de alta su ficha en Captaciones.'},
    esComercial ? null : {id: 'comercial_id', et: 'Comercial', tipo: 'select', opciones: comercialesParaCitas(), requerido: true},
    {id: 'fecha', et: 'Día', tipo: 'fecha', requerido: true},
    {id: 'hora_cita', et: 'Hora', tipo: 'hora', requerido: true},
    {id: 'estado_cita', et: 'Estado', tipo: 'select', opciones: api.opciones('estadosCita'), vacio: false},
    {id: 'tecnologia', et: 'Tecnología', tipo: 'select',
     opciones: ['AEROTERMIA', 'FOTOVOLTAICA', 'AEROTERMIA + FOTOVOLTAICA'], vacio: false},
    {id: 'notas', et: 'Notas para la visita', tipo: 'area', ancho: 3}
  ].filter(Boolean);

  const revision = h('div', {estilo: {marginTop: '10px'}});
  const vf = ventanaFormulario({
    titulo: 'Nueva cita',
    ancha: true,
    campos,
    valores: {cliente: inicial ? etiqueta(inicial) : '', fecha: fecha || sumarDias(hoyISO(), 1), hora_cita: '10:00',
              estado_cita: 'pendiente', tecnologia: 'AEROTERMIA + FOTOVOLTAICA',
              comercial_id: inicial && inicial.comercial_id ? inicial.comercial_id : ''},
    extra: h('div', lista, revision),
    textoBoton: 'Dar la cita',
    alGuardar: async d => {
      const cli = clienteDe(d.cliente);
      if (!cli) throw new Error('Elige el cliente de la lista.');
      const r = await api.guardarCaptacion({
        cliente_id: cli.id, comercial_id: esComercial ? yo.id : d.comercial_id, fecha: d.fecha,
        hora_cita: d.hora_cita, estado_cita: d.estado_cita, tecnologia: d.tecnologia,
        notas: d.notas, resultado: 'pendiente'});
      aviso(r.aviso_agenda ? 'Cita guardada. Ojo: ' + r.aviso_agenda : 'Cita guardada en el CRM.',
            r.aviso_agenda ? 'error' : undefined);
      if (refrescar) await refrescar();
    }
  });
  const f = vf.formulario;
  const ctl = id => f.nodos[id] && f.nodos[id].control;
  if (ctl('cliente')) ctl('cliente').setAttribute('list', 'dl-clientes-cita');

  function clienteDe(texto) {
    const id = (txt(texto).match(/(C-\d+)\s*$/) || [])[1];
    return id ? api.cliente(id) : clientes.find(c => normal(etiquetaCliente(c)) === normal(texto));
  }

  const revisar = debounce(async () => {
    const d = f.leer();
    const comercial = esComercial ? yo.id : d.comercial_id;
    if (!comercial || !d.fecha) return poner(revision);
    const cli = clienteDe(d.cliente);
    poner(revision, h('p.nota', 'Mirando la agenda de ese día…'));
    try {
      const [dia, chk] = await Promise.all([
        ocupadoDelDia(comercial, d.fecha),
        d.hora_cita ? api.comprobarCita({comercial_id: comercial, fecha: d.fecha, hora: d.hora_cita,
          cliente_id: cli ? cli.id : ''}) : Promise.resolve({aviso: ''})]);
      poner(revision, tarjeta('Agenda de ' + api.nombrePersona(comercial) + ' · ' + fechaLarga(d.fecha),
        h('div',
          dia.bloqueado ? h('p', marca(dia.bloqueado, 'mal')) : null,
          dia.citas.length
            ? h('ul.zw-docs', dia.citas.map(c => h('li', h('b', c.hora + '–' + c.fin), ' · ' + c.cliente,
                c.confirmada ? null : h('span.nota', ' (sin confirmar)'))))
            : h('p.nota', 'No tiene nada ese día.'),
          chk.aviso ? h('p', {estilo: {color: 'var(--mal)', fontWeight: 600}}, '⚠ ' + chk.aviso)
                    : (d.hora_cita ? h('p', {estilo: {color: 'var(--bien)'}}, '✓ Le da tiempo, contando 1 h 45 min de visita y el coche.') : null),
          h('p.nota', 'Cada visita ocupa 1 h 45 min. ' + (dia.fuente === 'trello'
            ? 'De momento la agenda que manda sigue siendo Trello: los agentes la copian aquí.' : ''))),
        {sinRelleno: false}));
    } catch (e) { poner(revision, h('p.nota', 'No se ha podido revisar la agenda: ' + e.message)); }
  }, 500);
  ['cliente', 'comercial_id', 'fecha', 'hora_cita'].forEach(id => {
    const c = ctl(id); if (c) { c.addEventListener('change', revisar); c.addEventListener('input', revisar); }
  });
  revisar();
  return vf;
}

/** Tarjeta de la agenda con los huecos de los comerciales en los próximos días. */
export function tarjetaHuecos() {
  const caja = h('div', h('p.nota', 'Cargando la agenda de los comerciales…'));
  (async () => {
    try {
      const desde = hoyISO();
      const r = await api.agendaHuecos(desde, sumarDias(desde, 6));
      const dur = r.duracion_min || 105;
      const dias = [];
      for (let i = 0; i < 7; i++) {
        const f = sumarDias(desde, i);
        const d = new Date(f + 'T12:00:00').getDay();
        if (d !== 0 && d !== 6) dias.push(f);
      }
      const fila = c => {
        const bloq = (r.bloqueos || {})[c.id];
        return h('tr', h('td', h('b', c.nombre)), dias.map(f => {
          const dia = new Date(f + 'T12:00:00').getDay();
          if (bloq && (bloq.dias || []).includes(dia)) return h('td', marca('Libre (bloqueado)', 'mal'));
          const citas = (r.citas || []).filter(x => x.comercial_id === c.id && x.fecha === f && x.hora)
            .sort((a, b) => a.hora.localeCompare(b.hora));
          return h('td', citas.length ? citas.map(x => h('div.nota', x.hora + '–' + hhmm(aMin(x.hora) + dur))) : h('span.nota', 'libre'));
        }));
      };
      poner(caja, h('.tabla-caja', h('table.datos',
        h('thead', h('tr', h('th', 'Comercial'), dias.map(f => h('th', fechaLarga(f).split(' ').slice(0, 2).join(' '))))),
        h('tbody', (r.comerciales || []).map(fila)))),
        h('p.nota', 'Cada visita ocupa 1 h 45 min más el coche hasta la siguiente. ' +
          (r.fuente === 'trello' ? 'Hasta que se deje Trello, lo que manda es Trello: los agentes lo copian aquí.' : '')));
    } catch (e) { poner(caja, h('p.nota', 'No se ha podido cargar: ' + e.message)); }
  })();
  return tarjeta('Huecos de los comerciales (próximos días)', caja,
    {subtitulo: 'Para dar citas sin pisarse'});
}
