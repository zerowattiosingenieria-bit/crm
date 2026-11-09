/* vistas/visor3d.js — Visor 3D de la vivienda para la visita.
 *
 * 09/11/2026 (Nando): «a ese visor quiero que le dé su dirección y me saque
 * el tejado y la forma de su casa, muy similar a Open Solar», con el logo de
 * Zero Wattios y todos los materiales que usamos, para fotovoltaica y
 * aerotermia.
 *
 * Fuentes públicas (todas responden al navegador, sin clave):
 *   - Dirección → coordenadas: la ficha del cliente (coordenadas) o, si no
 *     hay, CartoCiudad (IGN) y, de reserva, Nominatim (OpenStreetMap).
 *   - Forma de la casa: Catastro INSPIRE WFS de edificios (BuildingPart):
 *     planta de cada volumen y nº de plantas sobre rasante.
 *   - Foto aérea: ortofoto PNOA del IGN (WMS), pegada al suelo y a los
 *     tejados, como hace Open Solar con Google.
 * El tejado no viene en ningún sitio público con su forma: se dibuja sobre el
 * rectángulo mínimo de cada volumen con el tipo e inclinación que se elijan.
 * Producción orientativa: ≈1.650 kWh/kWp en Madrid, corregida por
 * orientación e inclinación (validar con PVGIS para la propuesta).
 */

import {h, poner, txt, num, normal} from '../util.js';
import * as api from '../api.js';
import {aviso} from '../ui.js';

/* ---------- catálogo técnico (lo que montamos) ---------- */
const PANELES = [
  {id: 'han625', n: 'Hanersun 625 W', w: 625, l: 2382, a: 1134},
  {id: 'han620', n: 'Hanersun 620 W', w: 620, l: 2382, a: 1134},
  {id: 'ris590', n: 'Risen 590 W bifacial', w: 590, l: 2278, a: 1134},
  {id: 'fb500', n: 'Full Black 500 W', w: 500, l: 1961, a: 1134},
  {id: 'p450', n: 'Panel 450 W', w: 450, l: 1903, a: 1134}
];
const INVERSORES = [
  {id: 'auto', n: 'Automático según potencia'},
  {id: 'x1h6', n: 'SolaX X1 Hybrid 6 kW (monofásico)', kw: 6, fase: 'mono'},
  {id: 'x1v10', n: 'SolaX X1-VAST 10 kW (monofásico)', kw: 10, fase: 'mono'},
  {id: 'x3h5', n: 'SolaX X3 Hybrid 5 kW (trifásico)', kw: 5, fase: 'tri'},
  {id: 'x3h10', n: 'SolaX X3 Hybrid 10 kW (trifásico)', kw: 10, fase: 'tri'},
  {id: 'x3h15', n: 'SolaX X3 Hybrid 15 kW (trifásico)', kw: 15, fase: 'tri'},
  {id: 'deye10', n: 'Deye 10 kW', kw: 10, fase: 'mono'}
];
const AEROS = [
  {id: 'no', n: 'Sin aerotermia'},
  {id: 'ht12', n: 'Domusa Dual Clima HT 12 kW (mono)', kw: 12, d: [1.04, 0.86, 0.42]},
  {id: 'ht16', n: 'Domusa Dual Clima HT 16 kW (mono)', kw: 16, d: [1.04, 0.86, 0.42]},
  {id: 'htt16', n: 'Domusa Dual Clima HTT 16 kW (trif.)', kw: 16, d: [1.10, 1.38, 0.45]},
  {id: 'htt19', n: 'Domusa Dual Clima HTT 19 kW (trif.)', kw: 19, d: [1.10, 1.38, 0.45]},
  {id: 'htt22', n: 'Domusa Dual Clima HTT 22 kW (trif.)', kw: 22, d: [1.10, 1.38, 0.45]},
  {id: 'ecpro16', n: 'Domusa Dual Clima EC PRO 16 kW (trif.)', kw: 16, d: [1.10, 1.38, 0.45]},
  {id: 'sd15', n: 'Saunier Duval Genia Air 15 kW', kw: 15, d: [1.10, 1.10, 0.46]},
  {id: 'pana', n: 'Panasonic Aquarea', kw: 12, d: [1.00, 0.96, 0.40]}
];
const ACS = [0, 200, 300, 500];
const INERCIA = [0, 100, 150, 200];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre',
  'Noviembre', 'Diciembre'];
const R = 50;            // radio de la escena (m): 100 × 100 m de foto aérea
const ALTURA_PLANTA = 3; // m por planta (Catastro da el nº de plantas)
const D2R = Math.PI / 180;
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('es-ES', {minimumFractionDigits: d, maximumFractionDigits: d});

/* ---------- carga de three.js (va en el repositorio) ---------- */
let cargado3d = null;
function cargarThree() {
  if (cargado3d) return cargado3d;
  const js = src => new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => mal(new Error('No se ha podido cargar el visor 3D.')); document.head.appendChild(s);
  });
  cargado3d = (window.THREE ? Promise.resolve() : js('assets/vendor/three/three.min.js'))
    .then(() => (window.THREE.OrbitControls ? null : js('assets/vendor/three/OrbitControls.js')));
  return cargado3d;
}

/* ---------- geografía ---------- */
/** lat/lon (ETRS89) → UTM huso 30 (EPSG:25830). */
export function utm30(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), L0 = -3 * D2R;
  const p = lat * D2R, l = lon * D2R;
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2), T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2,
    A = Math.cos(p) * (l - L0);
  const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) *
    Math.sin(2 * p) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 +
    (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return [x, y];
}

