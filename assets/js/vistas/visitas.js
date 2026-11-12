/* vistas/visitas.js — «Mis visitas» (12/11/2026, petición de Nando).
 *
 * Las visitas de las dos últimas semanas, de la más nueva a la más antigua.
 * En cada una, de un vistazo y con un toque: ¿hubo sentada?, ¿proyecto
 * hecho?, ¿proyecto enviado? Y debajo, qué ha dicho el cliente (con fecha),
 * la siguiente acción y el estado de la operación. Pulsando en el cliente o
 * en la dirección se abre su ficha. Muy sencillo, pensado para el móvil.
 */

import {h, poner, txt, hoyISO, telHref} from '../util.js';
import * as api from '../api.js';
import {cargando, avisoError, aviso} from '../ui.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const K_VER = 'zw.crm.visitas.ver';

function cabeceraDia(iso) {
  const hoy = hoyISO();
  const d = new Date(iso + 'T12:00:00');
  const ayer = new Date(hoy + 'T12:00:00'); ayer.setDate(ayer.getDate() - 1);
  if (iso === hoy) return 'Hoy';
  if (iso === ayer.toLocaleDateString('sv-SE')) return 'Ayer';
  return DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1) + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}
const fCorta = f => /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) : '';

function tecnologias(t) {
  const n = String(t || '').toLowerCase();
  const out = [];
  if (n.includes('aero')) out.push(h('span.vis-tec.aero', 'Aerotermia'));
  if (n.includes('foto') || n.includes('fv')) out.push(h('span.vis-tec.fv', 'Fotovoltaica'));
  if (n.includes('bat')) out.push(h('span.vis-tec.bat', 'Baterías'));
  return out;
}

/* Un paso del recorrido: hecho (verde), no (rojo, solo la sentada) o pendiente (gris). */
function paso(et, ico, valor, alPulsar, {auto, titulo} = {}) {
  const clase = valor === true ? 'si' : valor === false ? 'no' : 'pte';
  return h('button.vis-paso.' + clase + (auto ? '.auto' : ''), {type: 'button', title: titulo || '', onclick: alPulsar},
    h('span.vis-paso-ico', valor === true ? '✓' : valor === false ? '✕' : ico),
    h('span.vis-paso-et', et));
}

