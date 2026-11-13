/* vistas/clientes.js — listado de clientes y ficha completa. */

import {veVisor} from './visor3d.js';
import {veCotizador} from './cotizador.js';
import {h, poner, txt, num, eur, eur2, miles, pct, fechaCorta, fechaLarga, haceDias,
        normal, telHref, waHref, mapsHref, comoLlegarHref, destinoDe, suma, hoyISO,
        etiquetaCliente, recortar} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventanaFormulario, ventana,
        aviso, avisoError, confirmar, filtros} from '../ui.js';
import {editorOperacion, tarjetaOperacion} from './operaciones.js';
import {panelProyecto} from './proyecto.js';
import {panelInstaladores, veSubcontratas} from './subcontratas.js';
import {panelFicha} from './ficha.js';
import {avisoDuplicadoVivo, ventanaYaExiste, duplicadoLocal, faltaPorMeter, menuApuntar, panelHistorial, panelCambios,
        panelCitas, sucesosDe, ventanaRepetidos, CAMPOS_VIVIENDA, CAMPOS_CONTACTO} from './ficha-cliente.js';

/* ---------- campos del formulario de cliente ---------- */
export const camposCliente = () => [
  {separador: 'Quién es'},
  {id: 'nombre', et: 'Nombre y apellidos', requerido: true, ancho: 2},
  {id: 'dni', et: 'DNI / NIE'},
  {id: 'cotitular', et: 'Cotitular'},
  {id: 'telefono', et: 'Teléfono', tipo: 'tel'},
  {id: 'email', et: 'Correo', tipo: 'email'},

  {separador: 'Dónde vive'},
  {id: 'direccion', et: 'Dirección', ancho: 2},
  {id: 'municipio', et: 'Municipio'},
  {id: 'cp', et: 'Código postal'},
  {id: 'coordenadas', et: 'Coordenadas (lat,lng)', ayuda: 'Se copian de Google Maps'},
  {id: 'tipo_vivienda', et: 'Tipo de vivienda', tipo: 'select',
   opciones: ['Chalet', 'Adosado', 'Pareado', 'Piso', 'Casa de pueblo', 'Nave', 'Local', 'Otro']},
  {id: 'regimen', et: 'Régimen', tipo: 'select', opciones: ['Propietario', 'Inquilino', 'En venta']},
  {id: 'm2', et: 'Superficie (m²)', tipo: 'numero'},
  {id: 'personas', et: 'Personas en casa', tipo: 'numero'},
  {id: 'anyo', et: 'Año de construcción'},

  {separador: 'Qué gasta hoy'},
  {id: 'calefaccion', et: 'Calefacción actual', tipo: 'select',
   opciones: ['Gasóleo', 'Gas natural', 'Propano', 'Eléctrica', 'Biomasa', 'Bomba de calor', 'Sin calefacción']},
  {id: 'gasto_combustible', et: 'Gasto en combustible (€)', tipo: 'euro'},
  {id: 'periodo_combustible', et: 'Periodo', tipo: 'select', opciones: ['al año', 'al mes', 'por depósito']},
  {id: 'gasto_luz_mes', et: 'Gasto de luz (€/mes)', tipo: 'euro'},
  {id: 'comercializadora', et: 'Comercializadora'},
  {id: 'cups', et: 'CUPS'},
  {id: 'potencia_contratada', et: 'Potencia contratada (kW)', tipo: 'numero', paso: '0.01'},
  {id: 'ya_fv', et: '¿Tiene ya fotovoltaica?', tipo: 'select',
   opciones: ['No', 'Sí, quiere ampliar', 'Sí, completa']},

  {separador: 'Comercial'},
  {id: 'estado', et: 'Estado', tipo: 'select', opciones: api.opciones('estadosCliente'), vacio: false},
  {id: 'origen', et: 'Origen', tipo: 'select', opciones: api.opciones('origenes')},
  {id: 'interes', et: 'Interés (1-10)', tipo: 'numero', min: 1, max: 10},
  {id: 'proxima_accion', et: 'Próxima acción'},
  {id: 'proxima_fecha', et: 'Fecha de la próxima acción', tipo: 'fecha'},
  {id: 'perfil', et: 'Perfil del cliente', tipo: 'area', ancho: 3},
  {id: 'otros', et: 'Otros datos de interés', tipo: 'area', ancho: 3}
];

const camposAsignacion = () => api.puede('editarTodo') ? [
  {separador: 'Asignación'},
  {id: 'comercial_id', et: 'Comercial', tipo: 'select',
   opciones: api.estado.usuarios.filter(u => ['comercial', 'admin', 'superadmin'].includes(u.rol))
     .map(u => [u.id, u.nombre])},
  {id: 'captador_id', et: 'Captador', tipo: 'select',
   opciones: api.estado.usuarios.filter(u => u.rol === 'captador').map(u => [u.id, u.nombre])}
] : [];

/* Un solo formulario de cliente para todo; `solo` lo recorta a una parte
   (contacto, vivienda…) para no tener que bajar por cuarenta campos. */
