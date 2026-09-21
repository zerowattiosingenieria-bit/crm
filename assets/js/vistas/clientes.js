/* vistas/clientes.js — listado de clientes y ficha completa. */

import {h, poner, txt, num, eur, eur2, miles, pct, fechaCorta, fechaLarga, haceDias,
        normal, telHref, waHref, mapsHref, suma, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventanaFormulario, ventana,
        aviso, avisoError, confirmar, filtros} from '../ui.js';
import {editorOperacion, tarjetaOperacion} from './operaciones.js';

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

export function editorCliente(cliente, alTerminar) {
  return ventanaFormulario({
    titulo: cliente && cliente.id ? 'Editar ' + cliente.nombre : 'Nuevo cliente',
    ancha: true,
    campos: camposCliente().concat(camposAsignacion()),
    valores: cliente || {estado: 'nuevo', periodo_combustible: 'al año', municipio: ''},
    alGuardar: async datos => {
      if (cliente && cliente.id) datos.id = cliente.id;
      const r = await api.guardarCliente(datos);
      aviso('Cliente guardado.');
      await alTerminar(r.cliente);
    }
  });
}

/* ---------- gasto anual estimado ---------- */
export function gastoAnual(c) {
  const luz = num(c.gasto_luz_mes) * 12;
  const comb = num(c.gasto_combustible);
  const p = normal(c.periodo_combustible);
  const anual = p === 'al mes' ? comb * 12 : (p.startsWith('por dep') ? comb * 2 : comb);
  return Math.round(luz + anual);
}

