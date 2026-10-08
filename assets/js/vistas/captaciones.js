/* vistas/captaciones.js — fichas de captación: lo que traen Sandra y Abraham. */

import {h, poner, txt, num, eur, miles, pct, fechaCorta, normal, suma, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventanaFormulario, aviso,
        filtros} from '../ui.js';
import {gastoAnual} from './clientes.js';

function nuevaCaptacion(refrescar, ir) {
  const comerciales = api.estado.usuarios
    .filter(u => ['comercial', 'admin', 'superadmin'].includes(u.rol)).map(u => [u.id, u.nombre]);
  return ventanaFormulario({
    titulo: 'Nueva ficha de captación',
    ancha: true,
    campos: [
      {separador: 'La cita'},
      {id: 'fecha', et: 'Fecha de la visita', tipo: 'fecha', requerido: true},
      {id: 'hora_cita', et: 'Hora', tipo: 'hora'},
      {id: 'estado_cita', et: 'Estado', tipo: 'select', opciones: api.opciones('estadosCita'), vacio: false},
      {id: 'tecnologia', et: 'Tecnología', tipo: 'select',
       opciones: ['AEROTERMIA', 'FOTOVOLTAICA', 'AEROTERMIA + FOTOVOLTAICA'], vacio: false},
      {id: 'comercial_id', et: 'Comercial asignado', tipo: 'select', opciones: comerciales},
      {id: 'interes', et: 'Interés (1-10)', tipo: 'numero', min: 1, max: 10},

      {separador: 'El cliente'},
      {id: 'nombre', et: 'Propietarios', requerido: true, ancho: 2},
      {id: 'telefono', et: 'Teléfono', tipo: 'tel', requerido: true},
      {id: 'email', et: 'Correo', tipo: 'email'},
      {id: 'direccion', et: 'Dirección', ancho: 2},
      {id: 'municipio', et: 'Municipio'},
      {id: 'cp', et: 'Código postal'},
      {id: 'coordenadas', et: 'Coordenadas', ayuda: 'Pégalas de Google Maps: 40.59,-3.98'},
      {id: 'tipo_vivienda', et: 'Tipo de vivienda', tipo: 'select',
       opciones: ['Chalet', 'Adosado', 'Pareado', 'Piso', 'Casa de pueblo', 'Otro']},
      {id: 'm2', et: 'Superficie (m²)', tipo: 'numero'},
      {id: 'personas', et: 'Personas en casa', tipo: 'numero'},

      {separador: 'Lo que gasta'},
      {id: 'calefaccion', et: 'Calefacción', tipo: 'select',
       opciones: ['Gasóleo', 'Gas natural', 'Propano', 'Eléctrica', 'Biomasa', 'Bomba de calor', 'Sin calefacción']},
      {id: 'gasto_combustible', et: 'Gasto en combustible (€)', tipo: 'euro'},
      {id: 'periodo_combustible', et: 'Periodo', tipo: 'select', opciones: ['al año', 'al mes', 'por depósito']},
      {id: 'gasto_luz_mes', et: 'Gasto de luz (€/mes)', tipo: 'euro'},
      {id: 'comercializadora', et: 'Comercializadora'},

      {separador: 'Lo que has visto'},
      {id: 'perfil', et: 'Perfil del cliente', tipo: 'area', ancho: 3,
       pista: 'Cómo es, qué le mueve, quién decide…'},
      {id: 'notas', et: 'Otros datos de la puerta', tipo: 'area', ancho: 3}
    ],
    valores: {fecha: hoyISO(), hora_cita: '17:00', estado_cita: 'confirmada',
              tecnologia: 'AEROTERMIA', periodo_combustible: 'al año', interes: 7},
    alGuardar: async d => {
      const captacion = {
        fecha: d.fecha, hora_cita: d.hora_cita, estado_cita: d.estado_cita, tecnologia: d.tecnologia,
        comercial_id: d.comercial_id, interes: d.interes, notas: d.notas, resultado: 'pendiente',
        cliente: {
          nombre: d.nombre, telefono: d.telefono, email: d.email, direccion: d.direccion,
          municipio: d.municipio, cp: d.cp, coordenadas: d.coordenadas, tipo_vivienda: d.tipo_vivienda,
          m2: d.m2, personas: d.personas, calefaccion: d.calefaccion,
          gasto_combustible: d.gasto_combustible, periodo_combustible: d.periodo_combustible,
          gasto_luz_mes: d.gasto_luz_mes, comercializadora: d.comercializadora,
          interes: d.interes, perfil: d.perfil, origen: 'captacion', comercial_id: d.comercial_id
        }
      };
      const r = await api.guardarCaptacion(captacion);
      aviso('Ficha de captación guardada.');
      await refrescar();
      if (r.captacion && r.captacion.cliente_id) ir('cliente/' + r.captacion.cliente_id);
    }
  });
}