export function editorCliente(cliente, alTerminar, {solo, titulo, ir} = {}) {
  let campos = camposCliente().concat(camposAsignacion());
  if (solo) {
    campos = campos.filter(x => !x.separador && solo.includes(x.id));
  }
  const extra = h('div');
  let vf;
  const guardar = async (datos, forzar) => {
    if (cliente && cliente.id) datos.id = cliente.id;
    if (forzar) datos.forzar = true;
    const r = await api.guardarCliente(datos);
    aviso('Cliente guardado.');
    if (r.duplicado) aviso('Ojo: con ese ' + r.duplicado.por + ' ya hay otra ficha (' + r.duplicado.etiqueta + ', ' +
      r.duplicado.id + '). Dirección puede fusionarlas desde Clientes › Fichas repetidas.', 'error');
    await alTerminar(r.cliente);
  };
  vf = ventanaFormulario({
    titulo: titulo || (cliente && cliente.id ? 'Editar ' + etiquetaCliente(cliente) : 'Nuevo cliente'),
    ancha: !solo || solo.length > 6,
    campos,
    valores: cliente || {estado: 'nuevo', periodo_combustible: 'al año', municipio: ''},
    extra,
    alGuardar: async datos => {
      try { await guardar(datos); }
      catch (e) {
        if (ventanaYaExiste(e, {ir, forzar: async () => { await guardar(datos, true); vf.ventana.cerrar(); }})) {
          const err = new Error('No guardado: ese cliente ya existe.'); throw err;
        }
        throw e;
      }
    }
  });
  if (!solo || solo.includes('telefono') || solo.includes('direccion')) {
    /* Arriba del todo, que se vea en cuanto se escribe el teléfono. */
    vf.formulario.nodo.prepend(avisoDuplicadoVivo(vf.formulario, {salvoId: cliente && cliente.id,
      alAbrir: ir ? id => { vf.ventana.cerrar(); ir('cliente/' + id); } : null}));
  }
  return vf;
}

/* ---------- gasto anual estimado ---------- */
export function gastoAnual(c) {
  const luz = num(c.gasto_luz_mes) * 12;
  const comb = num(c.gasto_combustible);
  const p = normal(c.periodo_combustible);
  const anual = p === 'al mes' ? comb * 12 : (p.startsWith('por dep') ? comb * 2 : comb);
  return Math.round(luz + anual);
}

/* ---------- lo que se mira de la última instalación ---------- */

/* La operación que manda es la más reciente: firma, propuesta o alta. */
export function ultimaOperacion(c) {
  const fecha = o => txt(o.fecha_firma) || txt(o.fecha_propuesta) || txt(o.creado);
  return api.operacionesDe(c.id).slice()
    .sort((a, b) => fecha(b).localeCompare(fecha(a)))[0] || null;
}

const GRUPO_TIPO = {fv: 'fv', aero: 'aero', fv_aero: 'fv_aero'};
export const tipoInstalacion = c => {
  const o = ultimaOperacion(c);
  return o ? (GRUPO_TIPO[normal(o.tipo)] || 'otro') : '';
};

/* Firmada en adelante, la financiera ya ha dicho que sí; antes (propuesta
   o financiación en estudio) está pendiente de su respuesta. */
const ESTADOS_APROBADA = ['firmada', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];
export const PAGOS = [
  ['aprobada', 'Financiación aprobada', 'bien'],
  ['pendiente', 'Financiación pendiente', 'aviso'],
  ['contado', 'Contado', 'info'],
  ['sin_definir', 'Forma de pago sin definir', ''],
  ['sin', 'Sin operación', '']
];
export function pagoDe(c) {
  const o = ultimaOperacion(c);
  if (!o) return {clave: 'sin', texto: 'Sin operación', clase: ''};
  const forma = normal(o.forma_pago);
  const financiada = forma === 'financiado' || (!!txt(o.financiera) && forma !== 'contado');
  if (!financiada) return forma === 'contado'
    ? {clave: 'contado', texto: 'Contado', clase: 'info'}
    : {clave: 'sin_definir', texto: 'Sin definir', clase: ''};
  const fin = txt(o.financiera);
  const estado = normal(o.estado);
  if (estado === 'cancelada') return {clave: 'cancelada', texto: 'Financiación cancelada', clase: 'mal', financiera: fin};
  if (ESTADOS_APROBADA.includes(estado)) return {clave: 'aprobada', texto: 'Financiación aprobada', clase: 'bien', financiera: fin};
  return {clave: 'pendiente', texto: 'Financiación pendiente', clase: 'aviso', financiera: fin};
}

/* Una visita (cita de captación) de hoy en adelante que nadie ha confirmado. */
export const visitaSinConfirmar = c => api.estado.captaciones.some(k =>
  String(k.cliente_id) === String(c.id) && txt(k.fecha) >= hoyISO() &&
  normal(k.estado_cita) !== 'confirmada');

/* ---------- comentarios propios ---------- */
/* Cada comercial deja su comentario sobre el cliente y sale en el listado.
   Se guarda como un apunte de seguimiento con origen «comentario»: así no
   hace falta tocar el servidor, no pisa ningún campo del cliente y queda
   quién lo escribió y cuándo. Cada uno edita el suyo. */
export const comentariosDe = c => api.estado.seguimiento
  .filter(s => String(s.cliente_id) === String(c.id) && txt(s.origen) === 'comentario')
  .sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha)) ||
                  txt(b.creado).localeCompare(txt(a.creado)));
export const ultimoComentario = c => comentariosDe(c)[0] || null;
const miComentario = c => comentariosDe(c)
  .find(s => String(s.usuario_id) === String((api.estado.usuario || {}).id)) || null;

