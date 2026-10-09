/* vistas/dashboard.js — Dashboard interactivo (solo superadmin).
 *
 * Un mapa isométrico de la Comunidad de Madrid sobre su contorno real, con los
 * municipios en sus coordenadas de verdad. Al pinchar una zona salen TODOS los
 * clientes que hay allí, uno a uno, y desde cada uno se salta a su ficha.
 * Todo sale de api.estado: lo que ves es lo que hay en la hoja ahora mismo.
 */

import {h, poner, txt, num, eur, miles, pct, fechaCorta, normal, hoyISO} from '../util.js';
import * as api from '../api.js';

/* ---------- geografía ---------- */
const LAT0 = 40.50, LON0 = -3.85;
const COSL = Math.cos(LAT0 * Math.PI / 180);
const GRADO = 1750;

/* Coordenadas reales de los municipios donde trabaja la empresa. Si aparece uno
   nuevo que no esté aquí, se coloca igualmente usando las coordenadas del cliente
   o, si no las hay, en la bolsa de "sin ubicar". */
const COORD = {
  'alpedrete': [-4.027, 40.658], 'hoyo de manzanares': [-3.906, 40.610],
  'la berzosa': [-3.872, 40.586], 'torrelodones': [-3.930, 40.576],
  'galapagar': [-4.001, 40.577], 'la navata': [-3.978, 40.601],
  'colmenarejo': [-4.012, 40.561], 'villanueva del pardillo': [-3.969, 40.494],
  'las rozas de madrid': [-3.874, 40.492], 'las rozas': [-3.874, 40.492],
  'majadahonda': [-3.872, 40.471], 'boadilla del monte': [-3.878, 40.405],
  'pozuelo de alarcon': [-3.813, 40.436], 'aravaca': [-3.787, 40.456],
  'madrid': [-3.703, 40.417], 'alcobendas': [-3.642, 40.547],
  'villaviciosa de odon': [-3.900, 40.357], 'brunete': [-3.998, 40.405],
  'villanueva de la canada': [-4.010, 40.446], 'moralzarzal': [-3.973, 40.678],
  'collado villalba': [-4.005, 40.635], 'guadarrama': [-4.090, 40.674],
  'san sebastian de los reyes': [-3.626, 40.547], 'tres cantos': [-3.710, 40.601],
  'mostoles': [-3.865, 40.323], 'alcorcon': [-3.825, 40.346],
  'humanes de madrid': [-3.830, 40.251], 'pinto': [-3.700, 40.242],
  'parla': [-3.767, 40.237], 'getafe': [-3.732, 40.308],
  'leganes': [-3.764, 40.327], 'fuenlabrada': [-3.794, 40.284],
  'arganda del rey': [-3.439, 40.301], 'colmenar viejo': [-3.766, 40.659],
  'el escorial': [-4.144, 40.583], 'valdemorillo': [-4.070, 40.505],
  'sevilla la nueva': [-4.031, 40.352], 'quijorna': [-4.060, 40.400],
  'navalagamella': [-4.166, 40.456], 'becerril de la sierra': [-3.993, 40.715]
};
/* El nombre tal y como se escribe bien, para los que llegan con faltas o sin tildes */
const BONITO = {
  'pozuelo de alarcon': 'Pozuelo de Alarcón', 'villaviciosa de odon': 'Villaviciosa de Odón',
  'las rozas': 'Las Rozas de Madrid', 'las rozas de madrid': 'Las Rozas de Madrid',
  'mostoles': 'Móstoles', 'alcorcon': 'Alcorcón', 'leganes': 'Leganés',
  'villanueva de la canada': 'Villanueva de la Cañada',
  'san sebastian de los reyes': 'San Sebastián de los Reyes'
};

const CONTORNO_MADRID = [
  [-3.53,41.17],[-3.33,41.12],[-3.12,40.95],[-3.05,40.75],[-3.09,40.60],[-3.25,40.35],
  [-3.17,40.20],[-3.35,40.00],[-3.52,39.89],[-3.70,39.98],[-3.90,40.05],[-4.05,40.15],
  [-4.18,40.30],[-4.35,40.45],[-4.55,40.55],[-4.47,40.70],[-4.20,40.85],[-4.05,40.95],
  [-3.85,41.05],[-3.70,41.12]
];
const CONTORNO_ESPANA = [
  [-8.9,43.3],[-7.7,43.8],[-5.8,43.6],[-4.5,43.4],[-3.0,43.5],[-1.8,43.4],[-1.3,43.1],
  [0.7,42.7],[1.8,42.5],[3.2,42.3],[3.1,41.9],[2.2,41.3],[0.9,41.0],[0.2,40.1],[0.0,39.6],
  [-0.3,39.3],[-0.2,38.8],[-0.5,38.3],[-0.9,37.9],[-1.6,37.4],[-2.1,36.8],[-3.0,36.7],
  [-4.4,36.7],[-5.2,36.1],[-5.6,36.0],[-6.3,36.6],[-6.9,37.2],[-7.4,37.2],[-7.5,37.6],
  [-7.0,38.0],[-7.3,38.4],[-7.0,38.9],[-7.0,39.7],[-7.5,39.6],[-7.0,40.2],[-6.9,41.0],
  [-6.2,41.6],[-6.6,41.9],[-7.2,41.9],[-8.2,42.1],[-8.9,41.9],[-8.8,42.6],[-9.3,43.0]
];

const GANADOS = ['ganado', 'cerrada', 'legalizada', 'instalada'];
const CALIENTES = ['propuesta', 'negociando', 'sentada'];

