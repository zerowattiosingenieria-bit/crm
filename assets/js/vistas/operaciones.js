/* vistas/operaciones.js — instalaciones: alta, ficha y listado. */

import {h, poner, txt, num, eur, eur2, miles, pct, fechaCorta, normal, suma, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventanaFormulario, aviso, filtros} from '../ui.js';

const camposOperacion = (cliente) => [
  {separador: 'Qué se vende'},
  {id: 'tipo', et: 'Tipo', tipo: 'select', opciones: api.opciones('tiposOperacion'), vacio: false, requerido: true},
  {id: 'estado', et: 'Estado', tipo: 'select', opciones: api.opciones('estadosOperacion'), vacio: false},
  {id: 'referencia', et: 'Referencia', ayuda: 'Se genera sola si la dejas vacía'},

  {separador: 'Importes (IVA incluido)'},
  {id: 'importe_fv', et: 'Fotovoltaica (€)', tipo: 'euro'},
  {id: 'importe_aero', et: 'Aerotermia (€)', tipo: 'euro'},
  {id: 'importe_bateria', et: 'Baterías (€)', tipo: 'euro'},
  {id: 'importe_cargador', et: 'Cargador (€)', tipo: 'euro'},
  {id: 'importe_extras', et: 'Extras (€)', tipo: 'euro'},
  {id: 'iva_pct', et: 'IVA (%)', tipo: 'numero'},
  {id: 'ayudas_estimadas', et: 'Ayudas estimadas (€)', tipo: 'euro'},
  {id: 'cae_estimado', et: 'CAE estimado (€)', tipo: 'euro'},

  {separador: 'Cómo se paga'},
  {id: 'forma_pago', et: 'Forma de pago', tipo: 'select', opciones: [['contado', 'Contado'], ['financiado', 'Financiado']]},
  {id: 'financiera', et: 'Financiera'},
  {id: 'plazo_meses', et: 'Plazo (meses)', tipo: 'numero'},
  {id: 'cuota', et: 'Cuota (€/mes)', tipo: 'euro'},
  {id: 'reserva', et: 'Entrada / reserva (€)', tipo: 'euro'},

  {separador: 'Fechas'},
  {id: 'fecha_propuesta', et: 'Propuesta enviada', tipo: 'fecha'},
  {id: 'fecha_contrato', et: 'Contrato enviado', tipo: 'fecha'},
  {id: 'fecha_firma', et: 'Firma', tipo: 'fecha'},
  {id: 'fecha_prevista_instalacion', et: 'Instalación prevista', tipo: 'fecha'},
  {id: 'fecha_instalacion', et: 'Instalación realizada', tipo: 'fecha'},
  {id: 'fecha_legalizacion', et: 'Legalización', tipo: 'fecha'},

  {separador: 'Componentes'},
  {id: 'paneles_num', et: 'Nº de paneles', tipo: 'numero'},
  {id: 'panel_modelo', et: 'Modelo de panel', ayuda: 'Hanersun 630W bifacial'},
  {id: 'panel_wp', et: 'Potencia del panel (W)', tipo: 'numero'},
  {id: 'inversor_modelo', et: 'Inversor', ayuda: 'SolaX X1 / X3'},
  {id: 'inversor_kw', et: 'Inversor (kW)', tipo: 'numero', paso: '0.1'},
  {id: 'bateria_modelo', et: 'Batería'},
  {id: 'bateria_kwh', et: 'Batería (kWh)', tipo: 'numero', paso: '0.1'},
  {id: 'cargador_modelo', et: 'Cargador'},
  {id: 'aero_kw', et: 'Aerotermia (kW)', tipo: 'numero'},
  {id: 'aero_modelo', et: 'Modelo de aerotermia'},
  {id: 'deposito_acs', et: 'Depósito ACS (L)', tipo: 'numero'},
  {id: 'deposito_inercia', et: 'Depósito de inercia (L)', tipo: 'numero'},
  {id: 'suelo_radiante', et: 'Suelo radiante', tipo: 'select', opciones: [['no', 'No'], ['si', 'Sí']]},
  {id: 'tejado', et: 'Cubierta', tipo: 'select',
   opciones: [['teja', 'Teja'], ['chapa', 'Chapa'], ['plana', 'Plana'], ['pizarra', 'Pizarra'], ['suelo', 'Suelo']]},

  {separador: 'Cierre'},
  {id: 'beneficio_no_economico', et: 'Beneficio no económico', ancho: 3,
   ayuda: 'Prescriptor, obra escaparate, entrada en una urbanización…'},
  {id: 'observaciones', et: 'Observaciones', tipo: 'area', ancho: 3},
  {id: 'motivo_perdida', et: 'Motivo de pérdida (si se cae)', ancho: 3}
];