async function geocodificar(texto) {
  const q = txt(texto);
  try {
    const r = await fetch('https://www.cartociudad.es/geocoder/api/geocoder/candidatesJsonp?limit=5&q=' + encodeURIComponent(q));
    const t = await r.text();
    const lista = JSON.parse(t.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')) || [];
    const muni = normal(q.split(',').slice(1).join(' '));
    const buena = lista.find(x => x.lat && (!muni || normal(x.muni + ' ' + x.poblacion).includes(muni.trim().split(' ')[0]))) ||
      (muni ? null : lista.find(x => x.lat));
    if (buena) return {lat: buena.lat, lon: buena.lng, texto: txt(buena.address), fuente: 'CartoCiudad'};
  } catch (e) { /* probamos la otra */ }
  const r2 = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=es&limit=1&q=' + encodeURIComponent(q));
  const j = await r2.json();
  if (j && j[0]) return {lat: +j[0].lat, lon: +j[0].lon, texto: txt(j[0].display_name).split(',').slice(0, 3).join(','), fuente: 'OpenStreetMap'};
  throw new Error('No encuentro esa dirección. Escríbela como «Calle, número, municipio».');
}

/** Volúmenes del Catastro alrededor del punto (coordenadas locales: E, N en metros). */
async function edificiosCatastro(x0, y0) {
  const bbox = [x0 - R, y0 - R, x0 + R, y0 + R].map(v => v.toFixed(1)).join(',');
  const url = 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=WFS&version=2.0.0&request=GetFeature' +
    '&typenames=BU:BuildingPart&srsname=EPSG::25830&bbox=' + bbox + ',EPSG::25830';
  const r = await fetch(url);
  const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
  const partes = [];
  const todos = xml.getElementsByTagName('*');
  for (const el of todos) {
    if (el.localName !== 'BuildingPart') continue;
    const id = el.getAttribute('gml:id') || '';
    const pl = [...el.getElementsByTagName('*')].find(x => x.localName === 'numberOfFloorsAboveGround');
    const plantas = pl ? num(pl.textContent) : 0;
    const pos = [...el.getElementsByTagName('*')].filter(x => x.localName === 'posList');
    if (!pos.length) continue;
    const anillo = t => { const v = t.trim().split(/\s+/).map(Number); const p = [];
      for (let i = 0; i + 1 < v.length; i += 2) p.push([v[i] - x0, v[i + 1] - y0]); return p; };
    const ext = anillo(pos[0].textContent);
    if (ext.length < 4) continue;
    partes.push({id, rc: id.replace(/^ES\.SDGC\.BU\./, '').slice(0, 14), plantas, ext, huecos: pos.slice(1).map(p => anillo(p.textContent))});
  }
  return partes;
}

const area = p => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(s / 2); };
const dentro = (pt, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
  if ((p[i][1] > pt[1]) !== (p[j][1] > pt[1]) && pt[0] < (p[j][0] - p[i][0]) * (pt[1] - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
const dist2 = (pt, p) => Math.min(...p.map(q => (q[0] - pt[0]) ** 2 + (q[1] - pt[1]) ** 2));

/** Rectángulo mínimo (calibre giratorio sobre la envolvente). */
function rectanguloMinimo(pts) {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of s.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  let mejor = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), sn = Math.sin(ang);
    let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
    for (const p of hull) { const u = p[0] * c + p[1] * sn, v = -p[0] * sn + p[1] * c;
      x1 = Math.min(x1, u); x2 = Math.max(x2, u); y1 = Math.min(y1, v); y2 = Math.max(y2, v); }
    const ar = (x2 - x1) * (y2 - y1);
    if (!mejor || ar < mejor.ar) mejor = {ar, ang, c, sn, x1, x2, y1, y2};
  }
  let {ang, c, sn, x1, x2, y1, y2} = mejor;
  let lx = x2 - x1, ly = y2 - y1;
  const cu = (x1 + x2) / 2, cv = (y1 + y2) / 2, cE = cu * c - cv * sn, cN = cu * sn + cv * c;
  if (ly > lx) { ang += Math.PI / 2; [lx, ly] = [ly, lx]; }
  return {ang, largo: lx, ancho: ly, cE, cN};
}

/* ---------- producción ---------- */
const factor = (incl, az) => Math.max(0.35, (1 - 0.0001 * (incl - 33) ** 2) * (1 - 0.000025 * az * az * Math.min(1, incl / 30)));
const nombreAz = a => { const n = [[0, 'Sur'], [45, 'Suroeste'], [90, 'Oeste'], [135, 'Noroeste'], [180, 'Norte'], [-45, 'Sureste'],
  [-90, 'Este'], [-135, 'Noreste'], [-180, 'Norte']]; let b = n[0]; for (const x of n) if (Math.abs(a - x[0]) < Math.abs(a - b[0])) b = x; return b[1]; };

/* ======================================================================= */
export async function vistaVisor3d({id, embebido}) {
  const cli = id ? api.cliente(id) : null;
  const op = cli ? (api.estado.operaciones || []).filter(o => o.cliente_id === cli.id).slice(-1)[0] : null;
  const dirIni = cli ? [txt(cli.direccion), txt(cli.municipio)].filter(Boolean).join(', ') : '';
  /* Sin instalación apuntada: lo que diga el proyecto que pasó el comercial o el captador. */
  let pry = {};
  if (cli && !op) { try { const r = await api.proyectoDe(cli.id); const t = normal(((r && r.proyecto) || {}).descripcion || '');
    const m1 = t.match(/(\d+)\s*(?:placas|paneles|modulos)/), m2 = t.match(/(\d{3})\s*w\b/), m3 = t.match(/(\d+(?:[.,]\d+)?)\s*kw[^p]*aerot|aerot[^.]*?(\d+(?:[.,]\d+)?)\s*kw/),
      m4 = t.match(/(\d)\s*(?:x\s*)?(?:baterias|t58)/);
    pry = {n: m1 ? +m1[1] : 0, wp: m2 ? +m2[1] : 0, aerokw: m3 ? num(m3[1] || m3[2]) : 0, bat: m4 ? +m4[1] : 0, aero: /aerotermia/.test(t)}; } catch (e) { pry = {}; } }
  const caja = h('.visor3d' + (embebido ? '.embebido' : ''));
  const logo = h('img.v3-logo', {src: 'assets/img/logo.png', alt: 'Zero Wattios'});
  const logoOsc = h('img.v3-logo.osc', {src: 'assets/img/logo-dark.png', alt: 'Zero Wattios'});

  /* --- estado --- */
  const wpIni = op ? num(op.panel_wp) : pry.wp;
  const panIni = PANELES.find(p => wpIni && Math.abs(p.w - wpIni) < 3) || PANELES[0];
  const aeroIni = (() => { if (!op) { if (!pry.aero && !pry.aerokw) return 'no'; const kw = pry.aerokw; return kw >= 21 ? 'htt22' : kw >= 18 ? 'htt19' : kw && kw <= 12 ? 'ht12' : 'ht16'; }
    const m = normal(op.aero_modelo), kw = num(op.aero_kw);
    if (!m && !kw) return 'no'; if (m.includes('saunier')) return 'sd15'; if (m.includes('panasonic')) return 'pana';
    if (m.includes('ec pro')) return 'ecpro16'; if (kw >= 21) return 'htt22'; if (kw >= 18) return 'htt19';
    if (m.includes('htt') || m.includes('trif')) return 'htt16'; return kw && kw <= 12 ? 'ht12' : 'ht16'; })();
  const E = {
    lat: null, lon: null, partes: [], principal: null, direccion: dirIni, altura: 6, casaIds: new Set(), alturaRc: {},
    tejado: normal(op && op.tejado).includes('plan') ? 'plana' : 'dos', incl: 30, giro: false, alero: 0.4,
    panel: panIni.id, vertical: true, nPan: op ? num(op.paneles_num) || 0 : (pry.n || 0), margen: 0.3, caras: {},
    inversor: 'auto', baterias: op && num(op.bateria_kwh) ? Math.max(1, Math.round(num(op.bateria_kwh) / 5.8)) : (pry.bat || 0),
    cargador: !!(op && txt(op.cargador_modelo)),
    aero: aeroIni, cascada: aeroIni === 'ecpro16' ? 2 : 1,
    acs: num(op && op.deposito_acs) || (aeroIni === 'no' ? 0 : 200), inercia: num(op && op.deposito_inercia) || (aeroIni === 'no' ? 0 : 100),
    hora: 13, mes: 5
  };

  /* --- interfaz --- */
  const entradaDir = h('input#v3dir', {type: 'text', placeholder: 'Calle, número, municipio', valor: dirIni});
  const botonBuscar = h('button.btn.lima', {type: 'button'}, 'Buscar casa');
  const estado = h('.v3-estado.nota', cli ? 'Pulsa «Buscar casa» para traer la planta del Catastro y la foto aérea.' : 'Escribe la dirección y pulsa «Buscar casa».');
  const lienzo = h('canvas.v3-lienzo');
  const kp = {};
  const kpi = (k, et, dest) => h('.v3-kpi' + (dest ? '.dest' : ''), kp[k] = h('b', '—'), h('span', et));
  const tiraKpi = h('.v3-kpis', kpi('n', 'Paneles', true), kpi('kwp', 'kWp'), kpi('kwh', 'kWh/año (orientativo)'),
    kpi('inv', 'Inversor'), kpi('aero', 'Aerotermia'), kpi('m2', 'm² construidos (Catastro)'));
  const listaCaras = h('.v3-caras');
  const listaMat = h('.v3-mat');
  const sel = (opts, val, alCambiar, idEl) => { const s = h('select', idEl ? {id: idEl} : {}, opts.map(([v, t]) => h('option', {value: v}, t)));
    s.value = val; s.addEventListener('change', () => alCambiar(s.value)); return s; };
  const rango = (min, max, paso, val, alMover, idEl) => { const r = h('input', {type: 'range', min, max, step: paso, valor: val, id: idEl});
    r.value = val; r.addEventListener('input', () => alMover(+r.value)); return r; };
  const numero = (val, alCambiar, idEl, extra = {}) => { const i = h('input', {type: 'number', valor: val, id: idEl, ...extra});
    i.addEventListener('input', () => alCambiar(num(i.value))); return i; };
  const casilla = (val, alCambiar, idEl) => { const i = h('input', {type: 'checkbox', id: idEl}); i.checked = !!val;
    i.addEventListener('change', () => alCambiar(i.checked)); return i; };
  const campo = (et, ctl) => h('label.v3-campo', h('span', et), ctl);
  const vInc = h('b', E.incl + '°');
  const altInp = numero(6, v => { if (v > 1) { E.altura = v; construir(); } }, 'v3alt', {step: 0.1, min: 2, max: 30});

  const re = () => { construir(); };
  const panelMando = h('aside.v3-mando',
    h('.v3-grupo', h('h4', 'Tejado'),
      h('.v3-seg', [['dos', '2 aguas'], ['cuatro', '4 aguas'], ['una', '1 agua'], ['plana', 'Plana']].map(([v, t]) =>
        h('button', {type: 'button', datos: {v}, 'aria-pressed': String(E.tejado === v), onclick: e => {
          E.tejado = v; [...e.target.parentNode.children].forEach(b => b.setAttribute('aria-pressed', String(b === e.target))); E.caras = {}; re(); }}, t))),
      campo(h('span', 'Inclinación ', vInc), rango(5, 45, 1, E.incl, v => { E.incl = v; vInc.textContent = v + '°'; re(); }, 'v3incl')),
      h('.v3-fila', campo('Altura alero (m)', altInp), campo('Vuelo alero (m)', numero(E.alero, v => { E.alero = v; re(); }, 'v3alero', {step: 0.1, min: 0, max: 1.5}))),
      h('label.v3-chk', casilla(E.giro, v => { E.giro = v; E.caras = {}; re(); }, 'v3giro'), 'Girar cumbrera 90°'),
      h('p.nota', 'La planta y las alturas vienen del Catastro; la forma del tejado se elige aquí.')),
    h('.v3-grupo', h('h4', 'Fotovoltaica'),
      campo('Panel', sel(PANELES.map(p => [p.id, `${p.n} · ${p.l}×${p.a}`]), E.panel, v => { E.panel = v; re(); }, 'v3panel')),
      h('.v3-fila', campo('Colocación', sel([['v', 'Vertical'], ['h', 'Horizontal']], 'v', v => { E.vertical = v === 'v'; re(); }, 'v3ori')),
        campo('Nº paneles (0 = máx.)', numero(E.nPan, v => { E.nPan = v; re(); }, 'v3n', {min: 0, max: 300}))),
      campo('Margen al borde (m)', numero(E.margen, v => { E.margen = v; re(); }, 'v3margen', {step: 0.05, min: 0.1, max: 1})),
      listaCaras,
      campo('Inversor', sel(INVERSORES.map(i => [i.id, i.n]), E.inversor, v => { E.inversor = v; re(); }, 'v3inv')),
      h('.v3-fila', campo('Baterías SolaX T58 (5,8 kWh)', numero(E.baterias, v => { E.baterias = Math.max(0, Math.round(v)); re(); }, 'v3bat', {min: 0, max: 6})),
        h('label.v3-chk', casilla(E.cargador, v => { E.cargador = v; re(); }, 'v3carg'), 'Cargador VE'))),
    h('.v3-grupo', h('h4', 'Aerotermia'),
      campo('Equipo', sel(AEROS.map(a => [a.id, a.n]), E.aero, v => { E.aero = v; re(); }, 'v3aero')),
      h('.v3-fila', campo('Máquinas (cascada)', sel([['1', '1'], ['2', '2']], String(E.cascada), v => { E.cascada = +v; re(); }, 'v3casc')),
        campo('Depósito ACS (L)', sel(ACS.map(v => [String(v), v ? v + ' L' : 'Sin depósito']), String(E.acs), v => { E.acs = +v; re(); }, 'v3acs'))),
      campo('Depósito de inercia (L)', sel(INERCIA.map(v => [String(v), v ? v + ' L' : 'Sin inercia']), String(E.inercia), v => { E.inercia = +v; re(); }, 'v3inercia'))),
    h('.v3-grupo', h('h4', 'Material'), listaMat),
    h('.v3-acciones',
      h('button.btn.lima', {type: 'button', onclick: () => guardarImagen()}, 'Descargar imagen'),
      h('button.btn', {type: 'button', onclick: () => copiarResumen()}, 'Copiar resumen')),
    h('p.nota', 'Fuentes: Catastro (planta y plantas), IGN · PNOA (foto aérea), CartoCiudad/OpenStreetMap (dirección). Producción orientativa: validar con PVGIS.'));

  const vH = h('b', '13:00'), vM = h('b', 'Junio');
  const bTejado = h('.v3-vistas',
    h('button', {type: 'button', onclick: () => vista('3d')}, '3D'),
    h('button', {type: 'button', onclick: () => vista('planta')}, 'Planta'),
    h('button', {type: 'button', onclick: () => vista('calle')}, 'Desde la calle'));
  let reproduciendo = null;
  const bDia = h('button.btn.mini', {type: 'button', onclick: () => {
    if (reproduciendo) { cancelAnimationFrame(reproduciendo); reproduciendo = null; bDia.textContent = '▶ Día'; return; }
    bDia.textContent = '❚❚ Parar'; const paso = () => { E.hora += 0.04; if (E.hora > 21) E.hora = 7; rH.value = E.hora; sol(); reproduciendo = requestAnimationFrame(paso); }; paso(); }}, '▶ Día');
  const rH = rango(7, 21, 0.25, E.hora, v => { E.hora = v; sol(); }, 'v3hora');
  const rM = rango(0, 11, 1, E.mes, v => { E.mes = v; sol(); }, 'v3mes');
  const barraSol = h('.v3-sol', h('span', '☀ ', vH), rH, h('span', vM), rM, bDia);
  const escena = h('.v3-escena', lienzo, h('.v3-marca', logo, logoOsc), bTejado, barraSol, h('.v3-cargando', {hidden: true}, 'Cargando…'));

  poner(caja,
    h('style', CSS),
    h('.v3-cabecera',
      h('div', h('h2', embebido ? 'Simulación 3D' : 'Visor 3D de la vivienda'),
        h('p.nota', embebido ? 'Uso interno para la visita: no se incluye en el PDF de la propuesta. ' + (op ? 'Equipos de la instalación apuntada.' : (pry.n || pry.aero ? 'Equipos sacados del proyecto pedido.' : ''))
          : (cli ? (txt(cli.nombre) || txt(cli.direccion)) : 'Planta del Catastro + foto aérea del IGN'))),
      h('.v3-buscar', entradaDir, botonBuscar)),
    estado, tiraKpi,
    h('.v3-cuerpo', panelMando, escena));

  await cargarThree();
  const THREE = window.THREE;

  /* --- escena --- */
  const renderer = new THREE.WebGLRenderer({canvas: lienzo, antialias: true, alpha: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  const controls = new THREE.OrbitControls(camera, lienzo);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 8; controls.maxDistance = 160;
  scene.add(new THREE.HemisphereLight(0xe6f0fb, 0x5b6650, 0.55));
  const luz = new THREE.DirectionalLight(0xfff2d8, 1.0);
  luz.castShadow = true; luz.shadow.mapSize.set(2048, 2048);
  Object.assign(luz.shadow.camera, {left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 200});
  luz.shadow.bias = -0.0005; scene.add(luz); scene.add(luz.target);
  const bola = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 16), new THREE.MeshBasicMaterial({color: 0xffc35a})); scene.add(bola);
  const anillo = new THREE.Mesh(new THREE.RingGeometry(R, 140, 64), new THREE.MeshLambertMaterial({color: 0x7d9466}));
  anillo.rotation.x = -Math.PI / 2; anillo.position.y = -0.02; scene.add(anillo);
  let suelo = null, mundo = null, texFoto = null, texTecho = null;

  const texPanel = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#0d1b2e'; g.fillRect(0, 0, 128, 256); g.strokeStyle = '#2b4a6e'; g.lineWidth = 1.4;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * 128 / 6, 0); g.lineTo(i * 128 / 6, 256); g.stroke(); }
    for (let j = 1; j < 12; j++) { g.beginPath(); g.moveTo(0, j * 256 / 12); g.lineTo(128, j * 256 / 12); g.stroke(); }
    g.strokeStyle = '#c3ccd4'; g.lineWidth = 5; g.strokeRect(2, 2, 124, 252); return new THREE.CanvasTexture(c); })();
  const M = {
    panel: [0, 0, 0, 0, 1, 0].map(i => i ? new THREE.MeshStandardMaterial({map: texPanel, roughness: 0.35, metalness: 0.4})
      : new THREE.MeshStandardMaterial({color: 0xaab4bd, roughness: 0.5, metalness: 0.6})),
    pared: new THREE.MeshLambertMaterial({color: 0xeee6d8}),
    vecino: new THREE.MeshLambertMaterial({color: 0xc9c6bf}),
    tejado: new THREE.MeshLambertMaterial({color: 0xa24a33, side: THREE.DoubleSide}),
    blanco: new THREE.MeshLambertMaterial({color: 0xf6f6f2}),
    gris: new THREE.MeshLambertMaterial({color: 0xd5dade}),
    oscuro: new THREE.MeshLambertMaterial({color: 0x30353a}),
    deposito: new THREE.MeshLambertMaterial({color: 0xe9ecef})
  };

  function malla(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }
  /* Coordenadas: E → x, N → −z (el norte hacia el fondo). */
  const V = (e, y, n) => new THREE.Vector3(e, y, -n);

  function extruir(p, alto, matTecho, matPared) {
    const s = new THREE.Shape(p.ext.map(([e, n]) => new THREE.Vector2(e, n)));
    (p.huecos || []).forEach(hu => s.holes.push(new THREE.Path(hu.map(([e, n]) => new THREE.Vector2(e, n)))));
    const g = new THREE.ExtrudeGeometry(s, {depth: alto, bevelEnabled: false});
    const m = malla(g, [matTecho, matPared]); m.rotation.x = -Math.PI / 2; return m;
  }

  /** Caras del tejado de un volumen: devuelve {grupo, caras:[{o,u,v,len,sl,ancho(v),incl,az}]} en coordenadas del mundo. */
  function tejadoDe(p, H) {
    const r = rectanguloMinimo(p.ext);
    let ang = r.ang, L = r.largo, A = r.ancho;
    if (E.giro) { ang += Math.PI / 2; [L, A] = [A, L]; }
    const ex = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));      // a lo largo de la cumbrera
    const ez = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));        // perpendicular (en planta)
    const c = V(r.cE, 0, r.cN);
    const P = (lx, ly, lz) => c.clone().addScaledVector(ex, lx).addScaledVector(ez, lz).setY(ly);
    const ov = E.alero, Lx = L / 2 + ov, Dz = A / 2 + ov, pi = E.incl * D2R;
    const grupo = new THREE.Group(); const caras = [];
    const tris = (pts, mat) => { const g = new THREE.BufferGeometry(); const arr = [], uv = [];
      pts.forEach(q => { arr.push(q.x, q.y, q.z); uv.push(q.x, -q.z); });
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals(); grupo.add(malla(g, mat)); };
    const cara = (o, u, v, len, sl, ancho, k) => caras.push({o, u, v, len, sl, ancho: ancho || (() => [0, len]), incl: E.incl, k});
    const up = (s, d) => new THREE.Vector3().addScaledVector(s, d);
    if (E.tejado === 'plana') return {grupo, caras, plana: true, r, ang, ex, ez, c};
    const techo = texTecho ? new THREE.MeshLambertMaterial({map: texTecho, side: THREE.DoubleSide}) : M.tejado;
    if (E.tejado === 'dos') {
      const sube = Dz * Math.tan(pi), sl = Dz / Math.cos(pi);
      tris([P(-Lx, H, Dz), P(Lx, H, Dz), P(Lx, H + sube, 0), P(-Lx, H, Dz), P(Lx, H + sube, 0), P(-Lx, H + sube, 0),
        P(Lx, H, -Dz), P(-Lx, H, -Dz), P(-Lx, H + sube, 0), P(Lx, H, -Dz), P(-Lx, H + sube, 0), P(Lx, H + sube, 0)], techo);
      const sg = (A / 2) * Math.tan(pi);
      tris([P(-L / 2, H, A / 2), P(-L / 2, H, -A / 2), P(-L / 2, H + sg, 0), P(L / 2, H, -A / 2), P(L / 2, H, A / 2), P(L / 2, H + sg, 0)], M.pared);
      const vF = up(ez, -Math.cos(pi)).setY(Math.sin(pi)), vB = up(ez, Math.cos(pi)).setY(Math.sin(pi));
      cara(P(-Lx, H, Dz), ex.clone(), vF, 2 * Lx, sl, null, 'a');
      cara(P(Lx, H, -Dz), ex.clone().negate(), vB, 2 * Lx, sl, null, 'b');
    } else if (E.tejado === 'una') {
      const sube = 2 * Dz * Math.tan(pi), sl = 2 * Dz / Math.cos(pi), s2 = A * Math.tan(pi);
      tris([P(-Lx, H, Dz), P(Lx, H, Dz), P(Lx, H + sube, -Dz), P(-Lx, H, Dz), P(Lx, H + sube, -Dz), P(-Lx, H + sube, -Dz)], techo);
      tris([P(-L / 2, H, A / 2), P(-L / 2, H, -A / 2), P(-L / 2, H + s2, -A / 2), P(L / 2, H, -A / 2), P(L / 2, H, A / 2), P(L / 2, H + s2, -A / 2),
        P(-L / 2, H, -A / 2), P(L / 2, H, -A / 2), P(L / 2, H + s2, -A / 2), P(-L / 2, H, -A / 2), P(L / 2, H + s2, -A / 2), P(-L / 2, H + s2, -A / 2)], M.pared);
      cara(P(-Lx, H, Dz), ex.clone(), up(ez, -Math.cos(pi)).setY(Math.sin(pi)), 2 * Lx, sl, null, 'a');
    } else { // cuatro aguas
      const half = Dz, sube = half * Math.tan(pi), rx = Math.max(Lx - Dz, 0), top = H + sube;
      tris([P(-Lx, H, Dz), P(Lx, H, Dz), P(rx, top, 0), P(-Lx, H, Dz), P(rx, top, 0), P(-rx, top, 0),
        P(Lx, H, -Dz), P(-Lx, H, -Dz), P(-rx, top, 0), P(Lx, H, -Dz), P(-rx, top, 0), P(rx, top, 0),
        P(Lx, H, Dz), P(Lx, H, -Dz), P(rx, top, 0), P(-Lx, H, -Dz), P(-Lx, H, Dz), P(-rx, top, 0)], techo);
      const sl = half / Math.cos(pi), co = Math.cos(pi), trap = len => v => { const d = v * co; return [d, len - d]; };
      cara(P(-Lx, H, Dz), ex.clone(), up(ez, -co).setY(Math.sin(pi)), 2 * Lx, sl, trap(2 * Lx), 'a');
      cara(P(Lx, H, -Dz), ex.clone().negate(), up(ez, co).setY(Math.sin(pi)), 2 * Lx, sl, trap(2 * Lx), 'b');
      cara(P(Lx, H, Dz), ez.clone().negate(), up(ex, -co).setY(Math.sin(pi)), 2 * Dz, sl, trap(2 * Dz), 'c');
      cara(P(-Lx, H, -Dz), ez.clone(), up(ex, co).setY(Math.sin(pi)), 2 * Dz, sl, trap(2 * Dz), 'd');
    }
    caras.forEach(f => { // azimut real de la cara (0 = sur, + oeste)
      let n = new THREE.Vector3().crossVectors(f.u, f.v);
      if (n.y < 0) { f.o = f.o.clone().addScaledVector(f.u, f.len); f.u = f.u.clone().negate(); const w = f.ancho; f.ancho = v => { const [a, b] = w(v); return [f.len - b, f.len - a]; }; n = new THREE.Vector3().crossVectors(f.u, f.v); }
      f.n = n.normalize(); f.az = Math.round(Math.atan2(-f.n.x, f.n.z) / D2R);
    });
    return {grupo, caras, r, ang, ex, ez, c};
  }

  let ultimo = null;
  function construir() {
    if (!E.principal) return;
    if (mundo) { scene.remove(mundo); mundo.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    mundo = new THREE.Group();
    const capTex = texTecho ? new THREE.MeshLambertMaterial({map: texTecho}) : M.vecino;
    // vecinos
    E.partes.filter(p => !E.casaIds.has(p.id) && p.plantas > 0).forEach(p => mundo.add(extruir(p, (E.alturaRc[p.rc] || p.plantas * ALTURA_PLANTA), capTex, M.vecino)));
    // la casa
    const propias = E.principal.partes;
    const caras = [];
    const H = E.altura;
    propias.forEach(p => mundo.add(extruir(p, H, E.tejado === 'plana' ? capTex : M.pared, M.pared)));
    { const t = tejadoDe(E.principal, H); mundo.add(t.grupo);
      t.caras.forEach(f => { f.clave = 'casa·' + f.k; f.vol = 'principal'; caras.push(f); }); }
    // caras marcadas por defecto: las del volumen principal que miran al sur (±100°)
    caras.forEach(f => { if (!(f.clave in E.caras)) E.caras[f.clave] = f.vol === 'principal' && Math.abs(f.az) <= 100 && (caras.filter(g => g.vol === 'principal' && Math.abs(g.az) <= 100).sort((a, b) => Math.abs(a.az) - Math.abs(b.az))[0] === f); });
    poner(listaCaras, caras.length ? [h('span.nota', 'Faldones con paneles:'),
      ...caras.map(f => h('label.v3-chk', casilla(E.caras[f.clave], v => { E.caras[f.clave] = v; construir(); }),
        `${f.vol === 'principal' ? 'Principal' : 'Otro volumen'} · ${nombreAz(f.az)} (${f.az > 0 ? '+' : ''}${f.az}°)`))]
      : h('span.nota', E.tejado === 'plana' ? 'Cubierta plana: estructura triangular orientada al sur.' : ''));

    /* paneles */
    const pan = PANELES.find(p => p.id === E.panel);
    const pu = (E.vertical ? pan.a : pan.l) / 1000, pv = (E.vertical ? pan.l : pan.a) / 1000;
    const gap = 0.02, max = E.nPan || Infinity; let n = 0; const porCara = [];
    const geo = new THREE.BoxGeometry(1, 1, 0.04);
    for (const f of caras.sort((a, b) => Math.abs(a.az) - Math.abs(b.az))) {
      if (!E.caras[f.clave]) continue; let k = 0;
      for (let v = E.margen; v + pv <= f.sl - E.margen && n < max; v += pv + gap) {
        const [a0, b0] = f.ancho(v), [a1, b1] = f.ancho(v + pv);
        const u0 = Math.max(a0, a1) + E.margen + E.alero, u1 = Math.min(b0, b1) - E.margen - E.alero;
        const cuantos = Math.floor((u1 - u0 + gap) / (pu + gap)); if (cuantos <= 0) continue;
        const ini = u0 + (u1 - u0 - (cuantos * pu + (cuantos - 1) * gap)) / 2;
        for (let i = 0; i < cuantos && n < max; i++) {
          const m = new THREE.Mesh(geo, M.panel); m.castShadow = true; m.receiveShadow = true; m.scale.set(pu, pv, 1);
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.u, f.v, f.n));
          m.position.copy(f.o).addScaledVector(f.u, ini + i * (pu + gap) + pu / 2).addScaledVector(f.v, v + pv / 2).addScaledVector(f.n, 0.14);
          mundo.add(m); n++; k++;
        }
      }
      if (k) porCara.push({n: k, incl: f.incl, az: f.az});
    }
    if (E.tejado === 'plana') { // filas al sur en el volumen principal
      const p = E.principal, t = 30 * D2R, hmin = (90 - 40.4 - 23.45) * D2R;
      const fondo = pv * Math.cos(t), alto = pv * Math.sin(t), paso = fondo + alto / Math.tan(hmin);
      let e1 = Infinity, e2 = -Infinity, n1 = Infinity, n2 = -Infinity; p.ext.forEach(([e, nn]) => { e1 = Math.min(e1, e); e2 = Math.max(e2, e); n1 = Math.min(n1, nn); n2 = Math.max(n2, nn); });
      let k = 0;
      for (let nn = n1 + E.margen + 0.3; nn + fondo <= n2 - E.margen && n < max; nn += paso) {
        for (let e = e1 + E.margen + 0.3; e + pu <= e2 - E.margen && n < max; e += pu + gap) {
          const cE = e + pu / 2, cN = nn + fondo / 2;
          if (![[e, nn], [e + pu, nn], [e, nn + fondo], [e + pu, nn + fondo]].every(q => p.partes.some(pp => dentro(q, pp.ext)))) continue;
          const m = new THREE.Mesh(geo, M.panel); m.castShadow = true; m.scale.set(pu, pv, 1);
          m.rotation.x = -(Math.PI / 2 - t); m.position.copy(V(cE, H + 0.35 + alto / 2, cN)); mundo.add(m); n++; k++;
        }
      }
      if (k) porCara.push({n: k, incl: 30, az: 0});
    }

    /* equipos: junto a la fachada más al norte del volumen principal */
    const rp = rectanguloMinimo(E.principal.ext);
    const ejes = [[Math.cos(rp.ang), Math.sin(rp.ang), rp.largo / 2], [-Math.sin(rp.ang), Math.cos(rp.ang), rp.ancho / 2]];
    let lado = null; ejes.forEach(([dx, dn, d]) => [1, -1].forEach(s => { const nN = dn * s; if (!lado || nN > lado.nN) lado = {dx: dx * s, dn: dn * s, d, nN}; }));
    const base = V(rp.cE + lado.dx * (lado.d + 0.9), 0, rp.cN + lado.dn * (lado.d + 0.9));
    const along = new THREE.Vector3(lado.dn, 0, lado.dx); // a lo largo de esa fachada
    const giroY = Math.atan2(-lado.dx, lado.dn);
    const pon = (obj, desp) => { obj.position.copy(base).addScaledVector(along, desp); obj.rotation.y = giroY; mundo.add(obj); };
    const aero = AEROS.find(a => a.id === E.aero);
    if (aero && aero.d) for (let i = 0; i < E.cascada; i++) {
      const g = new THREE.Group(); const [w, hh, d] = aero.d;
      const b = malla(new THREE.BoxGeometry(w, hh, d), M.blanco); b.position.y = hh / 2 + 0.15; g.add(b);
      const fan = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, hh) * 0.33, 24), M.oscuro); fan.position.set(-w * 0.12, hh / 2 + 0.15, -d / 2 - 0.005); fan.rotation.y = Math.PI; g.add(fan);
      pon(g, -1.6 - i * (w + 0.4));
    }
    const dep = (litros, x) => { if (!litros) return; const r = litros >= 300 ? 0.33 : 0.28, alto = litros / 1000 / (Math.PI * r * r) + 0.2;
      const c = malla(new THREE.CylinderGeometry(r, r, alto, 20), M.deposito); c.position.y = alto / 2; pon(c, x); };
    if (aero && aero.d) { dep(E.acs, 1.2); dep(E.inercia, 2.0); }
    if (n > 0) { const inv = malla(new THREE.BoxGeometry(0.5, 0.7, 0.2), M.gris); inv.position.y = 1.5; pon(inv, 3.2); }
    for (let i = 0; i < E.baterias; i++) { const b = malla(new THREE.BoxGeometry(0.6, 0.45, 0.2), M.gris); b.position.y = 0.35 + i * 0.5; pon(b, 4.0); }
    if (E.cargador) { const c = malla(new THREE.BoxGeometry(0.35, 0.45, 0.15), M.oscuro); c.position.y = 1.2; pon(c, 4.9); }

    scene.add(mundo);
    ultimo = {n, pan, porCara, propias};
    cifras(); sol();
  }

  function inversorDe(kwp) {
    if (E.inversor !== 'auto') return INVERSORES.find(i => i.id === E.inversor);
    const tri = ['htt16', 'htt19', 'htt22', 'ecpro16'].includes(E.aero) || kwp > 12;
    const lista = INVERSORES.filter(i => i.kw && i.fase === (tri ? 'tri' : 'mono') && !i.id.startsWith('deye'));
    return lista.find(i => i.kw >= kwp / 1.25) || lista[lista.length - 1];
  }

  function cifras() {
    const {n, pan, porCara, propias} = ultimo;
    const kwp = n * pan.w / 1000;
    const kwh = porCara.reduce((s, c) => s + c.n * pan.w / 1000 * 1650 * factor(c.incl, c.az), 0);
    const inv = n ? inversorDe(kwp) : null;
    const aero = AEROS.find(a => a.id === E.aero);
    const m2 = propias.reduce((s, p) => s + area(p.ext) * p.plantas, 0);
    kp.n.textContent = n; kp.kwp.textContent = fmt(kwp, 2); kp.kwh.textContent = fmt(Math.round(kwh / 50) * 50);
    kp.inv.textContent = inv ? inv.kw + ' kW' : '—'; kp.aero.textContent = aero && aero.kw ? (E.cascada > 1 ? E.cascada + '×' : '') + aero.kw + ' kW' : '—';
    kp.m2.textContent = fmt(m2);
    if (E.nPan && n < E.nPan) estado.textContent = `Caben ${n} de los ${E.nPan} paneles pedidos con este panel y margen: prueba otra colocación u otro faldón.`;
    /* material */
    const filas = [];
    if (n) {
      filas.push([n, pan.n + ` (${pan.l}×${pan.a} mm)`]);
      filas.push([n, E.tejado === 'plana' ? 'Estructura triangular 30° para cubierta plana' : 'Estructura coplanar (ganchos + perfil) por panel']);
      filas.push([1, inv.n]);
      if (E.baterias) filas.push([E.baterias, `Batería SolaX T58 5,8 kWh (${fmt(E.baterias * 5.8, 1)} kWh)`]);
      if (E.cargador) filas.push([1, 'Cargador de vehículo eléctrico']);
      filas.push([1, 'Protecciones CC/CA, cableado solar y vatímetro']);
    }
    if (aero && aero.kw) {
      filas.push([E.cascada, aero.n]);
      if (E.cascada > 1) filas.push([1, 'Kit / gestor de cascada']);
      if (E.acs) filas.push([1, `Depósito ACS ${E.acs} L acero inoxidable`]);
      if (E.inercia) filas.push([1, `Depósito de inercia ${E.inercia} L`]);
      filas.push([1, 'Kit hidráulico, vaso de expansión y tubería']);
    }
    poner(listaMat, filas.length ? h('table.v3-tabla', filas.map(([c, t]) => h('tr', h('td', String(c)), h('td', t))))
      : h('span.nota', 'Sin equipos elegidos.'));
    ultimo.kwp = kwp; ultimo.kwh = kwh; ultimo.inv = inv; ultimo.aero = aero; ultimo.filas = filas;
  }

  function sol() {
    const doy = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344][E.mes];
    const dec = 23.45 * D2R * Math.sin(2 * Math.PI * (284 + doy) / 365), lat = (E.lat || 40.4) * D2R;
    const verano = E.mes >= 3 && E.mes <= 9 ? 2 : 1;
    const ha = ((E.hora - verano + (E.lon || -3.7) / 15) - 12) * 15 * D2R;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
    const up = Math.max(el, 0.02);
    const dir = new THREE.Vector3(-Math.sin(az) * Math.cos(up), Math.sin(up), Math.cos(az) * Math.cos(up));
    luz.position.copy(dir.clone().multiplyScalar(90)); bola.position.copy(dir.clone().multiplyScalar(80));
    luz.intensity = el > 0 ? 0.35 + 0.8 * Math.sin(el) : 0.05; bola.visible = el > 0;
    const hh = Math.floor(E.hora), mm = Math.round((E.hora - hh) * 60);
    vH.textContent = `${hh}:${String(mm).padStart(2, '0')}` + (el <= 0 ? ' · noche' : ''); vM.textContent = MESES[E.mes];
  }

  function vista(tipo) {
    const p = E.principal; if (!p) return;
    const r = rectanguloMinimo(p.ext); const c = V(r.cE, E.altura * 0.7, r.cN);
    const d = Math.max(r.largo, r.ancho, 10);
    if (tipo === 'planta') camera.position.set(c.x + 0.01, d * 3.2, c.z + 0.01);
    else if (tipo === 'calle') camera.position.set(c.x, 4, c.z + d * 2.2);
    else camera.position.set(c.x + d * 1.4, d * 1.35, c.z + d * 1.9);
    controls.target.copy(c); controls.update();
  }

  async function buscar() {
    const q = txt(entradaDir.value);
    if (!q && !(cli && txt(cli.coordenadas))) { estado.textContent = 'Escribe una dirección.'; return; }
    botonBuscar.disabled = true; escena.querySelector('.v3-cargando').hidden = false;
    try {
      let lat, lon, fuente = '';
      const co = cli ? txt(cli.coordenadas).split(',').map(Number) : [];
      if (cli && co.length === 2 && co.every(isFinite) && normal(q) === normal(dirIni)) { [lat, lon] = co; fuente = 'ficha del cliente'; }
      else { estado.textContent = 'Buscando la dirección…'; const g = await geocodificar(q); lat = g.lat; lon = g.lon; fuente = g.fuente + ' · ' + g.texto; }
      E.lat = lat; E.lon = lon;
      const [x0, y0] = utm30(lat, lon);
      estado.textContent = 'Trayendo la planta del Catastro y la foto aérea…';
      const foto = 'https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=' +
        '&CRS=EPSG:25830&BBOX=' + [x0 - R, y0 - R, x0 + R, y0 + R].map(v => v.toFixed(1)).join(',') + '&WIDTH=2048&HEIGHT=2048&FORMAT=image/jpeg';
      const [partes, tex] = await Promise.all([edificiosCatastro(x0, y0), new Promise(ok => new THREE.TextureLoader().setCrossOrigin('anonymous').load(foto, ok, undefined, () => ok(null)))]);
      if (!partes.length) throw new Error('El Catastro no da edificios en ese punto.');
      // la casa: el volumen que contiene el punto (o el más cercano con plantas)
      const conPl = partes.filter(p => p.plantas > 0);
      let casa = conPl.find(p => dentro([0, 0], p.ext)) || conPl.sort((a, b) => dist2([0, 0], a.ext) - dist2([0, 0], b.ext))[0];
      // la casa = los volúmenes de esa parcela unidos al encontrado (un adosado es un bloque de volúmenes)
      const cerca = (a, b) => a.ext.some(p => b.ext.some(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < 0.5));
      const mismas = [casa]; const pend = partes.filter(p => p !== casa && p.rc === casa.rc && area(p.ext) >= 1);
      for (let i = 0; i < mismas.length; i++) for (let j = pend.length - 1; j >= 0; j--) if (cerca(mismas[i], pend[j])) mismas.push(pend.splice(j, 1)[0]);
      const sup = mismas.reduce((s, p) => s + area(p.ext), 0);
      const pl = Math.max(1, Math.round(mismas.reduce((s, p) => s + area(p.ext) * Math.min(p.plantas, 3), 0) / (sup || 1)));
      E.altura = Math.round(pl * 2.9 * 10) / 10; altInp.value = E.altura;
      E.principal = {partes: mismas.filter(p => p.plantas > 0), ext: mismas.flatMap(p => p.ext), plantas: pl, rc: casa.rc};
      E.casaIds = new Set(mismas.map(p => p.id));
      // vecinos: misma altura en toda su parcela (el Catastro trocea cada casa por plantas)
      E.alturaRc = {}; const porRc = {}; partes.forEach(p => { if (p.plantas > 0) (porRc[p.rc] = porRc[p.rc] || []).push(p); });
      Object.entries(porRc).forEach(([rc, ps]) => { const a = ps.reduce((s, p) => s + area(p.ext), 0);
        E.alturaRc[rc] = Math.max(1, Math.round(ps.reduce((s, p) => s + area(p.ext) * Math.min(p.plantas, 6), 0) / (a || 1))) * 2.9; });
      E.partes = partes; E.caras = {};
      if (texFoto) texFoto.dispose(); if (texTecho) texTecho.dispose();
      texFoto = tex; texTecho = null;
      if (suelo) { scene.remove(suelo); suelo.geometry.dispose(); }
      suelo = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), tex ? new THREE.MeshLambertMaterial({map: tex}) : new THREE.MeshLambertMaterial({color: 0x8fa77a}));
      suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; scene.add(suelo);
      if (tex) { texTecho = tex.clone(); texTecho.needsUpdate = true; texTecho.repeat.set(1 / (2 * R), 1 / (2 * R)); texTecho.offset.set(0.5, 0.5); }
      construir(); vista('3d');
      estado.textContent = `Casa encontrada (${fuente}). Ref. catastral ${casa.rc} · ${fmt(sup)} m² de planta · ${pl} planta(s) · alero a ${fmt(E.altura, 1)} m (ajústalo si hace falta).`;
    } catch (e) {
      estado.textContent = e.message || 'No se ha podido cargar la casa.';
    } finally { botonBuscar.disabled = false; escena.querySelector('.v3-cargando').hidden = true; }
  }
  botonBuscar.addEventListener('click', buscar);
  entradaDir.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

  function resumen() {
    if (!ultimo) return '';
    const caras = ultimo.porCara.map(c => `${c.n} al ${nombreAz(c.az)} (${c.incl}°)`).join('; ');
    return [`${cli ? txt(cli.nombre) + ' · ' : ''}${txt(entradaDir.value)}`,
      ultimo.n ? `${ultimo.n} paneles ${ultimo.pan.n} = ${fmt(ultimo.kwp, 2)} kWp · ${caras}` : '',
      ultimo.n ? `Producción estimada ${fmt(Math.round(ultimo.kwh / 50) * 50)} kWh/año (orientativa, validar con PVGIS)` : '',
      ...ultimo.filas.map(([c, t]) => `- ${c} × ${t}`)].filter(Boolean).join('\n');
  }
  async function copiarResumen() {
    const t = resumen(); if (!t) return;
    try { await navigator.clipboard.writeText(t); aviso('Resumen copiado.'); } catch (e) { aviso('No se ha podido copiar.', 'error'); }
  }
  function guardarImagen() {
    renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = lienzo.width; c.height = lienzo.height + 90 * Math.min(window.devicePixelRatio, 2);
    const g = c.getContext('2d'), k = Math.min(window.devicePixelRatio, 2);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(lienzo, 0, 0);
    g.fillStyle = '#17191c'; g.font = `600 ${22 * k}px system-ui, sans-serif`;
    g.fillText(txt(entradaDir.value) || 'Vivienda', 20 * k, lienzo.height + 36 * k);
    g.font = `${16 * k}px system-ui, sans-serif`; g.fillStyle = '#4b5249';
    g.fillText(ultimo ? `${ultimo.n} paneles · ${fmt(ultimo.kwp, 2)} kWp · ≈${fmt(Math.round(ultimo.kwh / 50) * 50)} kWh/año` +
      (ultimo.aero && ultimo.aero.kw ? ` · ${ultimo.aero.n}` : '') : '', 20 * k, lienzo.height + 66 * k);
    const pintar = () => { const a = document.createElement('a'); a.download = 'Visor 3D ' + (txt(entradaDir.value) || 'vivienda').replace(/[\\/:*?"<>|]/g, '') + '.png';
      a.href = c.toDataURL('image/png'); a.click(); };
    if (logo.complete && logo.naturalWidth) { const lh = 48 * k, lw = lh * logo.naturalWidth / logo.naturalHeight;
      g.drawImage(logo, c.width - lw - 20 * k, lienzo.height + 20 * k, lw, lh); }
    pintar();
  }

  /* bucle */
  const ajustar = () => { const w = lienzo.clientWidth, hh = lienzo.clientHeight; if (!w || !hh) return;
    renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); };
  new ResizeObserver(ajustar).observe(lienzo);
  camera.position.set(30, 30, 40); controls.update(); sol();
  const bucle = () => { if (!document.body.contains(lienzo)) { renderer.dispose(); return; }
    controls.update(); renderer.render(scene, camera); requestAnimationFrame(bucle); };
  requestAnimationFrame(() => { ajustar(); bucle(); });
  if (cli && (txt(cli.coordenadas) || dirIni)) buscar();
  return caja;
}