/* Adjudicar la ficha a un comercial: hasta que no se hace, ese cliente no
   aparece en la cartera de nadie. */
function adjudicar(captacion, refrescar) {
  const comerciales = api.estado.usuarios
    .filter(u => ['comercial', 'admin', 'superadmin'].includes(u.rol))
    .map(u => [u.id, u.nombre]);
  const cli = api.cliente(captacion.cliente_id) || {};
  return ventanaFormulario({
    titulo: 'Adjudicar ' + (cli.nombre || 'la captación'),
    campos: [
      {id: 'comercial_id', et: 'Comercial que la lleva', tipo: 'select', opciones: comerciales,
       vacio: 'Sin adjudicar', ancho: 2,
       ayuda: 'El comercial solo ve las captaciones que le adjudicas'},
      {id: 'fecha', et: 'Día de la visita', tipo: 'fecha'},
      {id: 'hora_cita', et: 'Hora', tipo: 'hora'},
      {id: 'estado_cita', et: 'Estado de la cita', tipo: 'select',
       opciones: api.opciones('estadosCita'), vacio: false},
      {id: 'notas', et: 'Notas para el comercial', tipo: 'area', ancho: 3}
    ],
    valores: captacion,
    textoBoton: 'Guardar',
    alGuardar: async d => {
      d.id = captacion.id;
      d.cliente_id = captacion.cliente_id;
      await api.guardarCaptacion(d);
      aviso(d.comercial_id ? 'Captación adjudicada.' : 'Captación sin adjudicar.');
      await refrescar();
    }
  });
}

/* ---- Rendimiento de captación: leads, sentadas, ventas y ratios ---- */

/* Estados de operación que cuentan como venta cerrada. */
const OPERACION_GANADA = ['firmada', 'tramite', 'material', 'instalacion',
                          'instalada', 'legalizada', 'cerrada'];

