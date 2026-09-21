/* vistas/mapa.js — mapa interactivo de todos los clientes visitados.
 * Solo dirección. Usa Leaflet, que va incluido en el propio repositorio
 * (assets/vendor), así que el mapa funciona aunque no haya CDN.
 */

import {h, poner, txt, num, eur, miles, pct, fechaCorta, normal, suma, hoyISO,
        comoLlegarHref, mapsHref} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, aviso, avisoError, cargando,
        confirmar, filtros} from '../ui.js';

const COLORES = {
  ganado: '#1a7f37', perdido: '#a3271e', propuesta: '#2a78d6', negociando: '#eda100',
  sentada: '#4a3aa7', cita: '#1baf7a', captado: '#5b6159', nuevo: '#8b918a', frio: '#8b918a'
};
const color = estado => COLORES[normal(estado)] || '#5b6159';

let cargadoLeaflet = false;
function cargarLeaflet() {
  if (cargadoLeaflet) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = (href) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
    };
    css('assets/vendor/leaflet/leaflet.css');
    css('assets/vendor/leaflet/MarkerCluster.css');
    css('assets/vendor/leaflet/MarkerCluster.Default.css');
    const s = document.createElement('script');
    s.src = 'assets/vendor/leaflet/leaflet.js';
    s.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'assets/vendor/leaflet/leaflet.markercluster.js';
      s2.onload = () => {
        const s3 = document.createElement('script');
        s3.src = 'assets/vendor/leaflet/leaflet-heat.js';
        s3.onload = () => { cargadoLeaflet = true; resolve(); };
        s3.onerror = () => { cargadoLeaflet = true; resolve(); };
        document.head.appendChild(s3);
      };
      s2.onerror = () => { cargadoLeaflet = true; resolve(); };
      document.head.appendChild(s2);
    };
    s.onerror = () => reject(new Error('No se ha podido cargar el mapa.'));
    document.head.appendChild(s);
  });
}