export async function vistaVisitas({ir}) {
  const caja = h('div.visitas', cargando('Cargando tus visitas…'));
  const direccion = api.esDireccion();
  let ver = 'todas';
  try { ver = localStorage.getItem(K_VER) || 'todas'; } catch (e) { /* sin almacenamiento */ }
  let comercial = '';
  let lista = [];

  async function cargar() {
    try {
      const r = await api.visitasRecientes(14, comercial);
      lista = r.visitas || [];
      pinta();
    } catch (e) { poner(caja, h('p.nota', 'No se han podido cargar las visitas: ' + e.message)); }
  }

  const sinApunte = v => !v.ultimo || txt(v.ultimo.fecha) < txt(v.fecha);
  const FILTROS = [
    ['todas', 'Todas', () => true],
    ['sentada', 'Sin marcar sentada', v => v.sentada === null],
    ['proyecto', 'Sin proyecto', v => v.sentada !== false && !v.proyecto],
    ['enviar', 'Sin enviar', v => v.proyecto && !v.enviado],
    ['apunte', 'Sin apunte del cliente', v => v.sentada !== false && sinApunte(v)]
  ];

  function resumen() {
    const n = lista.length;
    const sent = lista.filter(v => v.sentada === true).length;
    const proy = lista.filter(v => v.proyecto).length;
    const env = lista.filter(v => v.enviado).length;
    const pend = lista.filter(v => v.sentada !== false && sinApunte(v)).length;
    const tarj = (valor, et, total, clase) => {
      const p = total ? Math.round(valor / total * 100) : 0;
      return h('div.vis-kpi' + (clase ? '.' + clase : ''),
        h('div.vis-kpi-num', String(valor), total !== null ? h('small', ' / ' + total) : null),
        h('div.vis-kpi-et', et),
        total !== null ? h('div.vis-barra', h('i', {estilo: {width: p + '%'}})) : null);
    };
    return h('div.vis-kpis',
      tarj(n, 'visitas en 14 días', null),
      tarj(sent, 'sentadas', n),
      tarj(proy, 'proyectos hechos', sent || n),
      tarj(env, 'proyectos enviados', proy || n),
      tarj(pend, 'sin apuntar qué dijo el cliente', null, pend ? 'alerta' : 'bien'));
  }

  function tarjetaVisita(v) {
    const c = v.cliente;
    const irFicha = () => ir('cliente/' + encodeURIComponent(c.id));
    const cuerpo = h('div.vis-card' + (v.sentada === false ? '.caida' : ''));

    async function marcar(campo, valor) {
      try {
        const r = await api.visitaMarcar(v.id, campo, valor);
        Object.assign(v, r.visita);
        poner(cuerpo, ...contenido());
        refrescarCabecera();
      } catch (e) { avisoError(e); }
    }

    function contenido() {
      const sentadaSig = v.sentada === null ? true : v.sentada === true ? false : null;
      const pasos = h('div.vis-pasos',
        paso('Sentada', '?', v.sentada, () => marcar('sentada', sentadaSig),
          {titulo: 'Pulsa para cambiar: sin marcar → sí → no llegó a sentarse'}),
        h('span.vis-linea' + (v.proyecto ? '.ok' : '')),
        paso('Proyecto hecho', '▤', v.proyecto ? true : null, () => {
          if (v.proyecto_auto) return aviso('El proyecto está hecho en el CRM: no hace falta marcarlo.');
          marcar('proyecto', !v.proyecto);
        }, {auto: v.proyecto_auto, titulo: v.proyecto_auto ? 'Hecho en el CRM' : 'Márcalo si el proyecto ya está hecho'}),
        h('span.vis-linea' + (v.enviado ? '.ok' : '')),
        paso('Enviado al cliente', '✉', v.enviado ? true : null, () => {
          if (v.enviado_auto && !direccion) return aviso('Ya consta como enviado en el CRM.');
          marcar('enviado', !v.enviado);
        }, {auto: v.enviado_auto, titulo: 'Márcalo cuando le hayas mandado el proyecto al cliente'}));

      const ops = api.opciones('estadosOperacion');
      const sel = h('select.vis-sel', h('option', {value: ''}, v.operacion ? '— sin cambiar —' : '— elige —'),
        ops.map(([val, et]) => h('option', {value: val, selected: v.operacion && v.operacion.estado === val ? true : null}, et)));
      const nota = h('textarea.vis-nota', {rows: 2, placeholder: '¿Qué te ha dicho el cliente?'});
      const fNota = h('input.vis-fecha', {type: 'date', valor: hoyISO()});
      const accion = h('input.vis-accion', {type: 'text', placeholder: 'Siguiente acción (llamar, firma, segunda visita…)'});
      const fAcc = h('input.vis-fecha', {type: 'date'});
      const guardar = h('button.btn.lima.vis-guardar', {type: 'button', onclick: async () => {
        const estado = sel.value && (!v.operacion || sel.value !== v.operacion.estado) ? sel.value : '';
        if (!txt(nota.value) && !txt(accion.value) && !estado) return aviso('Escribe qué te ha dicho el cliente, la siguiente acción o cambia el estado.');
        guardar.disabled = true;
        try {
          const r = await api.visitaApunte({id: v.id, nota: nota.value, fecha: fNota.value, siguiente: accion.value, siguiente_fecha: fAcc.value, estado});
          Object.assign(v, r.visita);
          aviso('Apuntado en la ficha del cliente.');
          poner(cuerpo, ...contenido());
          refrescarCabecera();
        } catch (e) { avisoError(e); guardar.disabled = false; }
      }}, 'Guardar');

      const ult = v.ultimo;
      return [
        h('div.vis-cab',
          h('div.vis-hora', h('b', v.hora || '—'), h('small', fCorta(v.fecha))),
          h('div.vis-quien',
            h('a.vis-nombre', {href: '#cliente/' + encodeURIComponent(c.id), onclick: e => { e.preventDefault(); irFicha(); }}, c.nombre || 'Sin nombre'),
            h('a.vis-dir', {href: '#cliente/' + encodeURIComponent(c.id), onclick: e => { e.preventDefault(); irFicha(); }},
              [c.direccion, c.municipio].filter(Boolean).join(' · ') || 'Sin dirección'),
            h('div.vis-tecs', tecnologias(v.tecnologia),
              direccion ? h('span.vis-com', api.nombrePersona(v.comercial_id)) : null)),
          c.telefono ? h('a.btn.vis-tel', {href: telHref(c.telefono), title: 'Llamar'}, '☎') : null),
        pasos,
        ult ? h('div.vis-ultimo',
          h('span.vis-ult-f', fCorta(ult.fecha)), ' ', ult.nota || '—',
          ult.proximo_paso ? h('div.vis-ult-acc', '→ ' + ult.proximo_paso + (ult.proxima_fecha ? ' · ' + fCorta(ult.proxima_fecha) : '')) : null) : null,
        h('div.vis-form',
          h('div.vis-fila', nota, h('label.vis-lbl', 'Fecha', fNota)),
          h('div.vis-fila', accion, h('label.vis-lbl', 'Para el', fAcc)),
          h('div.vis-fila.fin', h('label.vis-lbl.ancho', 'Estado de la operación', sel), guardar))
      ];
    }
    poner(cuerpo, ...contenido());
    return cuerpo;
  }

  let cab = null;
  function refrescarCabecera() { if (cab) cab.replaceWith(cab = resumen()); }

  function pinta() {
    const filtro = (FILTROS.find(f => f[0] === ver) || FILTROS[0])[2];
    const vis = lista.filter(filtro);
    cab = resumen();
    const chips = h('div.vis-filtros', FILTROS.map(([id, et, fn]) => {
      const n = lista.filter(fn).length;
      return h('button.vis-chip' + (ver === id ? '.activo' : ''), {type: 'button', onclick: () => {
        ver = id; try { localStorage.setItem(K_VER, id); } catch (e) { /* nada */ } pinta();
      }}, et, h('span', String(n)));
    }));
    let selCom = null;
    if (direccion) {
      const comerciales = (api.estado.usuarios || []).filter(u => ['comercial', 'admin', 'superadmin'].includes(u.rol) || u.rol === 'comercial');
      selCom = h('select.vis-sel.com', {onchange: e => { comercial = e.target.value; poner(caja, cargando('Cargando visitas…')); cargar(); }},
        h('option', {value: ''}, 'Todos los comerciales'),
        comerciales.map(u => h('option', {value: u.id, selected: String(u.id) === String(comercial) ? true : null}, u.nombre)));
    }
    const grupos = [];
    let dia = null;
    vis.forEach(v => {
      const d = txt(v.fecha).slice(0, 10);
      if (d !== dia) { dia = d; grupos.push(h('h3.vis-dia', cabeceraDia(d))); }
      grupos.push(tarjetaVisita(v));
    });
    poner(caja,
      h('p.nota.vis-intro', 'Tus visitas de las dos últimas semanas, la más nueva arriba. Marca con un toque si hubo sentada, si el proyecto está hecho y si se lo has enviado, y apunta qué te ha dicho el cliente. Pulsa en el nombre o en la dirección para abrir su ficha.'),
      cab,
      h('div.vis-barra-filtros', chips, selCom),
      vis.length ? h('div.vis-lista', grupos) : h('p.nota.vis-vacio', lista.length ? 'Nada pendiente en este filtro. ¡Bien!' : 'No tienes visitas en las dos últimas semanas.'));
  }

  cargar();
  return caja;
}