/* ---------- estilos, una sola vez ---------- */
function estilos() {
  if (document.getElementById('zwdash-css')) return;
  const s = document.createElement('style');
  s.id = 'zwdash-css';
  s.textContent = `
.zwd{--papel:#f3f5ef;--lienzo:#e9eee3;--carta:#fff;--linea:#dfe4d8;--tinta:#17201a;--tenue:#6b7a6e;
 --lima:#8bc53f;--limacl:#e8f5d4;--limaos:#5f8f22;--cian:#2fa8a0;--ambar:#e2a23a;--rojo:#d9534f;--azul:#4a7fc1;
 --mono:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;
 display:flex;flex-direction:column;height:calc(100vh - 150px);min-height:520px;
 border:1px solid var(--linea);border-radius:12px;overflow:hidden;background:var(--carta);color:var(--tinta)}
.zwd *{box-sizing:border-box}
.zwd-barra{display:flex;align-items:stretch;overflow-x:auto;background:var(--carta);border-bottom:2px solid var(--tinta);flex:0 0 auto}
.zwd-logo{display:flex;align-items:center;gap:9px;padding:0 14px;flex:0 0 auto;border-right:1px solid var(--linea)}
.zwd-logo img{height:24px;width:auto;display:block}
.zwd-logo span{font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.1em;background:var(--tinta);color:#fff;padding:3px 6px;border-radius:4px}
.zwd-chip{flex:0 0 auto;padding:8px 14px;border-right:1px solid var(--linea);display:flex;flex-direction:column;justify-content:center;min-width:88px}
.zwd-chip .e{font-family:var(--mono);font-size:8.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--tenue);white-space:nowrap}
.zwd-chip .v{font-family:var(--mono);font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.3}
.zwd-chip .v s{text-decoration:none;font-size:10px;font-weight:500;color:var(--tenue);margin-left:3px}
.zwd-chip.d{background:var(--limacl);border-left:3px solid var(--lima)}
.zwd-chip .v.l{color:var(--limaos)}.zwd-chip .v.c{color:var(--cian)}
.zwd-chip .v.a{color:var(--ambar)}.zwd-chip .v.r{color:var(--rojo)}

.zwd-cuerpo{flex:1;display:flex;min-height:0}
.zwd-escena{flex:1;position:relative;background:var(--lienzo);min-width:0}
.zwd-escena canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.zwd-escena canvas.ar{cursor:grabbing}
.zwd-zoom{position:absolute;right:12px;top:12px;display:flex;flex-direction:column;background:var(--carta);border:1px solid var(--linea);border-radius:9px;overflow:hidden}
.zwd-zoom button{width:32px;height:30px;border:0;border-bottom:1px solid var(--linea);background:transparent;cursor:pointer;font-size:15px;color:var(--tinta)}
.zwd-zoom button:last-child{border-bottom:0;font-size:12px}
.zwd-zoom button:hover{background:var(--limacl)}
.zwd-ley{position:absolute;right:12px;bottom:12px;background:var(--carta);border:1px solid var(--linea);border-radius:9px;padding:8px 10px}
.zwd-ley div{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--tenue);padding:1px 0}
.zwd-ley i{width:10px;height:10px;border-radius:3px}
.zwd-tub{position:absolute;left:12px;bottom:12px;right:60px;max-width:700px;background:var(--carta);border:1px solid var(--linea);border-radius:11px;padding:9px 12px 11px}
.zwd-tub h4{font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tenue);margin:0 0 8px}
.zwd-pasos{display:flex}
.zwd-paso{flex:1;text-align:center;position:relative;min-width:0}
.zwd-paso::before{content:'';position:absolute;top:10px;left:-50%;width:100%;height:2px;background:var(--linea)}
.zwd-paso:first-child::before{display:none}
.zwd-paso b{width:22px;height:22px;border-radius:50%;background:var(--lima);border:2px solid var(--lima);margin:0 auto 4px;position:relative;z-index:1;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:9px;color:#17201a}
.zwd-paso.fin b{background:var(--tinta);border-color:var(--tinta);color:#fff}
.zwd-paso u{text-decoration:none;font-family:var(--mono);font-size:12px;font-weight:700;display:block}
.zwd-paso s{text-decoration:none;font-size:9px;color:var(--tenue);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.zwd-rail{width:400px;flex:0 0 400px;border-left:2px solid var(--tinta);display:flex;flex-direction:column;background:var(--carta);min-height:0}
.zwd-sel{padding:12px 15px;border-bottom:1px solid var(--linea);flex:0 0 auto}
.zwd-sel h2{font-size:17px;font-weight:700;margin:0 0 2px}
.zwd-sel .s{font-size:11.5px;color:var(--tenue);margin-bottom:9px}
.zwd-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.zwd-mini div{background:var(--papel);border:1px solid var(--linea);border-radius:7px;padding:5px 7px;min-width:0}
.zwd-mini span{display:block;font-family:var(--mono);font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--tenue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zwd-mini b{font-family:var(--mono);font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.zwd-pest{display:flex;overflow-x:auto;border-bottom:1px solid var(--linea);flex:0 0 auto}
.zwd-pest button{flex:0 0 auto;background:0;border:0;border-bottom:2.5px solid transparent;padding:8px 11px;font-size:11.5px;font-weight:600;color:var(--tenue);cursor:pointer;white-space:nowrap}
.zwd-pest button.on{color:var(--tinta);border-bottom-color:var(--lima)}
.zwd-lista{flex:1;overflow-y:auto;padding:11px 15px 18px;min-height:0}
.zwd-bl{margin-bottom:15px}
.zwd-bl h3{font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tenue);margin:0 0 7px;padding-bottom:4px;border-bottom:1px solid var(--linea)}
.zwd-f{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}
.zwd-f .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zwd-f .v{font-family:var(--mono);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.zwd-f .b{flex:0 0 70px;height:6px;background:var(--papel);border-radius:4px;overflow:hidden}
.zwd-f .b i{display:block;height:100%}
.zwd-cli{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--linea);font-size:12px;cursor:pointer}
.zwd-cli:hover{background:var(--limacl)}
.zwd-cli .n{flex:1;min-width:0}
.zwd-cli .n b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zwd-cli .n s{text-decoration:none;display:block;font-size:10.5px;color:var(--tenue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zwd-cli .im{font-family:var(--mono);font-size:11.5px;font-weight:700;white-space:nowrap}
.zwd-et{display:inline-block;font-family:var(--mono);font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap}
.zwd-et.g{background:var(--limacl);color:var(--limaos)}
.zwd-et.c{background:#d8f0ee;color:#1d6f69}
.zwd-et.a{background:#fbeccd;color:#8a5f12}
.zwd-et.z{background:var(--papel);color:var(--tenue)}
.zwd-buscar{width:100%;border:1px solid var(--linea);border-radius:7px;padding:6px 9px;font:inherit;font-size:12px;margin-bottom:9px}
.zwd-nota{font-size:11px;color:var(--tenue);line-height:1.5;margin:6px 0 0}
@media (max-width:1180px){.zwd-rail{width:330px;flex-basis:330px}.zwd-tub{right:56px}}
@media (max-width:820px){.zwd{height:auto}.zwd-cuerpo{flex-direction:column}
 .zwd-escena{height:52vh;min-height:320px}.zwd-rail{width:100%;flex-basis:auto;height:60vh;border-left:0;border-top:2px solid var(--tinta)}
 .zwd-tub{display:none}}
`;
  document.head.appendChild(s);
}