export function editarComentario(c, alTerminar) {
  const mio = miComentario(c);
  return ventanaFormulario({
    titulo: 'Tu comentario · ' + etiquetaCliente(c),
    campos: [{id: 'nota', et: 'Comentario', tipo: 'area', ancho: 3, requerido: true, filas: 4,
      pista: 'Lo que el equipo tiene que saber de este cliente, en dos líneas.',
      ayuda: 'Sale en el listado de clientes. Cada comercial tiene el suyo y lo puede cambiar cuando quiera.'}],
    valores: {nota: mio ? txt(mio.nota) : ''},
    textoBoton: mio ? 'Guardar cambios' : 'Guardar comentario',
    alGuardar: async datos => {
      const r = await api.guardarSeguimiento(mio
        ? {id: mio.id, cliente_id: c.id, nota: datos.nota, fecha: hoyISO()}
        : {cliente_id: c.id, canal: 'otro', origen: 'comentario', fecha: hoyISO(), nota: datos.nota});
      /* Se apunta en local para no recargar todo y perder los filtros. */
      const fila = Object.assign({}, mio || {}, r.seguimiento || {},
        {origen: 'comentario', nota: datos.nota, fecha: hoyISO()});
      const lista = api.estado.seguimiento;
      const i = lista.findIndex(s => String(s.id) === String(fila.id));
      if (i >= 0) lista[i] = fila; else lista.push(fila);
      aviso('Comentario guardado.');
      if (alTerminar) await alTerminar(fila);
    }
  });
}

/* En el listado sale el último comentario de cada persona (como mucho
   tres), el tuyo primero: así nadie tapa lo que ha escrito otro. */
