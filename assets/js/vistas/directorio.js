/* vistas/directorio.js — el archivo histórico de la casa.
 *
 * Dos pantallas en una: los clientes de siempre (Zero Wattios y Aurus) con
 * su buscador y su mapa, y las puertas que se han ido tocando, en mapa o en
 * listado, con las de esta semana destacadas.
 *
 * Solo entra quien está en la lista de Ajustes. El servidor lo comprueba
 * igualmente; esto es solo para no enseñar una puerta que no se abre.
 */

import {h, poner, txt, num, miles, fechaCorta, hoyISO, mapsHref, comoLlegarHref} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, aviso, avisoError, cargando, filtros,
        ventanaFormulario, confirmar} from '../ui.js';
import {descargarExcel, informeImprimible, conFecha} from '../exportar.js';
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

/* Cuatro puntos sueltos al otro lado del mundo —un viaje guardado en Google
   Maps que se cuela en el export— dejaban el mapa en vista planeta. Se encaja
   sobre donde está el grueso y los raros se ven igual, pero no mandan. */
function encajar(mapa, puntos) {
  if (!puntos.length) return;
  const orden = n => puntos.map(p => p[n]).sort((a, b) => a - b);
  const la = orden(0), lo = orden(1);
  const medio = v => v[Math.floor(v.length / 2)];
  const cerca = puntos.filter(p =>
    Math.abs(p[0] - medio(la)) < 3 && Math.abs(p[1] - medio(lo)) < 3);
  const usar = cerca.length >= Math.max(3, puntos.length * 0.6) ? cerca : puntos;
  mapa.fitBounds(L.latLngBounds(usar.map(p => [p[0], p[1]])), {padding: [30, 30]});
}

/* ---------- marcar filas para borrarlas en bloque ---------- */

/* Una casilla por fila y una barra abajo con lo que se lleva marcado. El
   conjunto vive fuera de la tabla, así que sigue ahí aunque se cambie de
   página o se reordene. */
function casilla(marcadas, id, alCambiar) {
  const c = h('input', {type: 'checkbox', checked: marcadas.has(id),
    estilo: {width: 'auto', margin: 0, cursor: 'pointer'},
    onclick: e => {
      e.stopPropagation();
      if (e.target.checked) marcadas.add(id); else marcadas.delete(id);
      alCambiar();
    }});
  return c;
}

function barraMarcadas(marcadas, {uno, varios, alBorrar, alLimpiar}) {
  if (!marcadas.size) return null;
  return h('.filtros', {estilo: {alignItems: 'center', padding: '10px 14px',
    background: 'var(--fondo-2, #f4f6f3)', borderTop: '1px solid var(--linea, #e3e7e0)'}},
    h('b', miles(marcadas.size) + (marcadas.size === 1 ? ' ' + uno : ' ' + varios) + ' marcad' +
      (marcadas.size === 1 ? 'a' : 'as')),
    h('button.btn.peligro', {onclick: alBorrar}, 'Borrar ' + (marcadas.size === 1 ? 'la marcada' : 'las marcadas')),
    h('button.btn', {onclick: alLimpiar}, 'Quitar la marca'));
}

/* ---------- pantalla ---------- */

export async function vistaDirectorio({id, ir}) {
  return id === 'puertas' ? pantallaPuertas({ir}) : pantallaClientes({ir});
}

/* ================= clientes del archivo ================= */