export function editorOperacion(operacion, cliente, alTerminar) {
  const valores = operacion || {
    tipo: 'fv_aero', estado: 'propuesta', iva_pct: num(api.estado.config.iva_pct) || 21,
    forma_pago: 'contado', fecha_propuesta: hoyISO(), suelo_radiante: 'no', tejado: 'teja'
  };
  return ventanaFormulario({
    titulo: (operacion ? 'Editar instalación · ' : 'Nueva instalación · ') + (cliente ? cliente.nombre : ''),
    ancha: true,
    campos: camposOperacion(cliente),
    valores,
    alGuardar: async datos => {
      datos.cliente_id = cliente.id;
      if (operacion && operacion.id) datos.id = operacion.id;
      await api.guardarOperacion(datos);
      aviso('Instalación guardada.');
      await alTerminar();
    }
  });
}

const dato = (et, v) => h('.dato', h('.et', et), h('.v', v === '' || v === null || v === undefined ? '—' : v));

/** Tarjeta completa de una instalación, con importes, componentes y cobros. */
export function tarjetaOperacion(o, cliente, refrescar) {
  const cobros = api.cobrosDe(o.id);
  const gastos = api.gastosDe(o.id);
  const cobrado = suma(cobros.filter(c => txt(c.fecha_cobro)), 'importe');
  const coste = suma(gastos, 'importe');
  const base = num(o.base) || num(o.total) / (1 + (num(o.iva_pct) || 21) / 100);
  const margen = base - coste;

  const componentes = [
    num(o.paneles_num) ? num(o.paneles_num) + ' × ' + (txt(o.panel_modelo) || 'paneles') +
      (num(o.panel_wp) ? ' (' + num(o.panel_wp) + ' W)' : '') : null,
    txt(o.inversor_modelo) ? 'Inversor ' + o.inversor_modelo +
      (num(o.inversor_kw) ? ' · ' + o.inversor_kw + ' kW' : '') : null,
    num(o.bateria_kwh) ? 'Batería ' + o.bateria_kwh + ' kWh' +
      (txt(o.bateria_modelo) ? ' (' + o.bateria_modelo + ')' : '') : null,
    txt(o.cargador_modelo) ? 'Cargador ' + o.cargador_modelo : null,
    num(o.aero_kw) ? 'Aerotermia ' + o.aero_kw + ' kW' +
      (txt(o.aero_modelo) ? ' (' + o.aero_modelo + ')' : '') : null,
    num(o.deposito_acs) ? 'ACS ' + o.deposito_acs + ' L' : null,
    num(o.deposito_inercia) ? 'Inercia ' + o.deposito_inercia + ' L' : null,
    normal(o.suelo_radiante) === 'si' ? 'Suelo radiante' : null
  ].filter(Boolean);

  const hitos = [
    ['Propuesta', o.fecha_propuesta], ['Contrato', o.fecha_contrato], ['Firma', o.fecha_firma],
    ['Instalación prevista', o.fecha_prevista_instalacion], ['Instalada', o.fecha_instalacion],
    ['Legalizada', o.fecha_legalizacion]
  ].filter(x => txt(x[1]));

  return tarjeta(
    (txt(o.referencia) || o.id) + ' · ' + api.etiquetaCatalogo('tiposOperacion', o.tipo),
    h('div',
      h('.acciones', {estilo: {marginBottom: '12px'}},
        etiquetaEstado(o.estado, api.etiquetaCatalogo('estadosOperacion', o.estado)),
        marca(eur(o.total) + ' IVA incl.', 'marca'),
        normal(o.forma_pago) === 'financiado'
          ? marca(num(o.cuota) ? eur2(o.cuota) + '/mes · ' + num(o.plazo_meses) + ' meses' : 'Financiado')
          : marca('Contado'),
        num(o.ayudas_estimadas) ? marca('Ayudas ' + eur(o.ayudas_estimadas)) : null,
        num(o.cae_estimado) ? marca('CAE ' + eur(o.cae_estimado)) : null),

      h('.doble',
        h('div',
          h('h4', {estilo: {marginBottom: '6px'}}, 'Importes'),
          dato('Fotovoltaica', num(o.importe_fv) ? eur(o.importe_fv) : ''),
          dato('Aerotermia', num(o.importe_aero) ? eur(o.importe_aero) : ''),
          dato('Baterías', num(o.importe_bateria) ? eur(o.importe_bateria) : ''),
          dato('Cargador', num(o.importe_cargador) ? eur(o.importe_cargador) : ''),
          dato('Extras', num(o.importe_extras) ? eur(o.importe_extras) : ''),
          dato('Base imponible', eur2(base)),
          dato('Total con IVA', h('b', eur(o.total)))),
        h('div',
          h('h4', {estilo: {marginBottom: '6px'}}, 'Equipos'),
          componentes.length ? h('ul', {estilo: {margin: 0, paddingLeft: '18px', fontSize: '13.5px'}},
            componentes.map(x => h('li', x))) : h('p.nota', 'Sin componentes apuntados.'),
          hitos.length ? h('div', {estilo: {marginTop: '12px'}},
            h('h4', {estilo: {marginBottom: '6px'}}, 'Fechas'),
            hitos.map(([et, f]) => dato(et, fechaCorta(f)))) : null,
          txt(o.beneficio_no_economico) ? h('div', {estilo: {marginTop: '12px'}},
            h('h4', {estilo: {marginBottom: '4px'}}, 'Beneficio no económico'),
            h('p.nota', {estilo: {margin: 0}}, o.beneficio_no_economico)) : null)),

      cobros.length ? h('div', {estilo: {marginTop: '14px'}},
        h('h4', {estilo: {marginBottom: '6px'}}, 'Cobros'),
        tabla([
          {clave: 'concepto', et: 'Concepto', valor: c => api.etiquetaCatalogo('conceptosCobro', c.concepto)},
          {clave: 'importe', et: 'Importe', num: true, valor: c => num(c.importe), pinta: c => eur(c.importe)},
          {clave: 'fecha_prevista', et: 'Previsto', pinta: c => fechaCorta(c.fecha_prevista)},
          {clave: 'fecha_cobro', et: 'Cobrado', pinta: c => txt(c.fecha_cobro) ? fechaCorta(c.fecha_cobro) : '—'},
          {clave: 'estado', et: 'Estado', pinta: c => {
            const vencido = !txt(c.fecha_cobro) && txt(c.fecha_prevista) && txt(c.fecha_prevista) < hoyISO();
            return etiquetaEstado(vencido ? 'vencido' : c.estado,
              vencido ? 'Vencido' : api.etiquetaCatalogo('estadosCobro', c.estado));
          }}
        ], cobros, {vacio: 'Sin cobros registrados.'})) : null,

      api.puede('costes') && (gastos.length || coste) ? h('div', {estilo: {marginTop: '14px'}},
        h('h4', {estilo: {marginBottom: '6px'}}, 'Cuenta de la instalación'),
        h('.triple',
          kpi('Ingreso (sin IVA)', eur(base)),
          kpi('Coste', eur(coste), gastos.length + ' apuntes'),
          kpi('Margen', eur(margen), pct(base ? margen * 100 / base : 0),
            {estado: margen > 0 ? 'bien' : 'mal'}))) : null,

      txt(o.observaciones) ? h('p.nota', {estilo: {marginTop: '12px'}}, o.observaciones) : null,
      txt(o.motivo_perdida) ? h('p', {estilo: {marginTop: '8px', color: 'var(--mal)'}},
        'Motivo de pérdida: ' + o.motivo_perdida) : null,

      h('.acciones', {estilo: {marginTop: '14px'}},
        h('button.btn.mini', {onclick: () => editorOperacion(o, cliente || api.cliente(o.cliente_id),
          async () => { await refrescar(); })}, 'Editar instalación'),
        h('span.nota', 'Cobrado ' + eur(cobrado) + ' de ' + eur(o.total)))));
}