/* Días laborables (lunes a viernes) entre dos fechas ISO, ambas incluidas. */
export function diasLaborables(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO || desdeISO > hastaISO) return 0;
  let n = 0;
  const d = new Date(desdeISO + 'T12:00:00');
  const fin = new Date(hastaISO + 'T12:00:00');
  while (d <= fin) {
    const s = d.getDay();
    if (s !== 0 && s !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/* ¿Esta ficha acabó en venta? Vale el resultado marcado a mano o que el
   cliente tenga ya una operación cerrada. */
export function captacionEsVenta(c) {
  if (txt(c.resultado) === 'venta') return true;
  if (txt(c.operacion_id)) {
    const o = api.operacion(c.operacion_id);
    if (o && OPERACION_GANADA.includes(normal(o.estado))) return true;
  }
  return api.estado.operaciones.some(o => String(o.cliente_id) === String(c.cliente_id) &&
    OPERACION_GANADA.includes(normal(o.estado)));
}

/* ¿Se llegó a sentar con el cliente? Cuenta el resultado marcado y también
   las citas confirmadas cuya fecha ya ha pasado y que nadie ha descartado. */
export function captacionEsSentada(c) {
  if (['sentada', 'venta'].includes(txt(c.resultado))) return true;
  if (captacionEsVenta(c)) return true;
  return txt(c.estado_cita) === 'confirmada' && txt(c.fecha) && txt(c.fecha) < hoyISO() &&
    !['cancelada', 'no_sentada'].includes(txt(c.resultado));
}

/* Agrupa las fichas por persona y calcula el embudo y los ratios. */
function embudoPor(lista, campo) {
  const filas = {};
  lista.forEach(c => {
    const k = txt(c[campo]) || '(sin asignar)';
    if (!filas[k]) filas[k] = {id: k, leads: 0, confirmadas: 0, sentadas: 0, ventas: 0,
                               primera: '', ultima: '', importe: 0};
    const f = filas[k];
    f.leads++;
    if (txt(c.estado_cita) === 'confirmada') f.confirmadas++;
    if (captacionEsSentada(c)) f.sentadas++;
    if (captacionEsVenta(c)) {
      f.ventas++;
      const o = api.estado.operaciones.find(x => String(x.cliente_id) === String(c.cliente_id) &&
        OPERACION_GANADA.includes(normal(x.estado)));
      if (o) f.importe += num(o.total);
    }
    const fe = txt(c.fecha);
    if (fe) {
      if (!f.primera || fe < f.primera) f.primera = fe;
      if (!f.ultima || fe > f.ultima) f.ultima = fe;
    }
  });
  return Object.values(filas).map(f => {
    const hasta = f.ultima && f.ultima > hoyISO() ? hoyISO() : f.ultima;
    f.dias = diasLaborables(f.primera, hasta || f.primera);
    f.porDia = f.dias ? f.leads / f.dias : 0;
    f.pctSentada = f.leads ? f.sentadas * 100 / f.leads : 0;
    f.pctVenta = f.sentadas ? f.ventas * 100 / f.sentadas : 0;
    f.leadsPorVenta = f.ventas ? f.leads / f.ventas : 0;
    return f;
  }).sort((a, b) => b.leads - a.leads);
}

function tablaEmbudo(filas, etiquetaPersona) {
  return tabla([
    {clave: 'id', et: etiquetaPersona, valor: f => f.id === '(sin asignar)'
      ? 'Sin asignar' : api.nombrePersona(f.id),
     pinta: f => f.id === '(sin asignar)'
       ? h('span.nota', 'Sin asignar')
       : h('div', h('b', api.nombrePersona(f.id)),
           h('div.nota', f.dias + ' día(s) laborable(s)'))},
    {clave: 'leads', et: 'Leads', num: true, valor: f => f.leads},
    {clave: 'porDia', et: 'Leads al día', num: true, valor: f => f.porDia,
     pinta: f => f.porDia ? f.porDia.toFixed(1) : '—'},
    {clave: 'confirmadas', et: 'Citas confirmadas', num: true, valor: f => f.confirmadas},
    {clave: 'sentadas', et: 'Sentadas', num: true, valor: f => f.sentadas},
    {clave: 'pctSentada', et: 'Lead → sentada', num: true, valor: f => f.pctSentada,
     pinta: f => pct(f.pctSentada)},
    {clave: 'ventas', et: 'Ventas', num: true, valor: f => f.ventas},
    {clave: 'pctVenta', et: 'Sentada → venta', num: true, valor: f => f.pctVenta,
     pinta: f => f.sentadas ? pct(f.pctVenta) : '—'},
    {clave: 'leadsPorVenta', et: 'Leads por venta', num: true, valor: f => f.leadsPorVenta,
     pinta: f => f.ventas ? f.leadsPorVenta.toFixed(1) : '—'},
    {clave: 'importe', et: 'Vendido', num: true, valor: f => f.importe,
     pinta: f => f.importe ? eur(f.importe) : '—'}
  ], filas, {vacio: 'Todavía no hay fichas para medir.'});
}

/* El panel entero: lo de arriba son los números de toda la lista filtrada. */
function rendimiento(lista) {
  const leads = lista.length;
  const sentadas = lista.filter(captacionEsSentada).length;
  const ventas = lista.filter(captacionEsVenta).length;
  const fechas = lista.map(c => txt(c.fecha)).filter(Boolean).sort();
  const primera = fechas[0] || '';
  const ultima = fechas[fechas.length - 1] || '';
  const hasta = ultima && ultima > hoyISO() ? hoyISO() : ultima;
  const dias = diasLaborables(primera, hasta || primera);

  return h('div',
    kpis(
      kpi('Leads al día', dias ? (leads / dias).toFixed(1) : '—',
        dias ? miles(leads) + ' en ' + dias + ' día(s) laborable(s)' : 'sin fechas'),
      kpi('Lead → sentada', pct(leads ? sentadas * 100 / leads : 0),
        miles(sentadas) + ' de ' + miles(leads)),
      kpi('Sentada → venta', sentadas ? pct(ventas * 100 / sentadas) : '—',
        miles(ventas) + ' de ' + miles(sentadas)),
      kpi('Leads por venta', ventas ? (leads / ventas).toFixed(1) : '—',
        ventas ? 'hacen falta de media' : 'aún sin ventas', {estado: ventas ? 'bien' : 'aviso'})
    ),
    tarjeta('Rendimiento por captador', tablaEmbudo(embudoPor(lista, 'captador_id'), 'Captador'),
      {sinRelleno: true}),
    tarjeta('Rendimiento por comercial', tablaEmbudo(embudoPor(lista, 'comercial_id'), 'Comercial'),
      {sinRelleno: true}),
    h('p.nota', 'Cuenta como sentada la ficha marcada como sentada o venta y también la cita ' +
      'confirmada cuya fecha ya ha pasado y nadie ha descartado. Cuenta como venta la ficha ' +
      'marcada como venta y la de cualquier cliente que ya tenga una operación cerrada. ' +
      'Los leads al día se reparten entre los días laborables que van de la primera ficha a la última.'));
}

export async function vistaCaptaciones({ir, refrescar}) {
  const caja = h('div');
  const contenedor = h('div');
  const est = {texto: '', resultado: '', captador: '', desde: ''};
  const puedeAdjudicar = api.estado.usuario.rol === 'captador' || api.esDireccion();

  const f = filtros([
    {id: 'texto', et: 'Buscar por cliente o municipio…'},
    {id: 'resultado', tipo: 'select',
     opciones: [['', 'Todos los resultados']].concat(api.opciones('resultadosCaptacion'))},
    ...(api.esDireccion() ? [{id: 'captador', tipo: 'select',
      opciones: [['', 'Todos los captadores']].concat(api.estado.usuarios
        .filter(u => u.rol === 'captador').map(u => [u.id, u.nombre]))}] : []),
    {id: 'desde', tipo: 'fecha', et: 'Desde'},
    ...(api.estado.usuario.rol === 'captador' || api.esDireccion()
      ? [{tipo: 'boton', et: '+ Nueva ficha', clase: 'primario', accion: () => nuevaCaptacion(refrescar, ir)}]
      : [])
  ], v => { Object.assign(est, v); pinta(); });

  function pinta() {
    const q = normal(est.texto);
    const lista = api.estado.captaciones.filter(c => {
      const cli = api.cliente(c.cliente_id) || {};
      if (est.resultado && txt(c.resultado) !== est.resultado) return false;
      if (est.captador && txt(c.captador_id) !== est.captador) return false;
      if (est.desde && txt(c.fecha) < est.desde) return false;
      if (!q) return true;
      return [cli.nombre, cli.municipio, cli.direccion, c.notas].some(x => normal(x).includes(q));
    }).sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha)));

    const sentadas = lista.filter(c => ['sentada', 'venta'].includes(txt(c.resultado))).length;
    const ventas = lista.filter(c => txt(c.resultado) === 'venta').length;

    const t = tabla([
      {clave: 'fecha', et: 'Visita', pinta: c => h('div', h('b', fechaCorta(c.fecha)),
        h('div.nota', txt(c.hora_cita)))},
      {clave: 'cliente', et: 'Cliente', valor: c => (api.cliente(c.cliente_id) || {}).nombre || '—',
       pinta: c => { const cli = api.cliente(c.cliente_id) || {};
         return h('div', h('b', cli.nombre || '—'),
           h('div.nota', [cli.direccion, cli.municipio].filter(Boolean).join(' · '))); }},
      {clave: 'tecnologia', et: 'Tecnología'},
      {clave: 'estado_cita', et: 'Cita', pinta: c => etiquetaEstado(c.estado_cita,
        api.etiquetaCatalogo('estadosCita', c.estado_cita))},
      {clave: 'resultado', et: 'Resultado', pinta: c => etiquetaEstado(c.resultado,
        api.etiquetaCatalogo('resultadosCaptacion', c.resultado))},
      {clave: 'interes', et: 'Interés', num: true, valor: c => num(c.interes),
       pinta: c => num(c.interes) ? num(c.interes) + '/10' : '—'},
      {clave: 'gasto', et: 'Gasto anual', num: true,
       valor: c => gastoAnual(api.cliente(c.cliente_id) || {}),
       pinta: c => eur(gastoAnual(api.cliente(c.cliente_id) || {}))},
      ...(api.esDireccion() ? [{clave: 'captador', et: 'Captador',
        valor: c => api.nombrePersona(c.captador_id)}] : []),
      {clave: 'comercial', et: 'Comercial', valor: c => txt(c.comercial_id)
        ? api.nombrePersona(c.comercial_id) : '',
       pinta: c => txt(c.comercial_id)
         ? marca(api.nombrePersona(c.comercial_id), 'info')
         : h('span.nota', 'sin adjudicar')},
      ...(puedeAdjudicar ? [{clave: 'acciones', et: '', noOrden: true,
        pinta: c => h('button.btn.mini', {onclick: e => { e.stopPropagation(); adjudicar(c, refrescar); }},
          txt(c.comercial_id) ? 'Cambiar' : 'Adjudicar')}] : [])
    ], lista, {alPulsar: c => ir('cliente/' + c.cliente_id), csv: 'captaciones_zerowattios.csv',
               vacio: 'No hay fichas con esos filtros.'});

    poner(contenedor,
      kpis(
        kpi('Fichas', miles(lista.length), 'en la lista'),
        kpi('Citas confirmadas', miles(lista.filter(c => txt(c.estado_cita) === 'confirmada').length),
          pct(lista.length ? lista.filter(c => txt(c.estado_cita) === 'confirmada').length * 100 / lista.length : 0)),
        kpi('Llegan a sentada', miles(sentadas), pct(lista.length ? sentadas * 100 / lista.length : 0)),
        kpi('Acaban en venta', miles(ventas), pct(lista.length ? ventas * 100 / lista.length : 0),
          {estado: 'bien'}),
        kpi('Sin adjudicar', miles(lista.filter(c => !txt(c.comercial_id)).length),
          'esperando comercial',
          {estado: lista.filter(c => !txt(c.comercial_id)).length ? 'aviso' : 'bien'})
      ),
      rendimiento(lista),
      tarjeta(miles(lista.length) + ' ficha(s) de captación', t,
        {sinRelleno: true, acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  pinta();
  return poner(caja, f.nodo, contenedor);
}