export async function vistaMapa({ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando('Cargando el mapa…'));
  poner(caja, contenedor);

  const [d] = await Promise.all([api.pedir('mapa'), cargarLeaflet()]);
  if (!window.L) { poner(contenedor, h('.vacio', 'El mapa no ha podido cargarse.')); return caja; }

  const est = {estado: '', comercial: '', captador: '', municipio: '', tecnologia: '',
               interes: '', desde: '', capa: 'puntos', texto: ''};

  const municipios = [...new Set(d.puntos.map(p => txt(p.municipio)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  const divMapa = h('div#mapa');
  const panelLateral = h('div');
  const kpisCaja = h('div');
  const tablaCaja = h('div');

  const f = filtros([
    {id: 'texto', et: 'Buscar cliente o calle…'},
    {id: 'estado', tipo: 'select', opciones: [['', 'Todos los estados']].concat(api.opciones('estadosCliente'))},
    {id: 'municipio', tipo: 'select', opciones: [['', 'Todos los municipios']].concat(municipios)},
    {id: 'comercial', tipo: 'select', opciones: [['', 'Todos los comerciales']]
      .concat(api.estado.usuarios.filter(u => u.rol !== 'captador').map(u => [u.id, u.nombre]))},
    {id: 'captador', tipo: 'select', opciones: [['', 'Todos los captadores']]
      .concat(api.estado.usuarios.filter(u => u.rol === 'captador').map(u => [u.id, u.nombre]))},
    {id: 'interes', tipo: 'select', opciones: [['', 'Cualquier interés'], ['6', 'Interés 6+'],
      ['8', 'Interés 8+']]},
    {id: 'desde', tipo: 'fecha', et: 'Desde'},
    {id: 'capa', tipo: 'select', opciones: [['puntos', 'Puntos por estado'], ['calor', 'Mapa de calor por gasto'],
      ['ambos', 'Puntos y calor']]},
    {tipo: 'boton', et: 'Buscar coordenadas que faltan', accion: geocodificar}
  ], v => { Object.assign(est, v); pinta(); });

  const mapa = L.map(divMapa, {scrollWheelZoom: true}).setView([40.45, -3.7], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(mapa);

  let capaPuntos = null, capaCalor = null;

  function filtrar() {
    const q = normal(est.texto);
    return d.puntos.filter(p => {
      if (est.estado && normal(p.estado) !== est.estado) return false;
      if (est.municipio && txt(p.municipio) !== est.municipio) return false;
      if (est.comercial && txt(p.comercial_id) !== est.comercial) return false;
      if (est.captador && txt(p.captador_id) !== est.captador) return false;
      if (est.interes && num(p.interes) < num(est.interes)) return false;
      if (est.desde && txt(p.creado) < est.desde) return false;
      if (!q) return true;
      return [p.nombre, p.direccion, p.municipio, p.perfil].some(x => normal(x).includes(q));
    });
  }

  function globo(p) {
    const dato = (et, v) => v ? h('.dato', h('.et', et), h('.v', v)) : null;
    const op = p.operacion;
    return h('.globo',
      h('h4', p.nombre),
      h('div', {estilo: {marginBottom: '6px'}},
        etiquetaEstado(p.estado, api.etiquetaCatalogo('estadosCliente', p.estado)),
        p.tecnologia ? ' ' : null,
        p.tecnologia ? marca(p.tecnologia) : null),
      dato('Dirección', [p.direccion, p.municipio].filter(Boolean).join(', ')),
      dato('Teléfono', p.telefono),
      dato('Vivienda', [p.tipo_vivienda, p.m2 ? p.m2 + ' m²' : '', p.personas ? p.personas + ' personas' : '']
        .filter(Boolean).join(' · ')),
      dato('Calefacción', p.calefaccion),
      dato('Gasto energético', eur(p.gasto_anual) + ' al año'),
      dato('Interés', p.interes ? p.interes + '/10' : ''),
      dato('Comercial', p.comercial),
      dato('Captador', p.captador),
      dato('Último contacto', p.ultimo_contacto ? fechaCorta(p.ultimo_contacto) : ''),
      dato('Próximo paso', p.proxima_accion ? p.proxima_accion +
        (p.proxima_fecha ? ' · ' + fechaCorta(p.proxima_fecha) : '') : ''),
      op ? dato('Instalación', api.etiquetaCatalogo('tiposOperacion', op.tipo) + ' · ' + eur(op.total) +
        ' · ' + api.etiquetaCatalogo('estadosOperacion', op.estado)) : null,
      h('.acciones', {estilo: {marginTop: '10px'}},
        h('button.btn.mini.primario', {onclick: () => ir('cliente/' + p.id)}, 'Abrir ficha'),
        h('a.btn.mini.lima', {href: comoLlegarHref(p.lat + ',' + p.lng), target: '_blank',
          rel: 'noopener'}, '🚗 Ir en coche'),
        txt(p.telefono)
          ? h('a.btn.mini', {href: 'tel:' + txt(p.telefono).replace(/\s/g, '')}, 'Llamar') : null));
  }

  function pinta() {
    const lista = filtrar();

    if (capaPuntos) { mapa.removeLayer(capaPuntos); capaPuntos = null; }
    if (capaCalor) { mapa.removeLayer(capaCalor); capaCalor = null; }

    if (est.capa !== 'calor') {
      const grupo = L.markerClusterGroup
        ? L.markerClusterGroup({maxClusterRadius: 45, spiderfyOnMaxZoom: true})
        : L.layerGroup();
      lista.forEach(p => {
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 6 + Math.min(6, num(p.interes) / 2),
          fillColor: color(p.estado), color: '#fff', weight: 2, fillOpacity: .9
        });
        m.bindPopup(globo(p), {minWidth: 250, maxWidth: 320});
        m.bindTooltip(p.nombre + ' · ' + eur(p.gasto_anual) + '/año');
        grupo.addLayer(m);
      });
      capaPuntos = grupo.addTo(mapa);
    }

    if (est.capa !== 'puntos' && L.heatLayer) {
      const maxGasto = Math.max(1, ...lista.map(p => num(p.gasto_anual)));
      capaCalor = L.heatLayer(lista.map(p => [p.lat, p.lng, num(p.gasto_anual) / maxGasto]),
        {radius: 32, blur: 22, maxZoom: 14}).addTo(mapa);
    }

    if (lista.length) {
      const limites = L.latLngBounds(lista.map(p => [p.lat, p.lng]));
      mapa.fitBounds(limites.pad(0.12), {maxZoom: 14});
    }

    const ganados = lista.filter(p => normal(p.estado) === 'ganado');
    poner(kpisCaja, kpis(
      kpi('Clientes en el mapa', miles(lista.length),
        d.sin_coordenadas ? miles(d.sin_coordenadas) + ' sin coordenadas' : 'todos situados'),
      kpi('Vendidos', miles(ganados.length), pct(lista.length ? ganados.length * 100 / lista.length : 0),
        {estado: 'bien'}),
      kpi('Facturado en la zona', eur(suma(ganados, p => p.operacion ? p.operacion.total : 0)),
        'IVA incluido'),
      kpi('Gasto medio', eur(lista.length ? suma(lista, 'gasto_anual') / lista.length : 0),
        'energía al año por casa')
    ));

    const mun = {};
    lista.forEach(p => {
      const k = txt(p.municipio) || 'Sin municipio';
      if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, gasto: 0};
      mun[k].clientes++; mun[k].gasto += num(p.gasto_anual);
      if (normal(p.estado) === 'ganado') { mun[k].ventas++; mun[k].importe += p.operacion ? p.operacion.total : 0; }
    });
    const filas = Object.values(mun).map(m => Object.assign(m, {
      conversion: m.clientes ? m.ventas * 100 / m.clientes : 0,
      gasto_medio: m.clientes ? m.gasto / m.clientes : 0
    })).sort((a, b) => b.clientes - a.clientes);

    poner(tablaCaja, tabla([
      {clave: 'municipio', et: 'Municipio'},
      {clave: 'clientes', et: 'Clientes', num: true},
      {clave: 'ventas', et: 'Ventas', num: true},
      {clave: 'conversion', et: 'Conversión', num: true, pinta: m => pct(m.conversion)},
      {clave: 'importe', et: 'Facturado', num: true, pinta: m => eur(m.importe)},
      {clave: 'gasto_medio', et: 'Gasto medio', num: true, pinta: m => eur(m.gasto_medio)}
    ], filas, {csv: 'zonas_mapa.csv', vacio: 'Sin datos.',
      alPulsar: m => { est.municipio = m.municipio; pinta(); }}));
  }

  async function geocodificar() {
    if (!d.sin_coordenadas) return aviso('Todos los clientes con dirección ya están situados.');
    if (!await confirmar('Voy a buscar las coordenadas de ' + d.sin_coordenadas +
      ' cliente(s) a partir de su dirección. Se hace de 20 en 20.', {botón: 'Buscar', peligro: false})) return;
    try {
      const r = await api.pedir('geocodificar', {limite: 20});
      aviso('Situados ' + r.hechos + ' clientes. Quedan ' + r.pendientes + '.');
      const nuevo = await api.pedir('mapa');
      d.puntos = nuevo.puntos; d.sin_coordenadas = nuevo.sin_coordenadas;
      pinta();
    } catch (e) { avisoError(e); }
  }

  poner(contenedor,
    f.nodo,
    kpisCaja,
    h('.tarjeta', h('.cuerpo.sin', divMapa,
      h('div', {estilo: {padding: '10px 14px'}},
        h('.leyenda-mapa', Object.entries(COLORES).map(([k, c]) =>
          h('span', h('i.pin', {estilo: {background: c}}),
            api.etiquetaCatalogo('estadosCliente', k)))),
        h('p.nota', {estilo: {marginTop: '8px'}},
          'El tamaño del punto crece con el interés del cliente. Pulsa un punto para ver su ficha.')))),
    tarjeta('Zonas', tablaCaja, {sinRelleno: true,
      subtitulo: 'Pulsa una fila para filtrar el mapa por ese municipio'}));

  setTimeout(() => { mapa.invalidateSize(); pinta(); }, 80);
  return caja;
}
