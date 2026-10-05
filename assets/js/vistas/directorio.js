/* vistas/directorio.js — el archivo histórico de la casa.
 *
 * Dos pantallas en una: los clientes de siempre (Zero Wattios y Aurus) con
 * su buscador y su mapa, y las puertas que se han ido tocando, en mapa o en
 * listado, con las de esta semana destacadas.
 *
 * Solo entra quien está en la lista de Ajustes. El servidor lo comprueba
 * igualmente; esto es solo para no enseñar una puerta que no se abre.
 */

import {h, poner, txt, num, miles, fechaCorta, mapsHref, comoLlegarHref} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, aviso, avisoError, cargando, filtros} from '../ui.js';
import {cargarLeaflet} from './mapa.js';

const LIMA = '#b4fa1e';
const CARBON = '#242422';

/* ---------- utilidades de mapa ---------- */

function base(div) {
  const m = L.map(div, {scrollWheelZoom: true}).setView([40.45, -3.75], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'}).addTo(m);
  return m;
}

/* El mapa se crea antes de que la pantalla cuelgue del documento, y Leaflet
   necesita saber cuánto mide para dibujar. Así que se espera a que esté
   puesto y con ancho, y solo entonces se monta. */
function cuandoTengaSitio(div, fn) {
  let intentos = 0;
  const mirar = () => {
    if (div.isConnected && div.offsetWidth > 0) { fn(); return; }
    if (++intentos > 60) return;
    setTimeout(mirar, 50);
  };
  mirar();
}

function encajar(mapa, puntos) {
  if (!puntos.length) return;
  mapa.fitBounds(L.latLngBounds(puntos.map(p => [p[0], p[1]])), {padding: [30, 30]});
}

/* ---------- pantalla ---------- */

export async function vistaDirectorio({id, ir}) {
  return id === 'puertas' ? pantallaPuertas({ir}) : pantallaClientes({ir});
}

/* ================= clientes del archivo ================= */

async function pantallaClientes({ir}) {
  const caja = h('div');
  const estado = {buscar: '', empresa: '', municipio: '', pagina: 1};
  let ultimo = null;

  const pestañas = h('.filtros',
    h('button.btn.primario', 'Clientes'),
    h('button.btn', {onclick: () => ir('directorio/puertas')}, 'Puertas tocadas'));

  const zonaFiltros = h('div');
  const zonaMapa = h('div');
  const zonaLista = h('div', cargando('Abriendo el archivo…'));
  poner(caja, pestañas, zonaFiltros, zonaMapa, zonaLista);

  let verMapa = false;

  async function pedir() {
    poner(zonaLista, cargando('Buscando…'));
    try {
      const d = await api.pedir('directorio', estado);
      ultimo = d;
      pintaFiltros(d);
      pintaLista(d);
      if (verMapa) pintaMapa(d);
    } catch (e) { avisoError(e); poner(zonaLista, h('.vacio', txt(e.message))); }
  }

  function pintaFiltros(d) {
    const f = filtros([
      {id: 'buscar', et: 'Buscar por nombre, dirección, teléfono…', valor: estado.buscar},
      {tipo: 'select', id: 'empresa', valor: estado.empresa,
       opciones: [['', 'Todas las empresas']].concat(d.empresas.map(x => [x.empresa, x.empresa + ' (' + x.n + ')']))},
      {tipo: 'select', id: 'municipio', valor: estado.municipio,
       opciones: [['', 'Todos los municipios']].concat(d.municipios.map(x => [x.municipio, x.municipio + ' (' + x.n + ')']))},
      {tipo: 'boton', et: verMapa ? 'Ocultar el mapa' : 'Ver en el mapa',
       accion: () => { verMapa = !verMapa; if (verMapa) pintaMapa(ultimo); else poner(zonaMapa); pintaFiltros(ultimo); }}
    ], v => {
      let cambio = false;
      ['buscar', 'empresa', 'municipio'].forEach(k => {
        if (v[k] !== undefined && v[k] !== estado[k]) { estado[k] = v[k]; cambio = true; }
      });
      if (cambio) { estado.pagina = 1; clearTimeout(pintaFiltros.t); pintaFiltros.t = setTimeout(pedir, 350); }
    });
    poner(zonaFiltros, f.nodo);
  }

  function pintaMapa(d) {
    const div = h('div', {estilo: {height: '440px', borderRadius: '12px', overflow: 'hidden'}});
    poner(zonaMapa, tarjeta('Dónde están · ' + miles(d.puntos.length) + ' con dirección localizada', div,
      {sinRelleno: true, subtitulo: 'De ' + miles(d.encontrados) + ' fichas, estas son las que tienen coordenada.'}));
    cargarLeaflet().then(() => cuandoTengaSitio(div, () => {
      const m = base(div);
      const grupo = L.markerClusterGroup ? L.markerClusterGroup({maxClusterRadius: 48}) : L.layerGroup();
      d.puntos.forEach(p => {
        const [ref, la, lo, nombre, empresa, muni, prec] = p;
        L.circleMarker([la, lo], {
          radius: prec === 'municipio' ? 4 : 6, weight: 1, color: '#fff',
          fillColor: empresa === 'Aurus' ? '#4a3aa7' : CARBON, fillOpacity: .85
        }).bindPopup('<b>' + nombre + '</b><br>' + muni + '<br><small>' + empresa + ' · ' + ref +
          (prec === 'municipio' ? ' · situado solo por municipio' : '') + '</small>').addTo(grupo);
      });
      grupo.addTo(m);
      encajar(m, d.puntos.map(p => [p[1], p[2]]));
      setTimeout(() => m.invalidateSize(), 60);
    }));
  }

  function pintaLista(d) {
    const cols = [
      {clave: 'nombre', et: 'Cliente', pinta: c => h('div',
        h('b', txt(c.nombre) || '(sin nombre)'),
        c.otros ? h('small.nota', ' · ' + txt(c.otros)) : null)},
      {clave: 'empresa', et: 'Empresa', ancho: '110px'},
      {clave: 'municipio', et: 'Municipio'},
      {clave: 'direccion', et: 'Dirección', pinta: c => c.direccion
        ? h('a', {href: mapsHref(c.direccion), target: '_blank', rel: 'noopener'}, txt(c.direccion))
        : '—'},
      {clave: 'telefono', et: 'Teléfono', pinta: c => txt(c.telefono) || '—'},
      {clave: 'n_visitas', et: 'Visitas', num: true, valor: c => num(c.n_visitas)},
      {clave: 'ultima_visita', et: 'Última visita', pinta: c => c.ultima_visita ? fechaCorta(c.ultima_visita) : '—'}
    ];
    const paginas = Math.max(1, Math.ceil(d.encontrados / d.por_pagina));
    poner(zonaLista, tarjeta(
      miles(d.encontrados) + ' de ' + miles(d.total) + ' fichas',
      h('div',
        tabla(cols, d.clientes, {alPulsar: c => abrirFicha(c.ref), vacio: 'Aquí no hay nadie con eso.'}),
        paginas > 1 ? h('.filtros',
          h('button.btn', {disabled: d.pagina <= 1,
            onclick: () => { estado.pagina = d.pagina - 1; pedir(); }}, '← Anteriores'),
          h('span.nota', {estilo: {alignSelf: 'center'}}, 'Página ' + d.pagina + ' de ' + paginas),
          h('button.btn', {disabled: d.pagina >= paginas,
            onclick: () => { estado.pagina = d.pagina + 1; pedir(); }}, 'Siguientes →')) : null),
      {sinRelleno: true}));
  }

  async function abrirFicha(ref) {
    poner(zonaLista, cargando('Abriendo la ficha…'));
    try {
      const d = await api.pedir('directorioFicha', {ref});
      const c = d.cliente;
      const dato = (et, v) => v ? h('div', h('small.nota', et), h('div', String(v))) : null;
      poner(zonaLista, tarjeta(txt(c.nombre) || '(sin nombre)',
        h('div',
          h('.rejilla', {estilo: {display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px'}},
            dato('Empresa', c.empresa), dato('Referencia', c.ref),
            dato('Teléfono', c.telefono), dato('Correo', c.email),
            dato('Dirección', c.direccion), dato('Municipio', c.municipio),
            dato('Interés', c.interes), dato('Situación', c.situacion),
            dato('Comerciales', c.comerciales), dato('Producto', c.producto),
            dato('Importe', c.importe), dato('Financiera', c.financiera),
            dato('Instalador', c.instalador), dato('Documentos', c.n_documentos),
            dato('Primera visita', c.primera_visita && fechaCorta(c.primera_visita)),
            dato('Última visita', c.ultima_visita && fechaCorta(c.ultima_visita))),
          c.notas ? h('p', {estilo: {marginTop: '14px', whiteSpace: 'pre-wrap'}}, txt(c.notas)) : null,
          h('h3', {estilo: {marginTop: '18px'}}, 'Visitas (' + d.visitas.length + ')'),
          tabla([
            {clave: 'fecha', et: 'Fecha', pinta: v => v.fecha ? fechaCorta(v.fecha) : '—'},
            {clave: 'hora', et: 'Hora'},
            {clave: 'comercial', et: 'Comercial'},
            {clave: 'etiquetas', et: 'Etiquetas'}
          ], d.visitas, {vacio: 'No hay visitas apuntadas.'})),
        {acciones: [
          c.direccion ? h('a.btn', {href: comoLlegarHref(c.direccion), target: '_blank', rel: 'noopener'}, 'Cómo llegar') : null,
          h('button.btn', {onclick: () => pintaLista(ultimo)}, 'Volver al listado')]}));
    } catch (e) { avisoError(e); pintaLista(ultimo); }
  }

  await pedir();
  return caja;
}

/* ================= puertas tocadas ================= */

async function pantallaPuertas({ir}) {
  const caja = h('div');
  const estado = {zona: '', buscar: '', desde: '', hasta: ''};
  let verMapa = true;
  let ultimo = null;

  const pestañas = h('.filtros',
    h('button.btn', {onclick: () => ir('directorio')}, 'Clientes'),
    h('button.btn.primario', 'Puertas tocadas'));

  const zonaKpis = h('div');
  const zonaFiltros = h('div');
  const zonaCuerpo = h('div', cargando('Contando puertas…'));
  poner(caja, pestañas, zonaKpis, zonaFiltros, zonaCuerpo);

  async function pedir() {
    poner(zonaCuerpo, cargando('Buscando…'));
    try {
      const d = await api.pedir('puertas', estado);
      ultimo = d;
      pintaKpis(d); pintaFiltros(d); pintaCuerpo(d);
    } catch (e) { avisoError(e); poner(zonaCuerpo, h('.vacio', txt(e.message))); }
  }

  function pintaKpis(d) {
    const mejor = d.zonas[0];
    poner(zonaKpis, kpis(
      kpi('Puertas tocadas', miles(d.total), 'desde que se lleva la cuenta'),
      kpi('Nuevas esta semana', miles(d.semana.nuevas), 'desde el lunes ' + fechaCorta(d.semana.lunes),
          {destacado: true, estado: d.semana.nuevas ? 'bien' : null}),
      kpi('La semana pasada', miles(d.semana.semana_pasada), 'para comparar'),
      kpi('Zona más trabajada', mejor ? mejor.zona : '—',
          mejor ? miles(mejor.n) + (mejor.n === 1 ? ' puerta' : ' puertas') : '')));
  }

  function pintaFiltros(d) {
    const f = filtros([
      {id: 'buscar', et: 'Buscar por calle, nota o zona…', valor: estado.buscar},
      {tipo: 'select', id: 'zona', valor: estado.zona,
       opciones: [['', 'Todas las zonas']].concat(d.zonas.map(z => [z.zona, z.zona + ' (' + z.n + ')']))},
      {tipo: 'fecha', id: 'desde', et: 'Desde', valor: estado.desde},
      {tipo: 'fecha', id: 'hasta', et: 'Hasta', valor: estado.hasta},
      {tipo: 'boton', et: 'Solo las de esta semana',
       accion: () => { estado.desde = d.semana.lunes; estado.hasta = ''; pedir(); }},
      {tipo: 'boton', et: verMapa ? 'Ver en listado' : 'Ver en el mapa',
       accion: () => { verMapa = !verMapa; pintaFiltros(ultimo); pintaCuerpo(ultimo); }}
    ], v => {
      let cambio = false;
      ['buscar', 'zona', 'desde', 'hasta'].forEach(k => {
        if (v[k] !== undefined && v[k] !== estado[k]) { estado[k] = v[k]; cambio = true; }
      });
      if (cambio) { clearTimeout(pintaFiltros.t); pintaFiltros.t = setTimeout(pedir, 350); }
    });
    poner(zonaFiltros, f.nodo);
  }

  function pintaCuerpo(d) {
    poner(zonaCuerpo, verMapa ? mapaPuertas(d) : listaPuertas(d), semanasPuertas(d));
  }

  function mapaPuertas(d) {
    const div = h('div', {estilo: {height: '520px', borderRadius: '12px', overflow: 'hidden'}});
    const t = tarjeta(miles(d.encontradas) + (d.encontradas === 1 ? ' puerta' : ' puertas') + ' en el mapa', div,
      {sinRelleno: true,
       subtitulo: 'En verde las de esta semana; en oscuro, las de antes.'});
    cargarLeaflet().then(() => cuandoTengaSitio(div, () => {
      const m = base(div);
      const grupo = L.markerClusterGroup ? L.markerClusterGroup({maxClusterRadius: 40}) : L.layerGroup();
      d.puertas.forEach(p => {
        const nueva = p.nueva === 'si';
        L.circleMarker([p.lat, p.lon], {
          radius: nueva ? 8 : 5, weight: nueva ? 2 : 1,
          color: nueva ? CARBON : '#fff', fillColor: nueva ? LIMA : '#5b6159', fillOpacity: .9
        }).bindPopup('<b>' + (p.nombre || p.direccion || 'Puerta') + '</b><br>' +
          (p.direccion || '') + '<br><small>' + p.zona + ' · ' +
          (p.fecha ? fechaCorta(p.fecha) : 'sin fecha') + (p.hora ? ' ' + p.hora : '') +
          (p.nota ? '<br>Nota: ' + p.nota : '') + '</small>').addTo(grupo);
      });
      grupo.addTo(m);
      encajar(m, d.puertas.map(p => [p.lat, p.lon]));
      setTimeout(() => m.invalidateSize(), 60);
    }));
    return t;
  }

  function listaPuertas(d) {
    const cols = [
      {clave: 'fecha', et: 'Fecha', ancho: '120px',
       pinta: p => h('span', p.fecha ? fechaCorta(p.fecha) : '—',
         p.nueva === 'si' ? h('span.etiqueta.marca', {estilo: {marginLeft: '6px'}}, 'nueva') : null)},
      {clave: 'hora', et: 'Hora', ancho: '70px', pinta: p => p.hora || '—'},
      {clave: 'zona', et: 'Zona'},
      {clave: 'direccion', et: 'Dónde', pinta: p => h('div',
        h('b', p.nombre || p.direccion || 'Puerta'),
        p.nombre && p.direccion ? h('small.nota', h('br'), p.direccion) : null)},
      {clave: 'nota', et: 'Nota', pinta: p => p.nota || p.categoria || '—'},
      {clave: 'ver', et: '', noOrden: true, ancho: '90px',
       pinta: p => h('a.btn', {href: 'https://www.google.com/maps?q=' + p.lat + ',' + p.lon,
         target: '_blank', rel: 'noopener'}, 'Ver')}
    ];
    return tarjeta(miles(d.encontradas) + (d.encontradas === 1 ? ' puerta' : ' puertas'),
      tabla(cols, d.puertas.slice(0, 600), {
        ordenInicial: {clave: 'fecha', desc: true},
        vacio: 'No hay puertas con ese filtro.'}),
      {sinRelleno: true,
       subtitulo: d.encontradas > 600 ? 'Se muestran las 600 primeras; afina el filtro para ver el resto.' : null});
  }

  function semanasPuertas(d) {
    if (!d.semanas.length) return null;
    const tope = Math.max.apply(null, d.semanas.map(s => s.n));
    return tarjeta('Puertas por semana', h('div',
      {estilo: {display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px'}},
      d.semanas.map(s => h('div', {estilo: {flex: '1', textAlign: 'center'}, title: s.semana + ': ' + s.n},
        h('div', {estilo: {height: Math.round(90 * s.n / tope) + 'px', background:
          s.semana === d.semana.lunes ? LIMA : '#d7dcd4', borderRadius: '4px 4px 0 0'}}),
        h('small.nota', {estilo: {fontSize: '10px'}}, s.semana.slice(5))))));
  }

  await pedir();
  return caja;
}