/* ================= listado ================= */
export async function vistaOperaciones({ir, refrescar}) {
  const caja = h('div');
  const contenedor = h('div');
  const est = {texto: '', estado: '', tipo: '', persona: ''};

  const f = filtros([
    {id: 'texto', et: 'Buscar por cliente, referencia, municipio…'},
    {id: 'estado', tipo: 'select', opciones: [['', 'Todos los estados']].concat(api.opciones('estadosOperacion'))},
    {id: 'tipo', tipo: 'select', opciones: [['', 'Todos los tipos']].concat(api.opciones('tiposOperacion'))},
    ...(api.esDireccion() ? [{id: 'persona', tipo: 'select',
      opciones: [['', 'Todo el equipo']].concat(api.estado.usuarios
        .filter(u => u.rol !== 'captador').map(u => [u.id, u.nombre]))}] : [])
  ], v => { Object.assign(est, v); pinta(); });

  function pinta() {
    const q = normal(est.texto);
    const lista = api.estado.operaciones.filter(o => {
      const c = api.cliente(o.cliente_id) || {};
      if (est.estado && txt(o.estado) !== est.estado) return false;
      if (est.tipo && txt(o.tipo) !== est.tipo) return false;
      if (est.persona && txt(o.comercial_id) !== est.persona) return false;
      if (!q) return true;
      return [c.nombre, c.municipio, o.referencia, o.id, o.panel_modelo, o.aero_modelo]
        .some(x => normal(x).includes(q));
    }).sort((a, b) => txt(b.fecha_firma || b.creado).localeCompare(txt(a.fecha_firma || a.creado)));

    const vendidas = lista.filter(o => ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada']
      .includes(txt(o.estado)));

    const t = tabla([
      {clave: 'referencia', et: 'Referencia', pinta: o => h('div', h('b', txt(o.referencia) || o.id),
        h('div.nota', api.etiquetaCatalogo('tiposOperacion', o.tipo)))},
      {clave: 'cliente', et: 'Cliente', valor: o => (api.cliente(o.cliente_id) || {}).nombre || '—',
       pinta: o => { const c = api.cliente(o.cliente_id) || {};
         return h('div', h('b', c.nombre || '—'), h('div.nota', txt(c.municipio))); }},
      {clave: 'estado', et: 'Estado', pinta: o => etiquetaEstado(o.estado,
        api.etiquetaCatalogo('estadosOperacion', o.estado))},
      {clave: 'total', et: 'Importe', num: true, valor: o => num(o.total), pinta: o => eur(o.total)},
      {clave: 'forma_pago', et: 'Pago', valor: o => txt(o.forma_pago),
       pinta: o => normal(o.forma_pago) === 'financiado'
         ? h('div', h('span', 'Financiado'), h('div.nota', num(o.cuota) ? eur2(o.cuota) + '/mes' : ''))
         : 'Contado'},
      {clave: 'cobrado', et: 'Cobrado', num: true,
       valor: o => suma(api.cobrosDe(o.id).filter(c => txt(c.fecha_cobro)), 'importe'),
       pinta: o => {
         const c = suma(api.cobrosDe(o.id).filter(x => txt(x.fecha_cobro)), 'importe');
         const p = num(o.total) ? c * 100 / num(o.total) : 0;
         return h('div', h('span', eur(c)), h('div.nota', Math.round(p) + ' %'));
       }},
      {clave: 'fecha_firma', et: 'Firma', valor: o => txt(o.fecha_firma),
       pinta: o => txt(o.fecha_firma) ? fechaCorta(o.fecha_firma) : '—'},
      {clave: 'instalacion', et: 'Instalación', valor: o => txt(o.fecha_instalacion || o.fecha_prevista_instalacion),
       pinta: o => txt(o.fecha_instalacion) ? fechaCorta(o.fecha_instalacion)
         : (txt(o.fecha_prevista_instalacion) ? h('span.nota', 'prev. ' + fechaCorta(o.fecha_prevista_instalacion)) : '—')},
      ...(api.esDireccion() ? [{clave: 'comercial', et: 'Comercial',
        valor: o => api.nombrePersona(o.comercial_id)}] : [])
    ], lista, {alPulsar: o => ir('cliente/' + o.cliente_id), csv: 'instalaciones_zerowattios.csv',
               vacio: 'No hay instalaciones con esos filtros.'});

    poner(contenedor,
      kpis(
        kpi('Instalaciones', miles(lista.length), 'en la lista'),
        kpi('Vendidas', miles(vendidas.length), eur(suma(vendidas, 'total')), {estado: 'bien'}),
        kpi('En propuesta', miles(lista.filter(o => txt(o.estado) === 'propuesta').length),
          eur(suma(lista.filter(o => txt(o.estado) === 'propuesta'), 'total'))),
        kpi('Ticket medio', eur(vendidas.length ? suma(vendidas, 'total') / vendidas.length : 0), 'IVA incluido')
      ),
      tarjeta(miles(lista.length) + ' instalación(es)', t,
        {sinRelleno: true, acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  pinta();
  return poner(caja, f.nodo, contenedor);
}