const CSS = `
.visor3d{display:flex;flex-direction:column;gap:12px}
.v3-cabecera{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.v3-cabecera h2{margin:0}
.v3-buscar{display:flex;gap:8px;flex:1 1 360px;max-width:620px}
.v3-buscar input{flex:1;min-width:0}
.v3-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
@media (max-width:800px){.v3-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
.v3-kpi{background:var(--papel,#fff);border:1px solid var(--linea,#e2e6e0);border-radius:10px;padding:8px 10px;min-width:0}
.v3-kpi b{display:block;font-size:20px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3-kpi span{font-size:11.5px;color:var(--tx-2,#5b6159)}
.v3-kpi.dest{background:var(--carbon,#17191c);border-color:var(--carbon,#17191c)} .v3-kpi.dest b{color:var(--lima,#b4fa1e)} .v3-kpi.dest span{color:#c9cfc6}
.v3-cuerpo{display:grid;grid-template-columns:330px minmax(0,1fr);gap:12px;align-items:start}
@media (max-width:980px){.v3-cuerpo{grid-template-columns:1fr}.v3-mando{order:2}}
.v3-mando{background:var(--papel,#fff);border:1px solid var(--linea,#e2e6e0);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:14px;max-height:78vh;overflow:auto}
@media (max-width:980px){.v3-mando{max-height:none}}
.v3-grupo{display:flex;flex-direction:column;gap:8px}
.v3-grupo h4{margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--lima-osc,#7fb800)}
.v3-campo{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--tx-2,#5b6159)}
.v3-campo input[type=range]{width:100%;accent-color:var(--lima-osc,#7fb800)}
.v3-fila{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end}
.visor3d label.v3-chk{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:7px;font-size:13px;color:inherit;margin:0}
.visor3d label.v3-chk input{width:auto;flex:none;margin:0}
.v3-caras{display:flex;flex-direction:column;gap:5px}
.v3-seg{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--linea,#e2e6e0);border-radius:8px;overflow:hidden}
.v3-seg button{border:0;border-right:1px solid var(--linea,#e2e6e0);background:transparent;padding:7px 2px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit}
.v3-seg button:last-child{border-right:0}
.v3-seg button[aria-pressed=true]{background:var(--lima,#b4fa1e);color:#17191c;font-weight:600}
.v3-tabla{width:100%;border-collapse:collapse;font-size:12.5px}
.v3-tabla td{padding:4px 4px;border-bottom:1px solid var(--linea,#e2e6e0);vertical-align:top}
.v3-tabla td:first-child{width:28px;font-weight:700;text-align:right;padding-right:8px}
.v3-acciones{display:flex;gap:8px;flex-wrap:wrap}
.visor3d.embebido .v3-escena{height:62vh}
.v3-escena{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--linea,#e2e6e0);height:72vh;min-height:360px;background:linear-gradient(#bcd7ea,#eef3ee)}
@media (max-width:980px){.v3-escena{height:60vh}}
.v3-lienzo{display:block;width:100%;height:100%;touch-action:none}
.v3-marca{position:absolute;top:10px;right:10px;background:rgba(255,255,255,.88);border-radius:8px;padding:6px 10px}
.v3-logo{height:30px;display:block} .v3-logo.osc{display:none}
.v3-vistas{position:absolute;top:10px;left:10px;display:flex;gap:6px;flex-wrap:wrap}
.v3-vistas button{border:1px solid var(--linea,#e2e6e0);background:#fff;color:#17191c;border-radius:7px;padding:6px 10px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.v3-sol{position:absolute;left:10px;right:10px;bottom:10px;background:rgba(255,255,255,.92);color:#17191c;border-radius:9px;padding:7px 10px;display:grid;grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
@media (max-width:600px){.v3-sol{grid-template-columns:auto minmax(0,1fr) auto}}
@media (max-width:600px){.v3-marca{top:auto;bottom:92px;padding:4px 8px}.v3-logo{height:20px}}
.v3-sol input{width:100%;accent-color:#7fb800}
.v3-cargando{position:absolute;inset:0;display:grid;place-items:center;background:rgba(255,255,255,.55);font-weight:600}
.v3-cargando[hidden]{display:none}
.v3-estado{min-height:1.2em}
`;