/* ---------- agrupar la cartera por zona ---------- */
function clave(m) {
  return normal(String(m || '').trim())
    .replace(/\s+/g, ' ')
    .replace(/^el |^la |^los |^las /, m2 => m2);   /* se deja tal cual, solo normaliza */
}
function zonas() {
  const z = {};
  api.estado.clientes.forEach(c => {
    const k = clave(c.municipio);
    const nombre = k && COORD[k] ? (BONITO[k] || capitaliza(c.municipio)) : (txt(c.municipio) ? capitaliza(c.municipio) : '');
    const id = k && COORD[k] ? k : (k || '__sin__');
    if (!z[id]) z[id] = {id, nombre: nombre || 'Sin ubicar', coord: COORD[k] || null, clientes: []};
    z[id].clientes.push(c);
  });
  Object.values(z).forEach(zz => {
    zz.n = zz.clientes.length;
    zz.ganados = zz.clientes.filter(c => GANADOS.includes(normal(c.estado))).length;
    zz.citas = zz.clientes.filter(c => normal(c.estado) === 'cita').length;
    zz.calientes = zz.clientes.filter(c => CALIENTES.includes(normal(c.estado))).length;
    zz.importe = zz.clientes.reduce((a, c) => a + importeDe(c), 0);
  });
  return Object.values(z).sort((a, b) => b.n - a.n);
}
function capitaliza(s) {
  return String(s || '').trim().toLowerCase().replace(/(^|\s|\/)([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
}
function importeDe(c) {
  return api.estado.operaciones
    .filter(o => String(o.cliente_id) === String(c.id))
    .reduce((a, o) => a + (Number(o.total) || 0), 0);
}
function colorZona(z) {
  if (z.ganados > 0) return '#8bc53f';
  if (z.calientes > 0) return '#e2a23a';
  if (z.citas > 0) return '#2fa8a0';
  return '#b9c3b2';
}

/* ---------- vista ---------- */
export async function vistaDashboard({ir}) {
  estilos();
  if (!api.estado.cargado) await api.cargarDatos();

  let partes = [];
  try { partes = (await api.pedir('partes', {desde: '', hasta: hoyISO()})).partes || []; } catch (e) { partes = []; }

  const Z = zonas();
  const ubicadas = Z.filter(z => z.coord);
  const sinUbicar = Z.filter(z => !z.coord);
  const bolsa = {
    id: '__sin__', nombre: 'Sin ubicar', coord: null,
    clientes: sinUbicar.reduce((a, z) => a.concat(z.clientes), [])
  };
  bolsa.n = bolsa.clientes.length;
  bolsa.ganados = bolsa.clientes.filter(c => GANADOS.includes(normal(c.estado))).length;
  bolsa.citas = bolsa.clientes.filter(c => normal(c.estado) === 'cita').length;
  bolsa.calientes = bolsa.clientes.filter(c => CALIENTES.includes(normal(c.estado))).length;
  bolsa.importe = bolsa.clientes.reduce((a, c) => a + importeDe(c), 0);

  /* ----- cifras de cabecera ----- */
  const ops = api.estado.operaciones;
  const facturado = api.estado.facturas.reduce((a, f) => a + (Number(f.total) || 0), 0);
  const cobrado = api.estado.cobros.filter(c => normal(c.estado) === 'cobrado')
    .reduce((a, c) => a + (Number(c.importe) || 0), 0);
  const pendiente = api.estado.cobros.filter(c => normal(c.estado) !== 'cobrado')
    .reduce((a, c) => a + (Number(c.importe) || 0), 0);
  const gastos = api.estado.gastos.reduce((a, g) => a + (Number(g.importe) || 0), 0);
  const cartera = ops.reduce((a, o) => a + (Number(o.total) || 0), 0);
  const ke = n => (n / 1000).toFixed(1).replace('.', ',') + ' k€';

  const CHIPS = [
    ['Cartera viva', ke(cartera), ops.length + ' obras', 'd l'],
    ['Facturado', ke(facturado), api.estado.facturas.length + ' facturas', ''],
    ['Cobrado', ke(cobrado), facturado ? pct(cobrado / facturado * 100) : '—', 'c'],
    ['Pendiente', ke(pendiente), 'por cobrar', 'a'],
    ['Gastos', ke(gastos), 'imputados', 'r'],
    ['Margen', ke(facturado - gastos), facturado ? pct((facturado - gastos) / facturado * 100) : '—', 'l'],
    ['Clientes', miles(api.estado.clientes.length), ubicadas.length + ' municipios', ''],
    ['Leads vivos', miles(api.estado.captaciones.length), 'captaciones', '']
  ];

  /* ----- armazón ----- */
  const lienzo = h('canvas');
  const rTit = h('h2', 'Comunidad de Madrid');
  const rSub = h('.s', 'Toda la cartera · pincha una zona del mapa');
  const rMini = h('.zwd-mini');
  const rLista = h('.zwd-lista');
  const navPest = h('.zwd-pest');
  const pasos = h('.zwd-pasos');

  const raiz = h('.zwd',
    h('.zwd-barra',
      h('.zwd-logo', h('img', {src: 'assets/img/logo-h96.png', alt: 'Zero Wattios'}), h('span', 'CRM')),
      CHIPS.map(c => h('.zwd-chip' + (c[3].includes('d') ? '.d' : ''),
        h('.e', c[0]),
        h('.v' + (c[3].replace('d', '').trim() ? '.' + c[3].replace('d', '').trim() : ''), c[1], h('s', c[2]))))),
    h('.zwd-cuerpo',
      h('.zwd-escena',
        lienzo,
        h('.zwd-zoom',
          h('button', {type: 'button', title: 'Acercar', onclick: () => { encuadrado = true; vista.esc = Math.min(2.4, vista.esc * 1.18); dibuja(); }}, '+'),
          h('button', {type: 'button', title: 'Alejar', onclick: () => { encuadrado = true; vista.esc = Math.max(.08, vista.esc / 1.18); dibuja(); }}, '−'),
          h('button', {type: 'button', title: 'Centrar', onclick: () => { encuadrado = false; dibuja(); }}, '⌂')),
        h('.zwd-ley',
          h('div', h('i', {estilo: {background: '#8bc53f'}}), 'Con obra ganada'),
          h('div', h('i', {estilo: {background: '#e2a23a'}}), 'Propuesta o negociando'),
          h('div', h('i', {estilo: {background: '#2fa8a0'}}), 'Con cita puesta'),
          h('div', h('i', {estilo: {background: '#b9c3b2'}}), 'Cartera fría')),
        h('.zwd-tub', h('h4', 'Seguimiento de obra · de la puerta al cobro'), pasos)),
      h('.zwd-rail',
        h('.zwd-sel', rTit, rSub, rMini),
        navPest,
        rLista)));

  /* ----- embudo ----- */
  const caps = api.estado.captaciones;
  const sentadas = caps.filter(c => ['sentada', 'venta'].includes(normal(c.resultado))).length;
  const enFase = e => ops.filter(o => normal(o.estado) === e).length;
  const EMB = [
    ['Lead', caps.length], ['Sentada', sentadas],
    ['Propuesta', api.estado.clientes.filter(c => normal(c.estado) === 'propuesta').length + enFase('propuesta')],
    ['Firma', ops.length],
    ['Material', enFase('material')], ['Montaje', enFase('instalacion') + enFase('instalada')],
    ['Legalización', enFase('legalizada')], ['Cobro', enFase('cerrada')]
  ];
  poner(pasos, EMB.map((e, i) => h('.zwd-paso' + (i === EMB.length - 1 ? '.fin' : ''),
    h('b', String(i + 1)), h('u', miles(e[1])), h('s', e[0]))));

  /* ----- mapa ----- */
  const vista = {esc: 1, dx: 0, dy: 0};
  let sel = null, hover = null, cx = null;
  const TODAS = ubicadas.concat(bolsa.n ? [bolsa] : []);

  function local(lon, lat) { return {x: (lon - LON0) * COSL * GRADO, y: -(lat - LAT0) * GRADO}; }
  function proy(lon, lat) {
    const l = local(lon, lat);
    return {
      x: lienzo.clientWidth / 2 + (l.x - l.y) * 0.86 * vista.esc + vista.dx,
      y: lienzo.clientHeight / 2 + (l.x + l.y) * 0.43 * vista.esc + vista.dy - 24 * vista.esc
    };
  }
  function rombo(p, r, relleno, borde) {
    cx.beginPath();
    cx.moveTo(p.x, p.y - r / 2); cx.lineTo(p.x + r, p.y);
    cx.lineTo(p.x, p.y + r / 2); cx.lineTo(p.x - r, p.y); cx.closePath();
    if (relleno) { cx.fillStyle = relleno; cx.fill(); }
    if (borde) { cx.strokeStyle = borde; cx.lineWidth = 1.4; cx.stroke(); }
  }
  function sombra(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgb(' + ((r * .72) | 0) + ',' + ((g * .72) | 0) + ',' + ((b * .72) | 0) + ')';
  }
  function edificio(p, a, alto, color) {
    const osc = sombra(color);
    cx.fillStyle = osc;
    cx.beginPath(); cx.moveTo(p.x - a, p.y); cx.lineTo(p.x, p.y + a / 2);
    cx.lineTo(p.x, p.y + a / 2 - alto); cx.lineTo(p.x - a, p.y - alto); cx.closePath(); cx.fill();
    cx.fillStyle = color;
    cx.beginPath(); cx.moveTo(p.x + a, p.y); cx.lineTo(p.x, p.y + a / 2);
    cx.lineTo(p.x, p.y + a / 2 - alto); cx.lineTo(p.x + a, p.y - alto); cx.closePath(); cx.fill();
    cx.fillStyle = '#fff';
    cx.beginPath(); cx.moveTo(p.x, p.y - a / 2 - alto); cx.lineTo(p.x + a, p.y - alto);
    cx.lineTo(p.x, p.y + a / 2 - alto); cx.lineTo(p.x - a, p.y - alto); cx.closePath(); cx.fill();
    cx.strokeStyle = 'rgba(23,32,26,.18)'; cx.lineWidth = 1; cx.stroke();
  }
  function region() {
    const pts = CONTORNO_MADRID.map(c => proy(c[0], c[1]));
    const G = 15 * vista.esc;
    cx.beginPath();
    pts.forEach((p, i) => i ? cx.lineTo(p.x, p.y + G) : cx.moveTo(p.x, p.y + G));
    for (let i = pts.length - 1; i >= 0; i--) cx.lineTo(pts[i].x, pts[i].y);
    cx.closePath(); cx.fillStyle = '#cfd9c4'; cx.fill();
    cx.beginPath();
    pts.forEach((p, i) => i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y));
    cx.closePath();
    const g = cx.createLinearGradient(0, 0, 0, lienzo.clientHeight);
    g.addColorStop(0, '#eef3e6'); g.addColorStop(1, '#e2e9d7');
    cx.fillStyle = g; cx.fill();
    cx.strokeStyle = 'rgba(23,32,26,.3)'; cx.lineWidth = 1.6; cx.stroke();
    cx.save(); cx.clip();
    cx.fillStyle = 'rgba(95,143,34,.09)';
    const s = [[-4.75, 41.05], [-3.55, 41.05], [-3.95, 40.42], [-4.75, 40.45]].map(c => proy(c[0], c[1]));
    cx.beginPath(); s.forEach((p, i) => i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y));
    cx.closePath(); cx.fill(); cx.restore();
    const cap = proy(-3.33, 40.92);
    cx.font = '700 ' + (11 * Math.max(.8, vista.esc)) + 'px system-ui, sans-serif';
    cx.fillStyle = 'rgba(23,32,26,.28)'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('COMUNIDAD DE MADRID', cap.x, cap.y); cx.textAlign = 'left';
  }
  function espana() {
    const W = 118, H = 96, ox = 12, oy = 12;
    cx.save();
    cx.fillStyle = 'rgba(255,255,255,.93)'; cx.strokeStyle = 'rgba(23,32,26,.14)'; cx.lineWidth = 1;
    cx.beginPath();
    const r = 9;
    cx.moveTo(ox + r, oy); cx.arcTo(ox + W, oy, ox + W, oy + H, r); cx.arcTo(ox + W, oy + H, ox, oy + H, r);
    cx.arcTo(ox, oy + H, ox, oy, r); cx.arcTo(ox, oy, ox + W, oy, r); cx.closePath(); cx.fill(); cx.stroke();
    const los = CONTORNO_ESPANA.map(c => c[0]), las = CONTORNO_ESPANA.map(c => c[1]);
    const lo0 = Math.min(...los), lo1 = Math.max(...los), la0 = Math.min(...las), la1 = Math.max(...las);
    const pad = 11;
    const k = Math.min((W - pad * 2) / ((lo1 - lo0) * COSL), (H - pad * 2 - 10) / (la1 - la0));
    const px = (lon, lat) => ({x: ox + pad + (lon - lo0) * COSL * k, y: oy + pad + 9 + (la1 - lat) * k});
    cx.beginPath();
    CONTORNO_ESPANA.forEach((c, i) => { const p = px(c[0], c[1]); i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); });
    cx.closePath(); cx.fillStyle = '#e4eadc'; cx.fill();
    cx.strokeStyle = 'rgba(23,32,26,.25)'; cx.stroke();
    cx.beginPath();
    CONTORNO_MADRID.forEach((c, i) => { const p = px(c[0], c[1]); i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); });
    cx.closePath(); cx.fillStyle = '#8bc53f'; cx.fill();
    cx.strokeStyle = '#5f8f22'; cx.lineWidth = 1.2; cx.stroke();
    cx.font = '600 8.5px ui-monospace, monospace'; cx.fillStyle = '#6b7a6e'; cx.textAlign = 'center';
    cx.fillText('ZONA DE TRABAJO', ox + W / 2, oy + 10); cx.textAlign = 'left';
    cx.restore();
  }
  let encuadrado = false;
  function encuadra() {
    const W = lienzo.clientWidth, H = lienzo.clientHeight;
    if (!W || !H) return;
    vista.esc = 1; vista.dx = 0; vista.dy = 0;
    const pts = CONTORNO_MADRID.map(c => proy(c[0], c[1]));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const an = Math.max(1, Math.max.apply(null, xs) - Math.min.apply(null, xs));
    const al = Math.max(1, Math.max.apply(null, ys) - Math.min.apply(null, ys));
    vista.esc = Math.min((W - 150) / an, (H - 130) / al);
    const p2 = CONTORNO_MADRID.map(c => proy(c[0], c[1]));
    const cxm = (Math.min.apply(null, p2.map(p => p.x)) + Math.max.apply(null, p2.map(p => p.x))) / 2;
    const cym = (Math.min.apply(null, p2.map(p => p.y)) + Math.max.apply(null, p2.map(p => p.y))) / 2;
    vista.dx += W / 2 - cxm;
    vista.dy += H / 2 - cym;
    encuadrado = true;
  }
  function dibuja() {
    if (!cx) return;
    const W = lienzo.clientWidth, H = lienzo.clientHeight;
    if (!W || !H) return;
    if (!encuadrado) encuadra();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = W * dpr; lienzo.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    region();

    const maxN = Math.max.apply(null, ubicadas.map(z => z.n).concat([1]));
    ubicadas.slice().sort((a, b) => {
      const la = local(a.coord[0], a.coord[1]), lb = local(b.coord[0], b.coord[1]);
      return (la.x + la.y) - (lb.x + lb.y);
    }).forEach(z => {
      const pt = proy(z.coord[0], z.coord[1]);
      z._pt = pt;
      if (pt.x < -200 || pt.x > W + 200) return;
      const col = colorZona(z);
      const esSel = sel === z.id, esHov = hover === z.id;
      rombo(pt, 72 * vista.esc,
        esSel ? 'rgba(139,197,63,.32)' : (esHov ? 'rgba(139,197,63,.16)' : 'rgba(23,32,26,.04)'),
        esSel ? '#8bc53f' : null);
      const torres = Math.max(1, Math.min(6, Math.round(z.n / 14)));
      const base = (12 + Math.min(58, Math.sqrt(z.n) * 6.6)) * vista.esc;
      for (let i = 0; i < torres; i++) {
        const ang = (i / torres) * Math.PI * 2 + .6;
        const rad = torres === 1 ? 0 : 23 * vista.esc;
        edificio({x: pt.x + Math.cos(ang) * rad, y: pt.y + Math.sin(ang) * rad * .5},
          (11 + (torres === 1 ? 6 : 0)) * vista.esc, base * (.55 + .45 * ((i % 3) / 2)), col);
      }
      const umbral = vista.esc < 0.45 ? maxN * 0.18 : vista.esc < 0.7 ? maxN * 0.06 : 0;
      if (esSel || esHov || z.n >= umbral) etiquetaZona(pt, z.nombre, z.n, esSel);
    });

    if (bolsa.n) {
      const sp = proy(-4.66, 40.08);
      bolsa._pt = sp;
      rombo(sp, 74 * vista.esc, sel === '__sin__' ? 'rgba(217,83,79,.24)' : 'rgba(217,83,79,.1)', '#d9534f');
      cx.font = '600 ' + (10.5 * Math.max(.85, vista.esc)) + 'px system-ui, sans-serif';
      cx.fillStyle = '#9c3b38'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('Sin ubicar', sp.x, sp.y - 5);
      cx.font = '700 ' + (14 * Math.max(.85, vista.esc)) + 'px ui-monospace, monospace';
      cx.fillText(miles(bolsa.n), sp.x, sp.y + 11);
      cx.textAlign = 'left';
    }
    espana();
  }
  function etiquetaZona(pt, nombre, n, esSel) {
    cx.font = '600 ' + (11 * Math.max(.85, vista.esc)) + 'px system-ui, sans-serif';
    const a = cx.measureText(nombre).width + 32, y = pt.y + 26 * vista.esc, r = 8;
    cx.fillStyle = esSel ? '#17201a' : 'rgba(255,255,255,.93)';
    cx.strokeStyle = esSel ? '#17201a' : 'rgba(23,32,26,.14)'; cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(pt.x - a / 2 + r, y); cx.arcTo(pt.x + a / 2, y, pt.x + a / 2, y + 19, r);
    cx.arcTo(pt.x + a / 2, y + 19, pt.x - a / 2, y + 19, r); cx.arcTo(pt.x - a / 2, y + 19, pt.x - a / 2, y, r);
    cx.arcTo(pt.x - a / 2, y, pt.x + a / 2, y, r); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = esSel ? '#fff' : '#17201a'; cx.textAlign = 'left'; cx.textBaseline = 'middle';
    cx.fillText(nombre, pt.x - a / 2 + 9, y + 9.5);
    cx.font = '700 ' + (11 * Math.max(.85, vista.esc)) + 'px ui-monospace, monospace';
    cx.fillStyle = esSel ? '#8bc53f' : '#6b7a6e'; cx.textAlign = 'right';
    cx.fillText(String(n), pt.x + a / 2 - 9, y + 9.5);
    cx.textAlign = 'left';
  }
  function zonaEn(mx, my) {
    let mejor = null, d0 = 1e9;
    TODAS.forEach(z => {
      if (!z._pt) return;
      const d = Math.hypot(mx - z._pt.x, (my - z._pt.y) * 2);
      if (d < 62 * vista.esc && d < d0) { d0 = d; mejor = z; }
    });
    return mejor;
  }

  /* interacción */
  let arr = false, u0 = {x: 0, y: 0}, mov = 0;
  lienzo.addEventListener('pointerdown', e => {
    arr = true; mov = 0; u0 = {x: e.clientX, y: e.clientY};
    lienzo.classList.add('ar'); lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', e => {
    const r = lienzo.getBoundingClientRect();
    if (arr) {
      const dx = e.clientX - u0.x, dy = e.clientY - u0.y;
      mov += Math.abs(dx) + Math.abs(dy);
      vista.dx += dx; vista.dy += dy; u0 = {x: e.clientX, y: e.clientY};
      dibuja();
    } else {
      const z = zonaEn(e.clientX - r.left, e.clientY - r.top);
      const nh = z ? z.id : null;
      if (nh !== hover) { hover = nh; dibuja(); }
    }
  });
  lienzo.addEventListener('pointerup', e => {
    arr = false; lienzo.classList.remove('ar');
    if (mov < 6) {
      const r = lienzo.getBoundingClientRect();
      const z = zonaEn(e.clientX - r.left, e.clientY - r.top);
      sel = z ? z.id : null;
      pintaSeleccion(); dibuja();
    }
  });
  lienzo.addEventListener('wheel', e => {
    e.preventDefault();
    encuadrado = true; vista.esc = Math.max(.08, Math.min(2.4, vista.esc * (e.deltaY > 0 ? .92 : 1.08)));
    dibuja();
  }, {passive: false});

  /* ----- raíl: cabecera de la selección ----- */
  function zonaSel() { return TODAS.find(z => z.id === sel) || null; }
  function pintaSeleccion() {
    const z = zonaSel();
    if (!z) {
      rTit.textContent = 'Comunidad de Madrid';
      rSub.textContent = 'Toda la cartera · pincha una zona del mapa';
      poner(rMini, mini([
        ['Clientes', miles(api.estado.clientes.length)],
        ['Leads', miles(caps.length)], ['Obras', miles(ops.length)],
        ['Cartera', ke(cartera)], ['Cobrado', ke(cobrado)], ['Margen', ke(facturado - gastos)]
      ]));
    } else {
      rTit.textContent = z.nombre;
      rSub.textContent = pct(z.n / api.estado.clientes.length * 100) + ' de la cartera · ' +
        (z.ganados ? z.ganados + (z.ganados > 1 ? ' obras ganadas' : ' obra ganada') : 'sin obras todavía');
      poner(rMini, mini([
        ['Clientes', miles(z.n)], ['Con cita', miles(z.citas)], ['Calientes', miles(z.calientes)],
        ['Ganados', miles(z.ganados)], ['Conversión', pct(z.ganados / z.n * 100)],
        ['Facturado', z.importe ? ke(z.importe) : '—']
      ]));
    }
    marcaPestana(sel ? 'Clientes' : pestActiva);
    pinta();
  }
  function mini(ls) {
    return ls.map(l => h('div', h('span', l[0]), h('b', l[1])));
  }

  /* ----- raíl: pestañas ----- */
  const colEstado = e => GANADOS.includes(e) ? 'g' : CALIENTES.includes(e) ? 'a' : e === 'cita' ? 'c' : 'z';
  let pestActiva = 'Clientes', filtro = '';

  function filaCliente(c) {
    const im = importeDe(c);
    const est = normal(c.estado) || 'nuevo';
    const com = (api.estado.usuarios.find(u => String(u.id) === String(c.comercial_id)) || {}).nombre || '';
    return h('.zwd-cli', {onclick: () => ir('cliente/' + c.id)},
      h('.n', h('b', txt(c.nombre) || '(sin nombre)'),
        h('s', [txt(c.direccion), txt(c.telefono), com].filter(Boolean).join(' · ') || '—')),
      h('span.zwd-et.' + colEstado(est), est),
      im ? h('.im', ke(im)) : null);
  }
  function barra(v, max, color) {
    return h('.b', h('i', {estilo: {width: Math.max(4, v / max * 100) + '%', background: color}}));
  }
  function fila(nm, vl, extra) {
    return h('.zwd-f', h('.n', nm), extra || null, h('.v', vl));
  }
  function bloque(t, ...hijos) { return h('.zwd-bl', h('h3', t), hijos); }

  const PEST = {
    'Clientes': () => {
      const z = zonaSel();
      const lista = (z ? z.clientes : api.estado.clientes).slice()
        .sort((a, b) => importeDe(b) - importeDe(a) || txt(a.nombre).localeCompare(txt(b.nombre), 'es'));
      const q = normal(filtro);
      const vis = q ? lista.filter(c => normal(
        txt(c.nombre) + ' ' + txt(c.direccion) + ' ' + txt(c.telefono) + ' ' + txt(c.estado)).includes(q)) : lista;
      const buscador = h('input.zwd-buscar', {
        type: 'search', placeholder: 'Buscar por nombre, calle, teléfono o estado…', valor: filtro,
        oninput: e => { filtro = e.target.value; pinta(); setTimeout(() => {
          const i = rLista.querySelector('.zwd-buscar'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
        }, 0); }
      });
      return [
        bloque((z ? z.nombre : 'Toda la cartera') + ' · ' + miles(vis.length) +
          (vis.length === lista.length ? '' : ' de ' + miles(lista.length)) + ' clientes',
          buscador,
          vis.length ? vis.map(filaCliente) : h('p.zwd-nota', 'Ningún cliente coincide con la búsqueda.'))
      ];
    },
    'Obras': () => {
      const lista = ops.slice().sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
      const fases = {};
      ops.forEach(o => { const e = normal(o.estado) || 'sin fase'; fases[e] = (fases[e] || 0) + 1; });
      const maxF = Math.max.apply(null, Object.values(fases).concat([1]));
      return [
        bloque('Reparto por fase', Object.entries(fases).sort((a, b) => b[1] - a[1])
          .map(([e, n]) => fila(e, n, barra(n, maxF, '#8bc53f')))),
        bloque('Las ' + ops.length + ' instalaciones · ' + ke(cartera), lista.map(o => {
          const c = api.cliente(o.cliente_id) || {};
          return h('.zwd-cli', {onclick: () => ir('cliente/' + o.cliente_id)},
            h('.n', h('b', txt(c.nombre) || o.referencia || o.id),
              h('s', [txt(c.municipio), txt(o.referencia)].filter(Boolean).join(' · ') || '—')),
            h('span.zwd-et.' + colEstado(normal(o.estado)), normal(o.estado)),
            h('.im', Number(o.total) ? ke(Number(o.total)) : '—'));
        }))
      ];
    },
    'Embudo': () => {
      const max = Math.max.apply(null, EMB.map(e => e[1]).concat([1]));
      const r = (a, b) => b ? pct(a / b * 100) : '—';
      return [
        bloque('De la puerta al cobro', EMB.map(e =>
          fila(e[0], miles(e[1]), barra(e[1], max, '#8bc53f')))),
        bloque('Ratios',
          fila('Lead → sentada', r(sentadas, caps.length)),
          fila('Sentada → firma', r(ops.length, sentadas)),
          fila('Leads por obra firmada', ops.length ? (caps.length / ops.length).toFixed(1).replace('.', ',') : '—'),
          fila('Ticket medio', ops.length ? ke(cartera / ops.length) : '—'))
      ];
    },
    'Equipo': () => {
      const porCapt = {}, porCom = {};
      caps.forEach(c => {
        const k = c.captador_id || 'sin';
        porCapt[k] = (porCapt[k] || 0) + 1;
        if (['sentada', 'venta'].includes(normal(c.resultado))) {
          const k2 = c.comercial_id || 'sin';
          porCom[k2] = (porCom[k2] || 0) + 1;
        }
      });
      const nom = id => id === 'sin' ? 'Sin asignar'
        : (api.estado.usuarios.find(u => String(u.id) === String(id)) || {}).nombre || id;
      const maxA = Math.max.apply(null, Object.values(porCapt).concat([1]));
      const maxB = Math.max.apply(null, Object.values(porCom).concat([1]));
      const nPartes = partes.length;
      return [
        bloque('Captación · ' + caps.length + ' fichas', Object.entries(porCapt).sort((a, b) => b[1] - a[1])
          .map(([k, v]) => fila(nom(k), v + '  ·  ' + pct(v / caps.length * 100), barra(v, maxA, '#8bc53f')))),
        bloque('Sentadas por comercial · ' + sentadas, Object.entries(porCom).sort((a, b) => b[1] - a[1])
          .map(([k, v]) => fila(nom(k), v + '  ·  ' + pct(v / (sentadas || 1) * 100), barra(v, maxB, '#2fa8a0')))),
        bloque('Partes diarios', fila('Partes registrados', miles(nPartes)),
          nPartes ? null : h('p.zwd-nota',
            'Todavía no hay partes. Hasta que captadores y comerciales los envíen desde "Parte del día", las puertas tocadas no entran en el embudo.'))
      ];
    },
    'Dinero': () => {
      const porCat = {};
      api.estado.gastos.forEach(g => {
        const k = txt(g.categoria) || 'sin categoría';
        porCat[k] = (porCat[k] || 0) + (Number(g.importe) || 0);
      });
      const maxG = Math.max.apply(null, Object.values(porCat).concat([1]));
      const sinObra = api.estado.gastos.filter(g => !txt(g.operacion_id))
        .reduce((a, g) => a + (Number(g.importe) || 0), 0);
      return [
        bloque('Caja',
          fila('Facturado', eur(facturado)), fila('Cobrado', eur(cobrado)),
          fila('Pendiente de cobro', eur(pendiente)), fila('Gastos', eur(gastos)),
          fila('Margen bruto', eur(facturado - gastos))),
        bloque('Gastos por categoría', Object.entries(porCat).sort((a, b) => b[1] - a[1])
          .map(([k, v]) => fila(k, ke(v), barra(v, maxG, '#6b7a6e'))),
          sinObra ? h('p.zwd-nota', ke(sinObra) + ' de gasto no está imputado a ninguna instalación, así que no cuenta en el margen por obra.') : null),
        bloque('Cobros por estado',
          fila('Cobrados', miles(api.estado.cobros.filter(c => normal(c.estado) === 'cobrado').length)),
          fila('Previstos', miles(api.estado.cobros.filter(c => normal(c.estado) !== 'cobrado').length)))
      ];
    },
    'Zonas': () => {
      const todas = ubicadas.concat(bolsa.n ? [bolsa] : []);
      const max = Math.max.apply(null, todas.map(z => z.n).concat([1]));
      return [
        bloque('Clientes por zona', todas.slice().sort((a, b) => b.n - a.n).map(z =>
          h('.zwd-f', {estilo: {cursor: 'pointer'}, onclick: () => { sel = z.id; pintaSeleccion(); dibuja(); }},
            h('.n', z.nombre), barra(z.n, max, z.id === '__sin__' ? '#d9534f' : colorZona(z)), h('.v', miles(z.n))))),
        bloque('Dónde se cierra', ubicadas.filter(z => z.ganados).sort((a, b) => b.ganados - a.ganados)
          .map(z => fila(z.nombre, z.ganados + ' de ' + z.n + '  ·  ' + pct(z.ganados / z.n * 100),
            barra(z.ganados, Math.max.apply(null, ubicadas.map(x => x.ganados).concat([1])), '#8bc53f'))),
          bolsa.n ? h('p.zwd-nota', miles(bolsa.n) + ' clientes no tienen municipio apuntado y quedan fuera del mapa.') : null)
      ];
    }
  };

  function marcaPestana(nombre) {
    pestActiva = PEST[nombre] ? nombre : 'Clientes';
    Array.from(navPest.children).forEach(b => b.classList.toggle('on', b.textContent === pestActiva));
  }
  function pinta() {
    poner(rLista, PEST[pestActiva]());
    rLista.scrollTop = 0;
  }
  poner(navPest, Object.keys(PEST).map(k => h('button', {
    type: 'button',
    class: k === pestActiva ? 'on' : '',
    onclick: () => { marcaPestana(k); pinta(); }
  }, k)));

  pintaSeleccion();

  /* ----- arranque del lienzo cuando ya está en pantalla ----- */
  requestAnimationFrame(() => {
    cx = lienzo.getContext('2d');
    dibuja();
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => dibuja());
      ro.observe(lienzo.parentElement);
    } else {
      window.addEventListener('resize', dibuja);
    }
  });

  return raiz;
}