export function comentariosPorPersona(c) {
  const yo = String((api.estado.usuario || {}).id);
  const vistos = new Set();
  return comentariosDe(c).filter(s => {
    const k = String(s.usuario_id);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).sort((a, b) => (String(b.usuario_id) === yo) - (String(a.usuario_id) === yo));
}

const celdaComentario = (c, alCambiar) => {
  const lista = comentariosPorPersona(c);
  return h('div', {estilo: {minWidth: '170px', maxWidth: '280px'}},
    lista.length ? lista.slice(0, 3).map(u => h('div', {title: txt(u.nota), estilo: {marginBottom: '3px'}},
      h('span', recortar(u.nota, 90)),
      h('div.nota', api.nombrePersona(u.usuario_id) + ' · ' + fechaCorta(u.fecha))))
      : h('span.nota', 'Sin comentario'),
    lista.length > 3 ? h('div.nota', '+' + (lista.length - 3) + ' más en la ficha') : null,
    h('button.btn.mini.plano', {estilo: {padding: '2px 6px', marginTop: '2px'},
      onclick: e => { e.stopPropagation(); editarComentario(c, alCambiar); }}, '✎ Comentario'));
};

/* ================= listado ================= */
export async function vistaClientes({ir, refrescar}) {
  const caja = h('div');
  const estado = {texto: '', estado: '', municipio: '', persona: '', tipo: '', pago: '', estado_op: '',
                  visita: '', orden: 'reciente'};

  const municipios = [...new Set(api.estado.clientes.map(c => txt(c.municipio)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  const f = filtros([
    {id: 'texto', et: 'Buscar por nombre, dirección, teléfono, comentario…'},
    {id: 'estado', tipo: 'select', opciones: [['', 'Todos los estados']].concat(api.opciones('estadosCliente'))},
    {id: 'municipio', tipo: 'select', opciones: [['', 'Todos los municipios']].concat(municipios)},
    ...(api.esDireccion() ? [{id: 'persona', tipo: 'select',
      opciones: [['', 'Todos los comerciales']].concat(api.estado.usuarios.map(u => [u.id, u.nombre]))}] : []),
    {id: 'tipo', tipo: 'select', opciones: [['', 'Cualquier instalación'], ['fv', 'Fotovoltaica'],
      ['aero', 'Aerotermia'], ['fv_aero', 'FV + aerotermia'], ['otro', 'Otra instalación'],
      ['ninguna', 'Sin instalación']]},
    {id: 'pago', tipo: 'select', opciones: [['', 'Cualquier forma de pago']]
      .concat(PAGOS.map(([v, e]) => [v, e]))},
    {id: 'estado_op', tipo: 'select', opciones: [['', 'Cualquier estado de operación']]
      .concat(api.opciones('estadosOperacion'))},
    {id: 'visita', tipo: 'select', opciones: [['', 'Todas las visitas'],
      ['sin_confirmar', 'Con visita sin confirmar']]},
    ...(api.puede('editarTodo') ? [{tipo: 'boton', et: '⧉ Fichas repetidas',
     accion: () => ventanaRepetidos({ir, refrescar})}] : []),
    {tipo: 'boton', et: '+ Nuevo cliente', clase: 'primario',
     accion: () => editorCliente(null, async c => { await refrescar(); ir('cliente/' + c.id); }, {ir})}
  ], v => { Object.assign(estado, v); pinta(); });

  const contenedor = h('div');

  function filtrar() {
    const q = normal(estado.texto);
    return api.estado.clientes.filter(c => {
      if (estado.estado && txt(c.estado) !== estado.estado) return false;
      if (estado.municipio && txt(c.municipio) !== estado.municipio) return false;
      if (estado.persona && txt(c.comercial_id) !== estado.persona && txt(c.captador_id) !== estado.persona) return false;
      if (estado.tipo) {
        const t = tipoInstalacion(c);
        if (estado.tipo === 'ninguna' ? t !== '' : t !== estado.tipo) return false;
      }
      if (estado.pago && pagoDe(c).clave !== estado.pago) return false;
      if (estado.estado_op) {
        const o = ultimaOperacion(c);
        if (!o || normal(o.estado) !== estado.estado_op) return false;
      }
      if (estado.visita === 'sin_confirmar' && !visitaSinConfirmar(c)) return false;
      if (!q) return true;
      return [c.nombre, c.direccion, c.municipio, c.telefono, c.email, c.id, c.perfil,
              ...comentariosDe(c).map(s => s.nota)]
        .some(x => normal(x).includes(q));
    }).sort((a, b) => txt(b.modificado || b.creado).localeCompare(txt(a.modificado || a.creado)));
  }

  function pinta() {
    const lista = filtrar();
    const porEstado = {};
    lista.forEach(c => { porEstado[txt(c.estado)] = (porEstado[txt(c.estado)] || 0) + 1; });

    const t = tabla([
      {clave: 'nombre', et: 'Cliente', valor: c => etiquetaCliente(c), pinta: c => h('div',
        h('b', etiquetaCliente(c)),
        h('div.nota', [txt(c.municipio), txt(c.telefono)].filter(Boolean).join(' · ') || '—'),
        visitaSinConfirmar(c) ? h('div', {estilo: {marginTop: '3px'}}, marca('VISITA NO CONFIRMADA', 'mal')) : null)},
      {clave: 'estado', et: 'Estado', pinta: c => etiquetaEstado(c.estado,
        api.etiquetaCatalogo('estadosCliente', c.estado))},
      {clave: 'interes', et: 'Interés', num: true, valor: c => num(c.interes),
       pinta: c => num(c.interes) ? num(c.interes) + '/10' : '—'},
      {clave: 'gasto', et: 'Gasto anual', num: true, valor: c => gastoAnual(c),
       pinta: c => gastoAnual(c) ? eur(gastoAnual(c)) : '—'},
      {clave: 'operacion', et: 'Instalación', valor: c => {
        const o = ultimaOperacion(c);
        return o ? api.etiquetaCatalogo('tiposOperacion', o.tipo) : '';
      }, pinta: c => {
        const o = ultimaOperacion(c);
        if (!o) return '—';
        return h('div', h('span', api.etiquetaCatalogo('tiposOperacion', o.tipo)),
          h('div.nota', eur(o.total) + ' · ' + api.etiquetaCatalogo('estadosOperacion', o.estado)));
      }},
      {clave: 'pago', et: 'Pago', valor: c => pagoDe(c).texto, pinta: c => {
        const p = pagoDe(c);
        if (p.clave === 'sin') return '—';
        return h('div', marca(p.texto, p.clase), p.financiera ? h('div.nota', p.financiera) : null);
      }},
      ...(api.esDireccion() ? [{clave: 'comercial', et: 'Comercial',
        valor: c => api.nombrePersona(c.comercial_id)}] : []),
      {clave: 'proxima', et: 'Próximo paso', valor: c => txt(c.proxima_fecha),
       pinta: c => txt(c.proxima_fecha)
         ? h('div', h('span', {estilo: txt(c.proxima_fecha) < hoyISO() ? {color: 'var(--mal)', fontWeight: '600'} : null},
             fechaCorta(c.proxima_fecha)), h('div.nota', txt(c.proxima_accion)))
         : '—'},
      {clave: 'comentario', et: 'Comentario', valor: c => comentariosPorPersona(c).map(s => txt(s.nota)).join(' | '),
       pinta: c => celdaComentario(c, () => pinta())},
      {clave: 'modificado', et: 'Actividad', valor: c => txt(c.modificado || c.creado),
       pinta: c => h('span.nota', haceDias(txt(c.modificado || c.creado).slice(0, 10)))}
    ], lista, {
      alPulsar: c => ir('cliente/' + c.id),
      vacio: 'No hay clientes con esos filtros.',
      csv: 'clientes_zerowattios.csv'
    });

    poner(contenedor,
      kpis(
        kpi('Clientes', miles(lista.length), api.esDireccion() ? 'en total' : 'tuyos'),
        kpi('En marcha', miles(lista.filter(c => !['ganado', 'perdido'].includes(txt(c.estado))).length),
          'sin cerrar'),
        kpi('Ganados', miles(porEstado.ganado || 0), 'instalaciones vendidas', {estado: 'bien'}),
        kpi('Gasto medio', eur(lista.length ? suma(lista, gastoAnual) / lista.length : 0), 'energía al año')
      ),
      tarjeta(miles(lista.length) + ' cliente(s)', t, {
        sinRelleno: true,
        acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]
      }));
  }

  pinta();
  return poner(caja, f.nodo, contenedor);
}

/* ================= ficha ================= */
export async function vistaCliente({id, ir, refrescar}) {
  const c = api.cliente(id);
  if (!c) return h('.tarjeta', h('.cuerpo', h('h2', 'Este cliente no está en tu cartera'),
    h('p.nota', 'O lo lleva otra persona, o se ha borrado.'),
    h('button.btn', {onclick: () => ir('clientes')}, 'Volver a clientes')));

  const ops = api.operacionesDe(c.id);
  const seg = api.seguimientoDe(c.id);
  const contactos = seg.filter(s => txt(s.origen) !== 'comentario');
  const citas = api.captacionesDe(c.id);
  const total = suma(ops, 'total');

  const pestanas = h('.pestanas');
  const panel = h('div');
  const botones = {};
  const abrir = clave => { if (botones[clave]) botones[clave].click(); };

  /* Todo lo que se apunta sale de aquí y vuelve a esta misma ficha. */
  const acc = {
    contacto: () => nuevoSeguimiento(c, refrescar),
    comentario: () => editarComentario(c, async () => { await refrescar(); }),
    cita: () => import('./citas.js').then(m => m.nuevaCita({refrescar, clienteId: c.id})),
    instalacion: () => editorOperacion(null, c, async () => { await refrescar(); }),
    visita: () => { location.hash = '#visita/' + c.id; },
    contactoDatos: () => editorCliente(c, async () => { await refrescar(); },
      {solo: CAMPOS_CONTACTO, titulo: 'Contacto y dirección · ' + etiquetaCliente(c), ir}),
    vivienda: () => editorCliente(c, async () => { await refrescar(); },
      {solo: CAMPOS_VIVIENDA, titulo: 'Vivienda y consumo · ' + etiquetaCliente(c), ir}),
    todo: () => editorCliente(c, async () => { await refrescar(); }, {ir})
  };
  const apuntar = () => menuApuntar(c, {contacto: acc.contacto, comentario: acc.comentario, cita: acc.cita,
    instalacion: acc.instalacion, visita: acc.visita});

  const cabecera = h('.cabecera-ficha',
    h('.quien',
      /* Primero la calle y debajo el nombre, como se nombra a los clientes en todo el CRM. */
      txt(c.direccion) ? h('div.senas', {estilo: {fontSize: '14px'}},
        [txt(c.direccion), txt(c.municipio)].filter(Boolean).join(', ')) : null,
      h('h1', c.nombre),
      h('div.acciones', {estilo: {marginTop: '6px'}},
        etiquetaEstado(c.estado, api.etiquetaCatalogo('estadosCliente', c.estado)),
        txt(c.municipio) ? marca(c.municipio) : null,
        txt(c.origen) ? marca(api.etiquetaCatalogo('origenes', c.origen)) : null,
        num(c.interes) ? marca('Interés ' + num(c.interes) + '/10',
          num(c.interes) >= 8 ? 'bien' : (num(c.interes) <= 4 ? 'mal' : 'aviso')) : null,
        h('span.nota', c.id + ' · alta ' + fechaCorta(c.creado)))),
    h('.acciones',
      txt(c.telefono) ? h('a.btn', {href: telHref(c.telefono)}, '☎ Llamar') : null,
      txt(c.telefono) ? h('a.btn', {href: waHref(c.telefono), target: '_blank'}, 'WhatsApp') : null,
      txt(c.coordenadas) || txt(c.direccion)
        ? h('a.btn', {href: comoLlegarHref(destinoDe(c)), target: '_blank', rel: 'noopener'}, '🚗 Ir')
        : null,
      h('button.btn', {onclick: acc.visita}, '📋 Modo visita'),
      veVisor() && (txt(c.coordenadas) || txt(c.direccion))
        ? h('button.btn', {onclick: () => ir('visor/' + encodeURIComponent(c.id)), title: 'Casa en 3D con el tejado, las placas y la aerotermia'}, '⌂ Visor 3D')
        : null,
      h('button.btn', {onclick: () => ir('avisar/' + encodeURIComponent(c.id)), title: 'Avisar a dirección de un problema con este cliente'}, '⚠ Incidencia'),
      h('button.btn.primario', {onclick: apuntar}, '+ Apuntar')));

  const tabs = [
    ['resumen', 'Resumen', () => panelResumen(c, ops, seg, refrescar, {acc, abrir, ir})],
    ['historial', 'Historial (' + sucesosDe(c).length + ')', () => h('div', panelHistorial(c, {apuntar}), panelCambios(c))],
    ['citas', 'Citas (' + citas.length + ')', () => panelCitas(c, {refrescar, nuevaCita: acc.cita})],
    ['vivienda', 'Vivienda y consumo', () => panelVivienda(c, acc.vivienda)],
    ['dimensionado', 'Ficha de dimensionado', () => panelFicha(c)],
    ['proyecto', 'Proyecto', () => panelProyecto(c)],
    veCotizador() && ['cotizar', 'Cotizar', () => { const caja = h('div', h('p.nota', 'Cargando el cotizador…'));
      import('./cotizador.js').then(m => m.vistaCotizador({id: c.id})).then(n => poner(caja, n))
        .catch(e => poner(caja, h('p.nota', 'No se ha podido abrir el cotizador: ' + e.message))); return caja; }],
    veVisor() && ['simulacion', 'Simulación 3D', () => { const caja = h('div', h('p.nota', 'Cargando la simulación…'));
      import('./visor3d.js').then(m => m.vistaVisor3d({id: c.id, embebido: true})).then(n => poner(caja, n))
        .catch(e => poner(caja, h('p.nota', 'No se ha podido abrir la simulación: ' + e.message))); return caja; }],
    ['instalaciones', 'Instalaciones (' + ops.length + ')', () => panelOperaciones(c, ops, refrescar, acc.instalacion)],
    veSubcontratas() && ['instaladores', 'Instaladores', () => panelInstaladores(c, ir)]
  ].filter(Boolean);
  tabs.forEach(([clave, nombre, pinta], i) => {
    const b = h('button', {onclick: () => {
      pestanas.querySelectorAll('button').forEach(x => x.classList.remove('activa'));
      b.classList.add('activa');
      poner(panel, pinta());
    }}, nombre);
    botones[clave] = b;
    if (!i) { b.classList.add('activa'); poner(panel, pinta()); }
    pestanas.appendChild(b);
  });
  botones.apuntar = {click: apuntar};

  return h('div',
    h('button.btn.plano', {estilo: {marginBottom: '8px'}, onclick: () => ir('clientes')}, '← Clientes'),
    cabecera,
    kpis(
      kpi('Instalaciones', miles(ops.length), ops.length ? api.etiquetaCatalogo('tiposOperacion', ops[0].tipo) : 'ninguna'),
      kpi('Importe', eur(total), 'IVA incluido'),
      kpi('Gasto energético', eur(gastoAnual(c)), 'al año, antes de instalar'),
      kpi('Último contacto', contactos.length ? haceDias(contactos[0].fecha) : '—',
        contactos.length ? api.etiquetaCatalogo('canales', contactos[0].canal) : 'sin apuntes'),
      kpi('Próximo paso', txt(c.proxima_fecha) ? fechaCorta(c.proxima_fecha) : '—',
        txt(c.proxima_accion) || 'sin definir',
        {estado: txt(c.proxima_fecha) && txt(c.proxima_fecha) < hoyISO() ? 'mal' : null})
    ),
    pestanas, panel);
}

const dato = (et, v) => h('.dato', h('.et', et), h('.v', v === '' || v === null || v === undefined ? '—' : v));

function panelResumen(c, ops, seg, refrescar, {acc, abrir, ir}) {
  const falta = faltaPorMeter(c, {editarContacto: acc.contactoDatos, editarVivienda: acc.vivienda,
    irA: k => k === 'apuntar' ? acc.contacto() : abrir(k)});
  const dup = duplicadoLocal(c, c.id);
  return h('div',
    dup ? h('.aviso-duplicado', {estilo: {marginBottom: '12px'}},
      h('b', '⚠ Posible ficha repetida: '), 'mismo ' + dup.por + ' que ' + etiquetaCliente(dup.cliente) + ' (' + dup.cliente.id + ').',
      h('.acciones', {estilo: {marginTop: '6px'}},
        h('button.btn.mini', {onclick: () => ir('cliente/' + dup.cliente.id)}, 'Ver la otra'),
        api.puede('editarTodo') ? h('button.btn.mini', {onclick: () => ventanaRepetidos({ir, refrescar})}, 'Fusionar') : null,
        api.puede('editarTodo') ? null : h('span.nota', 'Avisa a dirección para que las fusione.'))) : null,
    falta.length ? tarjeta('Falta por meter (' + falta.length + ')', h('.acciones',
      falta.map(([et, fn]) => h('button.btn.mini', {onclick: fn}, '+ ' + et))),
      {subtitulo: 'Pulsa y se abre justo donde va. Con esto la propuesta sale sin pedir nada más.'}) : null,
    h('.doble',
    tarjeta('Datos de contacto', h('div',
      dato('Nombre', c.nombre),
      dato('DNI', c.dni),
      dato('Cotitular', c.cotitular),
      dato('Teléfono', txt(c.telefono) ? h('a', {href: telHref(c.telefono)}, c.telefono) : ''),
      dato('Correo', txt(c.email) ? h('a', {href: 'mailto:' + c.email}, c.email) : ''),
      h('.dato', h('.et', 'Dirección'),
        h('.v', [c.direccion, c.municipio, c.cp].filter(Boolean).join(', ') || '—',
          txt(c.direccion) || txt(c.coordenadas)
            ? h('.acciones', {estilo: {marginTop: '8px'}},
                h('a.btn.mini.lima', {href: comoLlegarHref(destinoDe(c)), target: '_blank',
                  rel: 'noopener'}, '🚗 Ir en coche'),
                h('a.btn.mini', {href: mapsHref(destinoDe(c)), target: '_blank'}, 'Ver en el mapa'),
                veVisor() ? h('button.btn.mini', {onclick: () => ir('visor/' + encodeURIComponent(c.id))}, '⌂ Visor 3D') : null)
            : null)),
      dato('Coordenadas', txt(c.coordenadas)
        ? h('a', {href: mapsHref(c.coordenadas), target: '_blank'}, c.coordenadas) : ''),
      dato('Comercial', api.nombrePersona(c.comercial_id)),
      dato('Captador', txt(c.captador_id) ? api.nombrePersona(c.captador_id) : '')),
      {acciones: [h('button.btn.mini', {onclick: acc.contactoDatos}, 'Editar'),
                  h('button.btn.mini.plano', {onclick: acc.todo, title: 'Todos los datos del cliente'}, 'Todo')]}),
    h('div',
      tarjetaComentarios(c, refrescar),
      tarjeta('Perfil y notas', h('div',
        h('p', txt(c.perfil) || h('span.nota', 'Sin perfil apuntado.')),
        txt(c.otros) ? h('p.nota', c.otros) : null)),
      tarjeta('Últimos movimientos', (() => {
        const todos = sucesosDe(c).filter(e => e.fecha <= hoyISO());
        const ev = todos.slice(0, 5);
        /* El captador (y por recomendación de quién) se queda siempre a la vista,
           con su fecha de inicio, aunque haya muchos movimientos después (12/11/2026). */
        todos.slice(5).filter(e => /^captador/i.test(txt(e.texto))).forEach(e => ev.push(e));
        return ev.length ? h('ul.linea-tiempo', ev.map(e => h('li',
          h('.cuando', fechaCorta(e.fecha) + ' · ' + e.titulo),
          e.texto ? h('.que', e.texto) : null, e.pie ? h('.nota', e.pie) : null)))
          : h('.vacio', 'Todavía no hay nada apuntado.');
      })(), {acciones: [h('button.btn.mini', {onclick: () => abrir('historial')}, 'Ver todo')]}),
      tarjetaMonitorizacion(c))));
}

/* Monitorización SolaX Cloud (13/11/2026): última lectura diaria de la planta del cliente,
   generación acumulada, estado e incidencias/recomendaciones. Se carga aparte y solo se
   enseña si el cliente tiene planta en SolaX. */
function tarjetaMonitorizacion(c) {
  const caja = h('div', h('.vacio', 'Cargando la monitorización…'));
  const t = tarjeta('Monitorización SolaX', caja);
  t.style.display = 'none';
  api.pedir('monitorizacionCliente', {cliente_id: c.id}).then(r => {
    const L = (r && r.lecturas) || [];
    if (!L.length) return;
    t.style.display = '';
    const u = L[0], n = v => (v === '' || v === null || v === undefined) ? null : Number(v);
    const fmt = v => n(v) === null ? '—' : num(n(v)).toLocaleString('es-ES', {maximumFractionDigits: 1});
    /* 13/11/2026 (Nando): 7 y 30 días salían igual que «hoy» porque solo había una lectura.
       Se calcula con lecturas reales: diferencia de la producción total de SolaX entre la
       última lectura y la de hace N días (o suma diaria si faltan totales). Si el histórico
       aún no cubre el periodo, se dice desde cuándo hay datos en vez de inventar la cifra. */
    const dia0 = L[L.length - 1].fecha;
    const periodo = dias => {
      const lim = new Date(new Date(u.fecha + 'T12:00:00').getTime() - dias * 864e5).toISOString().slice(0, 10);
      const ant = L.filter(x => x.fecha <= lim);
      if (!ant.length) {
        const nd = new Set(L.map(x => x.fecha)).size;
        return {v: null, txt: 'aún sin datos suficientes · ' + nd + (nd === 1 ? ' día registrado' : ' días registrados') + ' (desde ' + fechaCorta(dia0) + ')'};
      }
      const enVentana = L.filter(x => x.fecha > lim && n(x.gen_dia) !== null);
      if (new Set(enVentana.map(x => x.fecha)).size >= dias) return {v: enVentana.reduce((a, x) => a + n(x.gen_dia), 0)};
      /* Faltan días (planta caída o sin revisión): diferencia de la producción total. */
      const ref = ant[0];
      if (n(u.gen_total) !== null && n(ref.gen_total) !== null && n(u.gen_total) >= n(ref.gen_total))
        return {v: n(u.gen_total) - n(ref.gen_total)};
      return {v: enVentana.reduce((a, x) => a + n(x.gen_dia), 0)};
    };
    const p7 = periodo(7), p30 = periodo(30);
    const ok = /normal/i.test(u.estado);
    const kwp = n(u.kwp);
    const esp = kwp && p30.v !== null ? p30.v / kwp : null;
    const conBat = n(u.bat_kwh) || n(u.carga_dia) || n(u.descarga_dia) || (n(u.soc) !== null && n(u.soc) > 0);
    poner(caja, h('div',
      h('p', h('b', ok ? '✓ ' : '⚠ '), h('b', u.estado || 'sin estado'), u.red ? ' · ' + u.red : '',
        h('span.nota', ' · lectura del ' + fechaCorta(u.fecha) + (u.planta ? ' · planta «' + u.planta + '»' : ''))),
      dato('Generación hoy', fmt(u.gen_dia) + ' kWh'),
      dato('Últimos 7 días', p7.v === null ? p7.txt : fmt(p7.v) + ' kWh'),
      dato('Últimos 30 días', p30.v === null ? p30.txt : fmt(p30.v) + ' kWh' + (esp ? ' · ' + fmt(esp) + ' kWh/kWp' : '')),
      (n(u.carga_dia) || n(u.descarga_dia)) ? dato('Batería hoy', 'carga ' + fmt(u.carga_dia) + ' kWh · descarga ' + fmt(u.descarga_dia) + ' kWh') : null,
      dato('Instalación', [kwp ? fmt(kwp) + ' kWp' : 'kWp sin configurar en SolaX',
        n(u.bat_kwh) ? fmt(u.bat_kwh) + ' kWh de batería' : (conBat ? 'con batería (capacidad sin configurar en SolaX)' : 'sin batería')].join(' · ')),
      n(u.consumo_dia) !== null ? dato('Consumo hoy', fmt(u.consumo_dia) + ' kWh' + (n(u.importado_dia) !== null ? ' · de la red ' + fmt(u.importado_dia) + ' kWh' : '')) : null,
      n(u.importado_mes) !== null ? dato('Importado de la red este mes', fmt(u.importado_mes) + ' kWh') : null,
      n(u.autoconsumo_mes) !== null ? dato('Producción solar usada en casa (mes)', fmt(u.autoconsumo_mes) + ' %') : null,
      n(u.factura_mes_est) !== null ? dato('Factura de luz estimada este mes', fmt(u.factura_mes_est) + ' € (IVA incl.)' + (u.tarifa_luz ? ' · ' + u.tarifa_luz : '')) : null,
      n(u.gen_total) !== null ? dato('Producción total', fmt(u.gen_total) + ' kWh') : null,
      n(u.soc) !== null && conBat ? dato('Batería ahora', fmt(u.soc) + ' %') : null,
      equiposMon(u.datos),
      u.incidencia ? h('p', {estilo: {color: '#C0392B', margin: '8px 0 0'}}, '⚠ ' + u.incidencia) : null,
      u.recomendacion ? h('p.nota', {estilo: {margin: '6px 0 0'}}, '💡 ' + u.recomendacion) : null,
      L.filter(x => x.incidencia).length > 1 ? h('details', {estilo: {marginTop: '6px'}}, h('summary.nota', 'Incidencias anteriores'),
        h('ul.linea-tiempo', L.slice(1).filter(x => x.incidencia).slice(0, 8).map(x => h('li', h('.cuando', fechaCorta(x.fecha)), h('.que', x.incidencia))))) : null));
  }).catch(() => {});
  return t;
}

/* Equipos de la planta guardados desde SolaX: inversores, dongles y cargadores con modelo,
   número de serie, registro, potencia, estado y producción. */
function equiposMon(datos) {
  let d = null;
  try { d = typeof datos === 'string' ? JSON.parse(datos || 'null') : datos; } catch (e) { d = null; }
  if (!d) return null;
  const grupos = [['Inversores', d.inversores], ['Dongles', d.dongles], ['Cargadores EV', d.cargadores]].filter(g => g[1] && g[1].length);
  if (!grupos.length) return null;
  const linea = e => [e.modelo, e.sn ? 'SN ' + e.sn : '', e.registro ? 'registro ' + e.registro : '',
    e.potencia ? e.potencia + ' kW' : '', e.online, e.alarma ? 'alarma: ' + e.alarma : '',
    e.hoy !== undefined && e.hoy !== null && e.hoy !== '' ? 'hoy ' + e.hoy + ' kWh' : '',
    e.total !== undefined && e.total !== null && e.total !== '' ? 'total ' + e.total + ' kWh' : '',
    e.alta ? 'conectado desde ' + e.alta : ''].filter(Boolean).join(' · ');
  return h('details', {estilo: {marginTop: '8px'}}, h('summary.nota', 'Equipos instalados (SolaX)'),
    grupos.map(g => h('div', h('p', {estilo: {margin: '6px 0 2px'}}, h('b', g[0])),
      h('ul', {estilo: {margin: 0, paddingLeft: '18px'}}, g[1].map(e => h('li.nota', linea(e)))))));
}

function tarjetaComentarios(c, refrescar) {
  const lista = comentariosDe(c);
  return tarjeta('Comentarios del equipo',
    lista.length ? h('ul.linea-tiempo', lista.map(s => h('li',
      h('.cuando', api.nombrePersona(s.usuario_id) + ' · ' + fechaCorta(s.fecha)),
      h('.que', s.nota))))
      : h('.vacio', 'Nadie ha dejado todavía un comentario.'),
    {acciones: [h('button.btn.mini', {onclick: () => editarComentario(c, async () => { await refrescar(); })},
      '✎ Tu comentario')]});
}

function panelVivienda(c, editar) {
  return h('div',
    h('.acciones', {estilo: {marginBottom: '10px'}},
      h('button.btn.primario', {onclick: editar}, 'Editar vivienda y consumo'),
      h('span.nota', 'Son los mismos datos que usa la ficha de dimensionado: se cambian aquí o allí y se ven en los dos sitios.')),
    h('.doble',
    tarjeta('La vivienda', h('div',
      dato('Tipo', c.tipo_vivienda), dato('Régimen', c.regimen),
      dato('Superficie', num(c.m2) ? miles(c.m2) + ' m²' : ''),
      dato('Personas', c.personas), dato('Año', c.anyo),
      dato('¿Ya tiene fotovoltaica?', c.ya_fv))),
    tarjeta('Lo que gasta hoy', h('div',
      dato('Calefacción', c.calefaccion),
      dato('Combustible', num(c.gasto_combustible)
        ? eur(c.gasto_combustible) + ' ' + txt(c.periodo_combustible) : ''),
      dato('Luz', num(c.gasto_luz_mes) ? eur(c.gasto_luz_mes) + ' al mes' : ''),
      dato('Comercializadora', c.comercializadora),
      dato('CUPS', c.cups),
      dato('Potencia contratada', num(c.potencia_contratada) ? c.potencia_contratada + ' kW' : ''),
      h('.dato', h('.et', 'Gasto energético anual'),
        h('.v', h('b', {estilo: {fontSize: '17px'}}, eur(gastoAnual(c)))))))));
}

function panelOperaciones(c, ops, refrescar, nueva) {
  const boton = h('.acciones', {estilo: {marginBottom: '10px'}}, h('button.btn.primario', {onclick: nueva}, '+ Instalación'));
  if (!ops.length) return h('div', boton, h('.vacio', 'Este cliente no tiene ninguna instalación registrada.'));
  return h('div', boton, ops.map(o => tarjetaOperacion(o, c, refrescar)));
}

/* ---------- seguimiento ---------- */
export function nuevoSeguimiento(cliente, refrescar, operacionId) {
  return ventanaFormulario({
    titulo: 'Apuntar contacto con ' + cliente.nombre,
    campos: [
      {id: 'fecha', et: 'Fecha', tipo: 'fecha', requerido: true},
      {id: 'canal', et: 'Canal', tipo: 'select', opciones: api.opciones('canales'), vacio: false},
      {id: 'estado_resultante', et: 'Estado en el que queda', tipo: 'select',
       opciones: api.opciones('estadosCliente'), vacio: 'No cambiar'},
      {id: 'nota', et: '¿Qué ha pasado?', tipo: 'area', ancho: 3, requerido: true},
      {id: 'proximo_paso', et: 'Próximo paso', ancho: 2},
      {id: 'proxima_fecha', et: '¿Para cuándo?', tipo: 'fecha'}
    ],
    valores: {fecha: hoyISO(), canal: 'llamada', estado_resultante: '',
              proximo_paso: txt(cliente.proxima_accion)},
    alGuardar: async datos => {
      datos.cliente_id = cliente.id;
      if (operacionId) datos.operacion_id = operacionId;
      await api.guardarSeguimiento(datos);
      aviso('Contacto apuntado.');
      await refrescar();
    }
  });
}

function panelSeguimiento(c, seg, refrescar) {
  return tarjeta('Historial de contactos',
    seg.length ? h('ul.linea-tiempo', seg.map(s =>
      h('li',
        h('.cuando', fechaCorta(s.fecha) + ' · ' + api.etiquetaCatalogo('canales', s.canal) +
          ' · ' + api.nombrePersona(s.usuario_id) + (txt(s.origen) === 'parte' ? ' · desde el parte diario' : '') +
          (txt(s.origen) === 'comentario' ? ' · comentario' : '')),
        h('.que', s.nota),
        txt(s.proximo_paso) ? h('.nota', '→ ' + s.proximo_paso +
          (txt(s.proxima_fecha) ? ' · ' + fechaCorta(s.proxima_fecha) : '')) : null,
        txt(s.estado_resultante) ? h('div', {estilo: {marginTop: '4px'}},
          etiquetaEstado(s.estado_resultante, api.etiquetaCatalogo('estadosCliente', s.estado_resultante))) : null)))
      : h('.vacio', 'Sin contactos apuntados todavía.'),
    {acciones: [h('button.btn.mini.lima', {onclick: () => nuevoSeguimiento(c, refrescar)}, '+ Apuntar')]});
}