async function pantallaClientes({ir}) {
  const caja = h('div');
  const estado = {buscar: '', empresa: '', municipio: '', pagina: 1};
  const marcadas = new Set();
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
       accion: () => { verMapa = !verMapa; if (verMapa) pintaMapa(ultimo); else poner(zonaMapa); pintaFiltros(ultimo); }},
      {tipo: 'boton', et: 'Excel', accion: () => sacar('excel')},
      {tipo: 'boton', et: 'PDF', accion: () => sacar('pdf')},
      {tipo: 'boton', clase: 'primario', et: '+ Nueva ficha', accion: () => editarFicha(null)}
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
      {clave: 'sel', et: '', noOrden: true, ancho: '34px',
       pinta: c => casilla(marcadas, String(c.id), () => pintaLista(ultimo))},
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
      {clave: 'ultima_visita', et: 'Última visita', pinta: c => c.ultima_visita ? fechaCorta(c.ultima_visita) : '—'},
      {clave: 'editar', et: '', noOrden: true, ancho: '80px',
       pinta: c => h('button.btn.mini', {onclick: e => { e.stopPropagation(); editarFicha(c); }}, 'Editar')}
    ];
    const paginas = Math.max(1, Math.ceil(d.encontrados / d.por_pagina));
    poner(zonaLista, tarjeta(
      miles(d.encontrados) + ' de ' + miles(d.total) + ' fichas',
      h('div',
        tabla(cols, d.clientes, {alPulsar: c => abrirFicha(c.ref),
          ordenInicial: {clave: 'ultima_visita', desc: true},
          vacio: 'Aquí no hay nadie con eso.'}),
        barraMarcadas(marcadas, {uno: 'ficha', varios: 'fichas',
          alBorrar: () => borrarFichas([...marcadas]),
          alLimpiar: () => { marcadas.clear(); pintaLista(ultimo); }}),
        paginas > 1 ? h('.filtros',
          h('button.btn', {disabled: d.pagina <= 1,
            onclick: () => { estado.pagina = d.pagina - 1; pedir(); }}, '← Anteriores'),
          h('span.nota', {estilo: {alignSelf: 'center'}}, 'Página ' + d.pagina + ' de ' + paginas),
          h('button.btn', {disabled: d.pagina >= paginas,
            onclick: () => { estado.pagina = d.pagina + 1; pedir(); }}, 'Siguientes →')) : null),
      {sinRelleno: true}));
  }

  /* ---------- sacar lo que se está viendo ---------- */

  /* La pantalla va de cincuenta en cincuenta, así que para exportar se pide
     aparte la lista filtrada entera; si no, saldría solo la página. */
  const COLS_EXCEL = [
    ['Referencia', c => txt(c.ref)], ['Empresa', c => txt(c.empresa)],
    ['Cliente', c => txt(c.nombre)], ['Otros', c => txt(c.otros)],
    ['Teléfono', c => txt(c.telefono)], ['Correo', c => txt(c.email)],
    ['Dirección', c => txt(c.direccion)], ['Municipio', c => txt(c.municipio)],
    ['CP', c => txt(c.cp)], ['Interés', c => txt(c.interes)],
    ['Situación', c => txt(c.situacion)], ['Comerciales', c => txt(c.comerciales)],
    ['Producto', c => txt(c.producto)], ['Importe', c => num(c.importe) || ''],
    ['Financiera', c => txt(c.financiera)], ['Instalador', c => txt(c.instalador)],
    ['Visitas', c => num(c.n_visitas) || 0],
    ['Primera visita', c => txt(c.primera_visita)], ['Última visita', c => txt(c.ultima_visita)],
    ['Latitud', c => num(c.lat) || ''], ['Longitud', c => num(c.lon) || ''],
    ['Precisión', c => txt(c.precision)], ['Notas', c => txt(c.notas)]
  ];

  function comoSeFiltro() {
    const trozos = [];
    if (estado.buscar) trozos.push('buscando «' + estado.buscar + '»');
    if (estado.empresa) trozos.push('empresa ' + estado.empresa);
    if (estado.municipio) trozos.push('municipio ' + estado.municipio);
    return trozos.length ? trozos.join(', ') : 'sin filtrar, el archivo entero';
  }

  async function sacar(formato) {
    const d = ultimo;
    if (!d) return;
    aviso('Preparando ' + (formato === 'pdf' ? 'el informe' : 'el Excel') + '…');
    let lista;
    try {
      lista = (await api.pedir('directorio', Object.assign({}, estado, {todo: true}))).clientes;
    } catch (e) { return avisoError(e); }

    if (formato === 'excel') {
      descargarExcel(conFecha('directorio-zero-wattios'), [{
        nombre: 'Directorio',
        cabeceras: COLS_EXCEL.map(c => c[0]),
        filas: lista.map(c => COLS_EXCEL.map(col => col[1](c)))
      }]);
      return aviso(miles(lista.length) + ' fichas en el Excel.', 'bien');
    }

    const porMunicipio = {};
    lista.forEach(c => { const m = txt(c.municipio) || '(sin municipio)';
      porMunicipio[m] = (porMunicipio[m] || 0) + 1; });
    const conVisita = lista.filter(c => txt(c.ultima_visita)).length;
    informeImprimible({
      titulo: 'Directorio de clientes',
      subtitulo: comoSeFiltro(),
      resumen: [
        {et: 'Fichas', valor: miles(lista.length)},
        {et: 'Del archivo entero', valor: miles(d.total)},
        {et: 'Con visita apuntada', valor: miles(conVisita)},
        {et: 'Municipios', valor: miles(Object.keys(porMunicipio).length)}
      ],
      reparto: {titulo: 'Por municipio',
        partes: Object.keys(porMunicipio).sort((a, b) => porMunicipio[b] - porMunicipio[a])
          .slice(0, 22).map(k => ({et: k, n: porMunicipio[k]}))},
      cabeceras: [{et: 'Cliente'}, {et: 'Empresa'}, {et: 'Municipio'}, {et: 'Dirección'},
                  {et: 'Teléfono'}, {et: 'Visitas', num: true}, {et: 'Última visita'}],
      filas: lista.map(c => [txt(c.nombre) || '(sin nombre)', txt(c.empresa), txt(c.municipio),
        txt(c.direccion), txt(c.telefono), num(c.n_visitas) || 0,
        c.ultima_visita ? fechaCorta(c.ultima_visita) : '—']),
      pie: 'ZERO WATTIOS INGENIERÍA · Directorio interno. En el diálogo de impresión, ' +
           'elige «Guardar como PDF».'
    });
  }

  /* ---------- dar de alta, corregir y quitar ---------- */

  const CAMPOS_FICHA = [
    {id: 'nombre', et: 'Cliente', ancho: 2, requerido: true},
    {id: 'empresa', et: 'Empresa', tipo: 'select', vacio: '—',
     opciones: ['Zero Wattios', 'Aurus']},
    {id: 'otros', et: 'Otros nombres', ancho: 2},
    {id: 'telefono', et: 'Teléfono', tipo: 'tel'},
    {id: 'email', et: 'Correo', tipo: 'email', ancho: 2},
    {id: 'direccion', et: 'Dirección', ancho: 2},
    {id: 'municipio', et: 'Municipio'},
    {id: 'cp', et: 'Código postal'},
    {separador: 'Dónde cae'},
    {id: 'lat', et: 'Latitud', tipo: 'numero', paso: '0.000001',
     ayuda: 'Si la dejas vacía no sale en el mapa.'},
    {id: 'lon', et: 'Longitud', tipo: 'numero', paso: '0.000001'},
    {id: 'precision', et: 'Precisión', tipo: 'select', vacio: '—',
     opciones: [['exacta', 'Exacta'], ['calle', 'Por la calle'], ['municipio', 'Solo el municipio']]},
    {separador: 'Cómo va'},
    {id: 'interes', et: 'Interés'},
    {id: 'situacion', et: 'Situación'},
    {id: 'comerciales', et: 'Comerciales'},
    {id: 'producto', et: 'Producto'},
    {id: 'importe', et: 'Importe', tipo: 'euro'},
    {id: 'financiera', et: 'Financiera'},
    {id: 'instalador', et: 'Instalador'},
    {id: 'etiquetas', et: 'Etiquetas'},
    {id: 'n_visitas', et: 'Visitas', tipo: 'numero'},
    {id: 'primera_visita', et: 'Primera visita', tipo: 'fecha'},
    {id: 'ultima_visita', et: 'Última visita', tipo: 'fecha'},
    {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
  ];

  function editarFicha(c) {
    const nueva = !c;
    ventanaFormulario({
      titulo: nueva ? 'Nueva ficha del directorio' : 'Editar ' + (txt(c.nombre) || 'la ficha'),
      ancha: true,
      campos: CAMPOS_FICHA,
      valores: c || {},
      textoBoton: nueva ? 'Dar de alta' : 'Guardar',
      alGuardar: async datos => {
        const cliente = Object.assign({}, datos);
        if (!nueva) cliente.id = c.id;
        const r = await api.pedir('guardarDirectorio', {cliente});
        if (r.coordenada_fuera) {
          aviso('Guardada, pero la coordenada caía fuera de España y se ha quitado.', 'error');
        } else {
          aviso(nueva ? 'Ficha dada de alta.' : 'Ficha guardada.', 'bien');
        }
        marcadas.clear();
        await pedir();
      }
    });
  }

  async function borrarFichas(ids) {
    const cuantas = ids.length;
    if (!cuantas) return;
    if (!await confirmar(
      cuantas === 1
        ? 'Se borra la ficha y las visitas que tenga apuntadas. Esto no se puede deshacer.'
        : 'Se borran ' + miles(cuantas) + ' fichas y las visitas que tengan apuntadas. ' +
          'Esto no se puede deshacer.',
      {titulo: cuantas === 1 ? '¿Borrar la ficha?' : '¿Borrar ' + miles(cuantas) + ' fichas?',
       botón: 'Sí, borrar'})) return;
    try {
      const r = await api.pedir('borrarDirectorio', {ids});
      aviso('Fuera ' + miles(r.borradas) + (r.borradas === 1 ? ' ficha' : ' fichas') +
        (r.visitas_borradas ? ' y ' + miles(r.visitas_borradas) + ' visitas' : '') + '.', 'bien');
      marcadas.clear();
      await pedir();
    } catch (e) { avisoError(e); }
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
          h('button.btn.primario', {onclick: () => editarFicha(c)}, 'Editar'),
          h('button.btn.peligro', {onclick: () => borrarFichas([String(c.id)])}, 'Borrar'),
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
  const marcadas = new Set();
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
      d.semana.sin_fecha ? kpi('Sin fecha', miles(d.semana.sin_fecha),
        'tocadas, pero no sabemos qué día') : null,
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
       accion: () => { verMapa = !verMapa; pintaFiltros(ultimo); pintaCuerpo(ultimo); }},
      {tipo: 'boton', et: 'Excel', accion: () => sacar('excel')},
      {tipo: 'boton', et: 'PDF', accion: () => sacar('pdf')},
      {tipo: 'boton', clase: 'primario', et: '+ Nueva puerta', accion: () => editarPuerta(null)}
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
      {clave: 'sel', et: '', noOrden: true, ancho: '34px',
       pinta: p => casilla(marcadas, String(p.id), () => pintaCuerpo(ultimo))},
      {clave: 'fecha', et: 'Fecha', ancho: '120px',
       orden: p => txt(p.fecha) ? txt(p.fecha) + ' ' + txt(p.hora) : '',
       pinta: p => h('span', p.fecha ? fechaCorta(p.fecha) : '—',
         p.nueva === 'si' ? h('span.etiqueta.marca', {estilo: {marginLeft: '6px'}}, 'nueva') : null)},
      {clave: 'hora', et: 'Hora', ancho: '70px', pinta: p => p.hora || '—'},
      {clave: 'zona', et: 'Zona'},
      {clave: 'direccion', et: 'Dónde', pinta: p => h('div',
        h('b', p.nombre || p.direccion || 'Puerta'),
        p.nombre && p.direccion ? h('small.nota', h('br'), p.direccion) : null)},
      {clave: 'nota', et: 'Nota', pinta: p => p.nota || p.categoria || '—'},
      {clave: 'ver', et: '', noOrden: true, ancho: '150px',
       pinta: p => h('div', {estilo: {display: 'flex', gap: '6px'}},
         h('a.btn.mini', {href: 'https://www.google.com/maps?q=' + p.lat + ',' + p.lon,
           target: '_blank', rel: 'noopener'}, 'Ver'),
         h('button.btn.mini', {onclick: e => { e.stopPropagation(); editarPuerta(p); }}, 'Editar'))}
    ];
    return tarjeta(miles(d.encontradas) + (d.encontradas === 1 ? ' puerta' : ' puertas'),
      h('div',
        tabla(cols, d.puertas.slice(0, 600), {
          ordenInicial: {clave: 'fecha', desc: true},
          vacio: 'No hay puertas con ese filtro.'}),
        barraMarcadas(marcadas, {uno: 'puerta', varios: 'puertas',
          alBorrar: () => borrarPuertas([...marcadas]),
          alLimpiar: () => { marcadas.clear(); pintaCuerpo(ultimo); }})),
      {sinRelleno: true,
       subtitulo: d.encontradas > 600 ? 'Se muestran las 600 primeras; afina el filtro para ver el resto.' : null});
  }

  /* ---------- sacar lo que se está viendo ---------- */

  function comoSeFiltro() {
    const trozos = [];
    if (estado.buscar) trozos.push('buscando «' + estado.buscar + '»');
    if (estado.zona) trozos.push('zona ' + estado.zona);
    if (estado.desde) trozos.push('desde el ' + fechaCorta(estado.desde));
    if (estado.hasta) trozos.push('hasta el ' + fechaCorta(estado.hasta));
    return trozos.length ? trozos.join(', ') : 'sin filtrar, todas las que llevamos';
  }

  function sacar(formato) {
    const d = ultimo;
    if (!d) return;
    const lista = d.puertas;

    if (formato === 'excel') {
      const cab = ['Fecha', 'Hora', 'Zona', 'Nombre', 'Dirección', 'Nota', 'Categoría',
                   'Lista', 'Nueva esta semana', 'Latitud', 'Longitud'];
      descargarExcel(conFecha('puertas-zero-wattios'), [
        {nombre: 'Puertas', cabeceras: cab,
         filas: lista.map(p => [txt(p.fecha), txt(p.hora), txt(p.zona), txt(p.nombre),
           txt(p.direccion), txt(p.nota), txt(p.categoria), txt(p.lista),
           p.nueva === 'si' ? 'Sí' : 'No', num(p.lat) || '', num(p.lon) || ''])},
        {nombre: 'Por zona', cabeceras: ['Zona', 'Puertas'],
         filas: d.zonas.map(z => [z.zona, z.n])},
        {nombre: 'Por semana', cabeceras: ['Semana del', 'Puertas'],
         filas: d.semanas.map(x => [x.semana, x.n])}
      ]);
      return aviso(miles(lista.length) + ' puertas en el Excel.', 'bien');
    }

    const porZona = {};
    lista.forEach(p => { const z = txt(p.zona) || '(sin zona)'; porZona[z] = (porZona[z] || 0) + 1; });
    informeImprimible({
      titulo: 'Puertas tocadas',
      subtitulo: comoSeFiltro(),
      resumen: [
        {et: 'En este listado', valor: miles(lista.length)},
        {et: 'Tocadas en total', valor: miles(d.total)},
        {et: 'Nuevas esta semana', valor: miles(d.semana.nuevas),
         nota: 'desde el lunes ' + fechaCorta(d.semana.lunes)},
        {et: 'La semana pasada', valor: miles(d.semana.semana_pasada)},
        {et: 'Sin fecha', valor: miles(d.semana.sin_fecha)}
      ],
      reparto: {titulo: 'Por zona',
        partes: Object.keys(porZona).sort((a, b) => porZona[b] - porZona[a])
          .slice(0, 22).map(k => ({et: k, n: porZona[k]}))},
      cabeceras: [{et: 'Fecha'}, {et: 'Hora'}, {et: 'Zona'}, {et: 'Dónde'}, {et: 'Nota'}, {et: 'Nueva'}],
      filas: lista
        .map(p => [p.fecha ? fechaCorta(p.fecha) : '—', txt(p.hora) || '—', txt(p.zona),
          txt(p.nombre) || txt(p.direccion) || 'Puerta', txt(p.nota) || txt(p.categoria),
          p.nueva === 'si' ? 'Sí' : '']),
      pie: 'ZERO WATTIOS INGENIERÍA · Puerta a puerta. En el diálogo de impresión, ' +
           'elige «Guardar como PDF».'
    });
  }

  /* ---------- dar de alta, corregir y quitar ---------- */

  function editarPuerta(p) {
    const nueva = !p;
    ventanaFormulario({
      titulo: nueva ? 'Nueva puerta' : 'Editar la puerta',
      ancha: true,
      campos: [
        {id: 'nombre', et: 'Nombre o referencia', ancho: 2},
        {id: 'direccion', et: 'Dirección', ancho: 2},
        {id: 'zona', et: 'Zona', requerido: true},
        {id: 'fecha', et: 'Día que se tocó', tipo: 'fecha',
         ayuda: 'Sin fecha no cuenta como nueva de la semana.'},
        {id: 'hora', et: 'Hora', tipo: 'hora'},
        {separador: 'Dónde cae'},
        {id: 'lat', et: 'Latitud', tipo: 'numero', paso: '0.000001', requerido: true},
        {id: 'lon', et: 'Longitud', tipo: 'numero', paso: '0.000001', requerido: true},
        {separador: 'Qué pasó'},
        {id: 'categoria', et: 'Categoría'},
        {id: 'lista', et: 'Lista de origen'},
        {id: 'nota', et: 'Nota', tipo: 'area', ancho: 3}
      ],
      valores: p || {zona: estado.zona, fecha: hoyISO()},
      textoBoton: nueva ? 'Apuntar la puerta' : 'Guardar',
      alGuardar: async datos => {
        const puerta = Object.assign({}, datos);
        if (!nueva) puerta.id = p.id;
        await api.pedir('guardarPuerta', {puerta});
        aviso(nueva ? 'Puerta apuntada.' : 'Puerta guardada.', 'bien');
        marcadas.clear();
        await pedir();
      }
    });
  }

  async function borrarPuertas(ids) {
    const cuantas = ids.length;
    if (!cuantas) return;
    if (!await confirmar(
      cuantas === 1 ? 'Se borra esa puerta del histórico. Esto no se puede deshacer.'
                    : 'Se borran ' + miles(cuantas) + ' puertas del histórico. Esto no se puede deshacer.',
      {titulo: cuantas === 1 ? '¿Borrar la puerta?' : '¿Borrar ' + miles(cuantas) + ' puertas?',
       botón: 'Sí, borrar'})) return;
    try {
      const r = await api.pedir('borrarPuertas', {ids});
      aviso('Fuera ' + miles(r.borradas) + (r.borradas === 1 ? ' puerta' : ' puertas') + '.', 'bien');
      marcadas.clear();
      await pedir();
    } catch (e) { avisoError(e); }
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