/* ================= listado ================= */
export async function vistaClientes({ir, refrescar}) {
  const caja = h('div');
  const estado = {texto: '', estado: '', municipio: '', persona: '', orden: 'reciente'};

  const municipios = [...new Set(api.estado.clientes.map(c => txt(c.municipio)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  const f = filtros([
    {id: 'texto', et: 'Buscar por nombre, dirección, teléfono…'},
    {id: 'estado', tipo: 'select', opciones: [['', 'Todos los estados']].concat(api.opciones('estadosCliente'))},
    {id: 'municipio', tipo: 'select', opciones: [['', 'Todos los municipios']].concat(municipios)},
    ...(api.esDireccion() ? [{id: 'persona', tipo: 'select',
      opciones: [['', 'Todo el equipo']].concat(api.estado.usuarios.map(u => [u.id, u.nombre]))}] : []),
    {tipo: 'boton', et: '+ Nuevo cliente', clase: 'primario',
     accion: () => editorCliente(null, async c => { await refrescar(); ir('cliente/' + c.id); })}
  ], v => { Object.assign(estado, v); pinta(); });

  const contenedor = h('div');

  function filtrar() {
    const q = normal(estado.texto);
    return api.estado.clientes.filter(c => {
      if (estado.estado && txt(c.estado) !== estado.estado) return false;
      if (estado.municipio && txt(c.municipio) !== estado.municipio) return false;
      if (estado.persona && txt(c.comercial_id) !== estado.persona && txt(c.captador_id) !== estado.persona) return false;
      if (!q) return true;
      return [c.nombre, c.direccion, c.municipio, c.telefono, c.email, c.id, c.perfil]
        .some(x => normal(x).includes(q));
    }).sort((a, b) => txt(b.modificado || b.creado).localeCompare(txt(a.modificado || a.creado)));
  }

  function pinta() {
    const lista = filtrar();
    const porEstado = {};
    lista.forEach(c => { porEstado[txt(c.estado)] = (porEstado[txt(c.estado)] || 0) + 1; });

    const t = tabla([
      {clave: 'nombre', et: 'Cliente', pinta: c => h('div',
        h('b', c.nombre),
        h('div.nota', txt(c.direccion) ? c.direccion + (c.municipio ? ' · ' + c.municipio : '') : (c.municipio || '—')))},
      {clave: 'estado', et: 'Estado', pinta: c => etiquetaEstado(c.estado,
        api.etiquetaCatalogo('estadosCliente', c.estado))},
      {clave: 'interes', et: 'Interés', num: true, valor: c => num(c.interes),
       pinta: c => num(c.interes) ? num(c.interes) + '/10' : '—'},
      {clave: 'gasto', et: 'Gasto anual', num: true, valor: c => gastoAnual(c),
       pinta: c => gastoAnual(c) ? eur(gastoAnual(c)) : '—'},
      {clave: 'operacion', et: 'Instalación', valor: c => {
        const ops = api.operacionesDe(c.id);
        return ops.length ? api.etiquetaCatalogo('tiposOperacion', ops[0].tipo) : '';
      }, pinta: c => {
        const ops = api.operacionesDe(c.id);
        if (!ops.length) return '—';
        const o = ops[0];
        return h('div', h('span', api.etiquetaCatalogo('tiposOperacion', o.tipo)),
          h('div.nota', eur(o.total)));
      }},
      ...(api.esDireccion() ? [{clave: 'comercial', et: 'Comercial',
        valor: c => api.nombrePersona(c.comercial_id)}] : []),
      {clave: 'proxima', et: 'Próximo paso', valor: c => txt(c.proxima_fecha),
       pinta: c => txt(c.proxima_fecha)
         ? h('div', h('span', {estilo: txt(c.proxima_fecha) < hoyISO() ? {color: 'var(--mal)', fontWeight: '600'} : null},
             fechaCorta(c.proxima_fecha)), h('div.nota', txt(c.proxima_accion)))
         : '—'},
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
  const cap = api.captacionDe(c.id);
  const total = suma(ops, 'total');

  const cabecera = h('.cabecera-ficha',
    h('.quien',
      h('h1', c.nombre),
      h('div.acciones', {estilo: {marginTop: '6px'}},
        etiquetaEstado(c.estado, api.etiquetaCatalogo('estadosCliente', c.estado)),
        txt(c.municipio) ? marca(c.municipio) : null,
        txt(c.origen) ? marca(api.etiquetaCatalogo('origenes', c.origen)) : null,
        num(c.interes) ? marca('Interés ' + num(c.interes) + '/10',
          num(c.interes) >= 8 ? 'bien' : (num(c.interes) <= 4 ? 'mal' : 'aviso')) : null,
        h('span.nota', 'Alta ' + fechaCorta(c.creado)))),
    h('.acciones',
      txt(c.telefono) ? h('a.btn', {href: telHref(c.telefono)}, '☎ Llamar') : null,
      txt(c.telefono) ? h('a.btn', {href: waHref(c.telefono), target: '_blank'}, 'WhatsApp') : null,
      txt(c.coordenadas) || txt(c.direccion)
        ? h('a.btn', {href: mapsHref(txt(c.coordenadas) || (c.direccion + ', ' + c.municipio)), target: '_blank'}, '◎ Mapa')
        : null,
      h('button.btn', {onclick: () => editorCliente(c, async () => { await refrescar(); })}, 'Editar'),
      h('button.btn.lima', {onclick: () => nuevoSeguimiento(c, refrescar)}, '+ Apuntar contacto'),
      h('button.btn.primario', {onclick: () => editorOperacion(null, c, async () => { await refrescar(); })},
        '+ Instalación')));

  const pestanas = h('.pestanas');
  const panel = h('div');
  const tabs = [
    ['Resumen', () => panelResumen(c, ops, seg)],
    ['Instalaciones (' + ops.length + ')', () => panelOperaciones(c, ops, refrescar)],
    ['Seguimiento (' + seg.length + ')', () => panelSeguimiento(c, seg, refrescar)],
    ['Vivienda y consumo', () => panelVivienda(c)],
    ...(cap ? [['Captación', () => panelCaptacion(cap)]] : [])
  ];
  tabs.forEach(([nombre, pinta], i) => {
    const b = h('button', {onclick: () => {
      pestanas.querySelectorAll('button').forEach(x => x.classList.remove('activa'));
      b.classList.add('activa');
      poner(panel, pinta());
    }}, nombre);
    if (!i) { b.classList.add('activa'); poner(panel, pinta()); }
    pestanas.appendChild(b);
  });

  return h('div',
    h('button.btn.plano', {estilo: {marginBottom: '8px'}, onclick: () => ir('clientes')}, '← Clientes'),
    cabecera,
    kpis(
      kpi('Instalaciones', miles(ops.length), ops.length ? api.etiquetaCatalogo('tiposOperacion', ops[0].tipo) : 'ninguna'),
      kpi('Importe', eur(total), 'IVA incluido'),
      kpi('Gasto energético', eur(gastoAnual(c)), 'al año, antes de instalar'),
      kpi('Último contacto', seg.length ? haceDias(seg[0].fecha) : '—',
        seg.length ? api.etiquetaCatalogo('canales', seg[0].canal) : 'sin apuntes'),
      kpi('Próximo paso', txt(c.proxima_fecha) ? fechaCorta(c.proxima_fecha) : '—',
        txt(c.proxima_accion) || 'sin definir',
        {estado: txt(c.proxima_fecha) && txt(c.proxima_fecha) < hoyISO() ? 'mal' : null})
    ),
    pestanas, panel);
}

const dato = (et, v) => h('.dato', h('.et', et), h('.v', v === '' || v === null || v === undefined ? '—' : v));

function panelResumen(c, ops, seg) {
  return h('.doble',
    tarjeta('Datos de contacto', h('div',
      dato('Nombre', c.nombre),
      dato('DNI', c.dni),
      dato('Cotitular', c.cotitular),
      dato('Teléfono', txt(c.telefono) ? h('a', {href: telHref(c.telefono)}, c.telefono) : ''),
      dato('Correo', txt(c.email) ? h('a', {href: 'mailto:' + c.email}, c.email) : ''),
      dato('Dirección', [c.direccion, c.municipio, c.cp].filter(Boolean).join(', ')),
      dato('Coordenadas', txt(c.coordenadas)
        ? h('a', {href: mapsHref(c.coordenadas), target: '_blank'}, c.coordenadas) : ''),
      dato('Comercial', api.nombrePersona(c.comercial_id)),
      dato('Captador', txt(c.captador_id) ? api.nombrePersona(c.captador_id) : ''))),
    h('div',
      tarjeta('Perfil y notas', h('div',
        h('p', txt(c.perfil) || h('span.nota', 'Sin perfil apuntado.')),
        txt(c.otros) ? h('p.nota', c.otros) : null)),
      tarjeta('Últimos movimientos',
        seg.length ? h('ul.linea-tiempo', seg.slice(0, 5).map(s =>
          h('li', h('.cuando', fechaCorta(s.fecha) + ' · ' + api.etiquetaCatalogo('canales', s.canal) +
              ' · ' + api.nombrePersona(s.usuario_id)),
            h('.que', s.nota),
            txt(s.proximo_paso) ? h('.nota', '→ ' + s.proximo_paso +
              (txt(s.proxima_fecha) ? ' (' + fechaCorta(s.proxima_fecha) + ')' : '')) : null)))
          : h('.vacio', 'Todavía no hay contactos apuntados.'))));
}

function panelVivienda(c) {
  return h('.doble',
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
        h('.v', h('b', {estilo: {fontSize: '17px'}}, eur(gastoAnual(c))))))));
}

function panelOperaciones(c, ops, refrescar) {
  if (!ops.length) return h('.vacio', 'Este cliente no tiene ninguna instalación registrada.');
  return h('div', ops.map(o => tarjetaOperacion(o, c, refrescar)));
}

function panelCaptacion(cap) {
  return tarjeta('Ficha de captación', h('div',
    dato('Captador', api.nombrePersona(cap.captador_id)),
    dato('Fecha de la visita', fechaLarga(cap.fecha) + (txt(cap.hora_cita) ? ' a las ' + cap.hora_cita : '')),
    dato('Estado de la cita', api.etiquetaCatalogo('estadosCita', cap.estado_cita)),
    dato('Tecnología', cap.tecnologia),
    dato('Comercial asignado', txt(cap.comercial_id) ? api.nombrePersona(cap.comercial_id) : ''),
    dato('Resultado', api.etiquetaCatalogo('resultadosCaptacion', cap.resultado)),
    dato('Interés', num(cap.interes) ? num(cap.interes) + '/10' : ''),
    dato('Notas', cap.notas)));
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
          ' · ' + api.nombrePersona(s.usuario_id) + (txt(s.origen) === 'parte' ? ' · desde el parte diario' : '')),
        h('.que', s.nota),
        txt(s.proximo_paso) ? h('.nota', '→ ' + s.proximo_paso +
          (txt(s.proxima_fecha) ? ' · ' + fechaCorta(s.proxima_fecha) : '')) : null,
        txt(s.estado_resultante) ? h('div', {estilo: {marginTop: '4px'}},
          etiquetaEstado(s.estado_resultante, api.etiquetaCatalogo('estadosCliente', s.estado_resultante))) : null)))
      : h('.vacio', 'Sin contactos apuntados todavía.'),
    {acciones: [h('button.btn.mini.lima', {onclick: () => nuevoSeguimiento(c, refrescar)}, '+ Apuntar')]});
}
