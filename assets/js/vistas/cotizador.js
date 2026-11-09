/* vistas/cotizador.js — Cotizador a partir de una dirección.
 *
 * 09/11/2026 (Nando): «un cotizador manejando los precios que manejamos y los
 * márgenes; no se le puede indicar a los comerciales y captadores, pero los
 * directivos pueden jugar con ese margen y ampliarlo o reducirlo para
 * propuestas futuras. Se hace a raíz de una dirección, de la cual coges los
 * datos del Catastro».
 *
 * - Todos: dirección → Catastro (m² construidos, año, uso y planta del
 *   tejado) → equipo recomendado → precio de tarifa con IVA, ayudas, cuota a
 *   10 años y ahorro orientativo. Sin costes ni márgenes.
 * - Dirección (permiso de finanzas): coste estimado con el catálogo de costes
 *   de las facturas de proveedor, margen de la tarifa, horquilla de margen
 *   (margen_min_pct / margen_max_pct, que el servidor no manda a nadie más) y
 *   botón para dejar el precio elegido como tarifa de las propuestas futuras.
 */

import {h, poner, txt, num, normal} from '../util.js';
import * as api from '../api.js';
import {aviso} from '../ui.js';
import {catalogoCostes, materialesDe} from '../materiales.js';
import {utm30, geocodificar, edificiosCatastro, area, dentro, rectanguloMinimo, factor, nombreAz} from './visor3d.js';

const eur = n => Math.round(n || 0).toLocaleString('es-ES') + ' €';
const pct = n => (Math.round((n || 0) * 1000) / 10).toLocaleString('es-ES') + ' %';
const IVA = 1.21;
const COEF_10 = 0.012894;            // Finlight, 10 años (sin mostrar condiciones al cliente)
const PANELES = [{w: 625, n: 'Hanersun 625 W', m2: 2.70}, {w: 590, n: 'Risen 590 W bifacial', m2: 2.58}, {w: 500, n: 'Full Black 500 W', m2: 2.22}];

/* ---------- tarifas (CONFIG) ---------- */
function tarifas() {
  const c = api.estado.config || {};
  const v = (k, d) => num(c[k]) || d;
  return {
    fv: [[12, v('precio_fv_10_12', 9990)], [16, v('precio_fv_14_16', 10990)], [20, v('precio_fv_18_20', 11990)], [24, v('precio_fv_22_24', 12990)]],
    aero: {12: v('precio_aero_12', 15990), 16: v('precio_aero_16', 16990), 19: v('precio_aero_19', 17990), 22: v('precio_aero_22', 18990)},
    bateria: v('precio_bateria_modulo', 2570), cargador: v('precio_cargador', 1870), suplemento: 1000,
    margenMin: v('margen_min_pct', 35) / 100, margenMax: v('margen_max_pct', 45) / 100
  };
}
const claveFv = n => n <= 12 ? 'precio_fv_10_12' : n <= 16 ? 'precio_fv_14_16' : n <= 20 ? 'precio_fv_18_20' : 'precio_fv_22_24';
function precioFv(n, T) {
  if (!n) return 0;
  for (const [hasta, p] of T.fv) if (n <= hasta) return p;
  const [hasta, p] = T.fv[T.fv.length - 1];
  return p + Math.ceil((n - hasta) / 4) * 1000;             // más de 24 paneles: +1.000 € cada 4
}

/* ---------- dimensionado ---------- */
function aeroKw(m2, anyo, plantas) {
  const wm2 = !anyo ? 80 : anyo < 1980 ? 100 : anyo < 2007 ? 80 : 60;   // aislamiento según época
  const kw = m2 * wm2 / 1000;
  return kw <= 12 ? 12 : kw <= 16 ? 16 : kw <= 19 ? 19 : 22;
}

/** Solo comerciales y dirección (los captadores no). */
export const veCotizador = () => normal((api.estado.usuario || {}).rol) !== 'captador';

export async function vistaCotizador({id}) {
  if (!veCotizador()) return h('.tarjeta', h('.cuerpo', h('p.nota', 'El cotizador es solo para comerciales y dirección.')));
  const cli = id ? api.cliente(id) : null;
  const dir = api.puede('finanzas');
  const cat = dir ? catalogoCostes(api.estado.config) : {};
  const caja = h('.cotizador');
  const E = {
    catastro: null, techo: null, m2: cli ? num(cli.m2) : 0, anyo: cli ? num(cli.anyo) : 0, plantas: 2,
    personas: cli ? num(cli.personas) || 4 : 4, luzMes: cli ? num(cli.gasto_luz_mes) || 120 : 120,
    combustible: cli ? num(cli.gasto_combustible) || 2000 : 2000,
    suelo: false, quiereFv: true, quiereAero: true, panel: 625, nPan: 0, aero: 0, baterias: 0, cargador: false,
    deposGrande: false, distancia: false, trifasico: false, margenObj: null
  };

  const entrada = h('input#cotdir', {type: 'text', placeholder: 'Calle, número, municipio',
    valor: cli ? [txt(cli.direccion), txt(cli.municipio)].filter(Boolean).join(', ') : ''});
  const bBuscar = h('button.btn.lima', {type: 'button'}, 'Cotizar esta casa');
  const estado = h('p.nota.cot-estado', 'Escribe la dirección: cojo los m², el año y el tejado del Catastro.');
  const datosCasa = h('.cot-datos');
  const cuerpo = h('.cot-cuerpo');

  const numero = (val, f, idEl, extra = {}) => { const i = h('input', {type: 'number', id: idEl, ...extra}); i.value = val;
    i.addEventListener('input', () => { f(num(i.value)); pinta(); }); return i; };
  const casilla = (val, f, idEl) => { const i = h('input', {type: 'checkbox', id: idEl}); i.checked = !!val;
    i.addEventListener('change', () => { f(i.checked); pinta(); }); return i; };
  const campo = (et, ctl) => h('label.cot-campo', h('span', et), ctl);
  const chk = (ctl, et) => h('label.cot-chk', ctl, et);

  poner(caja, h('style', CSS),
    h('.cot-cab', h('div', h('h2', 'Cotizador'), h('p.nota', cli ? txt(cli.nombre) : 'Precio a partir de la dirección y del Catastro')),
      h('.cot-buscar', entrada, bBuscar)),
    estado, datosCasa, cuerpo);

  async function buscar() {
    const q = txt(entrada.value); if (!q) { estado.textContent = 'Escribe una dirección.'; return; }
    bBuscar.disabled = true; estado.textContent = 'Buscando en el Catastro…';
    try {
      let lat, lon;
      const co = cli ? txt(cli.coordenadas).split(',').map(Number) : [];
      if (co.length === 2 && co.every(isFinite) && co[0]) [lat, lon] = co; else ({lat, lon} = await geocodificar(q));
      const [x0, y0] = utm30(lat, lon);
      const [ficha, partes] = await Promise.all([api.catastro({lat, lon}).catch(() => null), edificiosCatastro(x0, y0).catch(() => [])]);
      E.catastro = ficha && ficha.ok ? ficha : null;
      if (E.catastro) { E.m2 = num(E.catastro.m2) || E.m2; E.anyo = num(E.catastro.anyo) || E.anyo; }
      // tejado: volúmenes de la parcela unidos al punto
      const conPl = partes.filter(p => p.plantas > 0);
      const casa = conPl.find(p => dentro([0, 0], p.ext)) || conPl.sort((a, b) =>
        Math.min(...a.ext.map(q => q[0] ** 2 + q[1] ** 2)) - Math.min(...b.ext.map(q => q[0] ** 2 + q[1] ** 2)))[0];
      if (casa) {
        const cerca = (a, b) => a.ext.some(p => b.ext.some(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < 0.5));
        const mismas = [casa]; const pend = conPl.filter(p => p !== casa && p.rc === casa.rc);
        for (let i = 0; i < mismas.length; i++) for (let j = pend.length - 1; j >= 0; j--) if (cerca(mismas[i], pend[j])) mismas.push(pend.splice(j, 1)[0]);
        const planta = mismas.reduce((s, p) => s + area(p.ext), 0);
        const r = rectanguloMinimo(mismas.flatMap(p => p.ext));
        // los dos faldones de un tejado a 2 aguas sobre el lado largo; el mejor orientado
        const azA = Math.round(Math.atan2(Math.sin(r.ang), -Math.cos(r.ang)) * 180 / Math.PI); // normal de un faldón (0 = sur, + oeste)
        const norm = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };
        const caras = [norm(azA), norm(azA + 180)].sort((a, b) => Math.abs(a) - Math.abs(b));
        E.plantas = Math.max(1, Math.round(mismas.reduce((s, p) => s + area(p.ext) * Math.min(p.plantas, 3), 0) / planta));
        const faldon = (r.largo * r.ancho / 2) / Math.cos(30 * Math.PI / 180);
        E.techo = {planta, largo: r.largo, ancho: r.ancho, az: caras[0], faldon, rc: casa.rc};
        if (!E.m2) E.m2 = Math.round(planta * E.plantas);
      }
      if (!E.m2) throw new Error('El Catastro no da superficie en ese punto. Mete los m² a mano.');
      recomendar();
      estado.textContent = E.catastro ? `Catastro: ref. ${E.catastro.rc} · ${txt(E.catastro.uso) || 'uso sin indicar'}` : 'Datos del tejado del Catastro (sin ficha de inmueble).';
    } catch (e) { estado.textContent = e.message || 'No se ha podido consultar el Catastro.'; }
    finally { bBuscar.disabled = false; pinta(); }
  }
  bBuscar.addEventListener('click', buscar);
  entrada.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

  /** Equipo recomendado según la casa y el consumo. */
  function recomendar() {
    E.aero = aeroKw(E.m2, E.anyo, E.plantas);
    if (E.aero === 22) E.trifasico = true;
    const pan = PANELES.find(p => p.w === E.panel);
    const caben = E.techo ? Math.floor(E.techo.faldon * 0.72 / pan.m2) : 24;
    const consumoKwh = E.luzMes / 0.2 * 12 + (E.quiereAero ? E.m2 * 35 : 0);      // luz actual + lo que gastará la aerotermia
    const kwpNecesario = consumoKwh / 1550;
    E.nPan = Math.max(8, Math.min(caben, Math.ceil(kwpNecesario * 1000 / pan.w / 2) * 2));
    E.margenObj = null;
  }

  function cuenta() {
    const T = tarifas(), pan = PANELES.find(p => p.w === E.panel);
    const n = E.quiereFv ? E.nPan : 0, kwp = n * pan.w / 1000;
    const lineas = [];
    if (n) lineas.push({k: 'fv', concepto: `Fotovoltaica ${n} × ${pan.n} (${kwp.toLocaleString('es-ES', {maximumFractionDigits: 2})} kWp)`, precio: precioFv(n, T)});
    if (E.quiereFv && E.baterias) lineas.push({k: 'bat', concepto: `Baterías ${E.baterias} × 5,8 kWh`, precio: E.baterias * T.bateria});
    if (E.cargador) lineas.push({k: 'carg', concepto: 'Cargador de vehículo eléctrico', precio: T.cargador});
    if (E.quiereAero) {
      lineas.push({k: 'aero', concepto: `Aerotermia Domusa ${E.aero} kW ${E.aero >= 16 && E.trifasico ? 'trifásica' : 'monofásica'} · ACS ${E.personas > 5 ? 300 : 200} L · inercia ${E.suelo || E.m2 > 400 ? 200 : 100} L`, precio: T.aero[E.aero]});
      if (E.deposGrande) lineas.push({k: 'sup1', concepto: 'Suplemento depósitos mayores', precio: T.suplemento});
      if (E.distancia) lineas.push({k: 'sup2', concepto: 'Suplemento distancias (caldera / unidad exterior)', precio: T.suplemento});
    }
    const pvp = lineas.reduce((s, l) => s + l.precio, 0);
    // operación "de mentira" para el catálogo de costes (mismas reglas que Materiales y costes)
    const op = {tipo: n && E.quiereAero ? 'fv_aero' : n ? 'fv' : E.quiereAero ? 'aero' : '', paneles_num: n, panel_wp: pan.w,
      inversor_modelo: E.trifasico ? 'X3' : 'X1', inversor_kw: kwp > 6 ? 10 : 6, bateria_kwh: E.quiereFv ? E.baterias * 5.8 : 0,
      cargador_modelo: E.cargador ? 'cargador' : '', aero_kw: E.quiereAero ? E.aero : 0, aero_modelo: E.quiereAero ? 'Domusa ' + E.aero : '',
      deposito_acs: E.quiereAero ? (E.personas > 5 ? 300 : 200) : 0, deposito_inercia: E.quiereAero ? (E.suelo || E.m2 > 400 ? 200 : 100) : 0, tejado: ''};
    const mat = dir ? materialesDe(op, cat) : null;
    // ayudas y ahorro orientativos
    const kwh = kwp * 1650 * factor(30, E.techo ? E.techo.az : 0);
    const ahorroFv = kwh * (0.55 * 0.17 + 0.45 * 0.06);
    const ahorroAero = E.quiereAero ? E.combustible * 0.6 : 0;
    return {T, lineas, pvp, op, mat, kwp, kwh, ahorro: ahorroFv + ahorroAero, n, pan};
  }

  function pinta() {
    if (!E.m2) { poner(cuerpo, null); poner(datosCasa, null); return; }
    const c = cuenta(), T = c.T;
    poner(datosCasa, h('.cot-casa',
      dato('m² construidos', E.m2.toLocaleString('es-ES'), 'Catastro'), dato('Año', E.anyo || '—', E.anyo && E.anyo < 1980 ? 'poco aislamiento' : ''),
      dato('Plantas', E.plantas), dato('Planta del tejado', E.techo ? Math.round(E.techo.planta) + ' m²' : '—', E.techo ? `faldón ≈${Math.round(E.techo.faldon)} m²` : ''),
      dato('Mejor faldón', E.techo ? nombreAz(E.techo.az) : '—', E.techo ? (E.techo.az > 0 ? '+' : '') + E.techo.az + '°' : '')));

    const izq = h('.cot-col',
      h('h4', 'Casa y consumo'),
      h('.cot-fila', campo('m² construidos', numero(E.m2, v => { E.m2 = v; }, 'cotm2')), campo('Año', numero(E.anyo, v => { E.anyo = v; }, 'cotanyo'))),
      h('.cot-fila', campo('Personas', numero(E.personas, v => { E.personas = v; }, 'cotper')), campo('Luz (€/mes)', numero(E.luzMes, v => { E.luzMes = v; }, 'cotluz'))),
      campo('Gas / gasóleo (€/año)', numero(E.combustible, v => { E.combustible = v; }, 'cotcomb')),
      chk(casilla(E.suelo, v => { E.suelo = v; }, 'cotsuelo'), 'Suelo radiante'),
      chk(casilla(E.trifasico, v => { E.trifasico = v; }, 'cottri'), 'Suministro trifásico'),
      h('button.btn.mini', {type: 'button', onclick: () => { recomendar(); pinta(); }}, 'Recalcular equipo recomendado'),
      h('h4', 'Fotovoltaica'),
      chk(casilla(E.quiereFv, v => { E.quiereFv = v; }, 'cotfv'), 'Incluir fotovoltaica'),
      h('.cot-fila', campo('Panel', (() => { const s = h('select#cotpanel', PANELES.map(p => h('option', {value: p.w}, p.n))); s.value = E.panel;
        s.addEventListener('change', () => { E.panel = +s.value; pinta(); }); return s; })()),
        campo('Nº paneles', numero(E.nPan, v => { E.nPan = Math.max(0, Math.round(v)); }, 'cotnpan', {min: 0, max: 80, step: 2}))),
      h('.cot-fila', campo('Baterías 5,8 kWh', numero(E.baterias, v => { E.baterias = Math.max(0, Math.round(v)); }, 'cotbat', {min: 0, max: 6})),
        chk(casilla(E.cargador, v => { E.cargador = v; }, 'cotcarg'), 'Cargador VE')),
      h('h4', 'Aerotermia'),
      chk(casilla(E.quiereAero, v => { E.quiereAero = v; }, 'cotaero'), 'Incluir aerotermia'),
      campo('Potencia', (() => { const s = h('select#cotkw', [12, 16, 19, 22].map(k => h('option', {value: k}, k + ' kW' + (k === 22 ? ' (solo trifásica)' : ''))));
        s.value = E.aero; s.addEventListener('change', () => { E.aero = +s.value; if (E.aero === 22) E.trifasico = true; pinta(); }); return s; })()),
      chk(casilla(E.deposGrande, v => { E.deposGrande = v; }, 'cotdep'), 'Depósitos mayores (+1.000 €)'),
      chk(casilla(E.distancia, v => { E.distancia = v; }, 'cotdist'), 'Distancias largas (+1.000 €)'));

    const precioFinal = dir && E.margenObj !== null && c.mat && c.mat.base ? c.mat.base / (1 - E.margenObj) * IVA : c.pvp;
    const base = precioFinal / IVA;
    const ayudaIrpf = Math.min(precioFinal, 15000) * 0.6;
    const neto = precioFinal - ayudaIrpf;
    const cuota = precioFinal * COEF_10;
    const der = h('.cot-col',
      h('h4', 'Presupuesto (tarifa, IVA incluido)'),
      h('table.cot-tabla', c.lineas.map(l => h('tr', h('td', l.concepto), h('td.num', eur(l.precio)))),
        h('tr.total', h('td', E.margenObj !== null && dir ? 'Total con el margen elegido' : 'Total'), h('td.num', eur(precioFinal)))),
      h('.cot-kpis',
        k('Cuota a 10 años', eur(cuota) + '/mes', 'amortización anticipada a coste 0'),
        k('Deducción IRPF 60 %', eur(ayudaIrpf), 'base máx. 15.000 €'),
        k('Coste tras ayudas', eur(neto), 'CAE aparte (aproximado)'),
        k('Ahorro estimado', eur(c.ahorro) + '/año', c.kwp ? `${Math.round(c.kwh).toLocaleString('es-ES')} kWh/año FV` : ''),
        k('Retorno', c.ahorro ? (neto / c.ahorro).toLocaleString('es-ES', {maximumFractionDigits: 1}) + ' años' : '—', 'después de ayudas')),
      h('.cot-acciones', h('button.btn', {type: 'button', onclick: () => copiar(c, precioFinal, cuota, ayudaIrpf)}, 'Copiar resumen'),
        cli ? h('button.btn', {type: 'button', onclick: () => { location.hash = '#visor/' + cli.id; }}, '⌂ Ver en 3D') : null),
      h('p.nota', 'Precios de la tarifa vigente. Producción y ahorro orientativos.'),
      dir ? panelDireccion(c, precioFinal, base) : null);
    poner(cuerpo, izq, der);
  }

  /** Solo dirección: coste, margen y horquilla. */
  function panelDireccion(c, precioFinal, base) {
    const T = c.T, coste = c.mat ? c.mat.base : 0;
    if (!coste) return h('.cot-dir', h('h4', 'Margen (solo dirección)'), h('p.nota', 'No hay catálogo de costes cargado: complétalo en Materiales y costes.'));
    const margenTarifa = (c.pvp / IVA - coste) / (c.pvp / IVA);
    const margenAhora = (base - coste) / base;
    const estadoM = m => m < T.margenMin ? 'mal' : m > T.margenMax ? 'aviso' : 'bien';
    const minI = h('input#cotmmin', {type: 'number', step: 1, min: 0, max: 80}); minI.value = Math.round(T.margenMin * 100);
    const maxI = h('input#cotmmax', {type: 'number', step: 1, min: 0, max: 90}); maxI.value = Math.round(T.margenMax * 100);
    const rango = h('input#cotmarg', {type: 'range', min: 15, max: 60, step: 0.5});
    rango.value = Math.round((E.margenObj !== null ? E.margenObj : margenTarifa) * 1000) / 10;
    rango.addEventListener('input', () => { E.margenObj = +rango.value / 100; pinta(); });
    const precioCon = m => coste / (1 - m) * IVA;
    return h('.cot-dir',
      h('h4', 'Margen (solo dirección)'),
      h('table.cot-tabla',
        h('tr', h('td', 'Coste estimado (material, montaje y legalización, sin IVA)'), h('td.num', eur(coste))),
        h('tr', h('td', 'Margen con la tarifa'), h('td.num', h('span.etiqueta.' + estadoM(margenTarifa), pct(margenTarifa)))),
        h('tr', h('td', 'Margen del precio de arriba'), h('td.num', h('span.etiqueta.' + estadoM(margenAhora), pct(margenAhora)))),
        h('tr', h('td', `Precio al ${pct(T.margenMin)} (mínimo)`), h('td.num', eur(precioCon(T.margenMin)))),
        h('tr', h('td', `Precio al ${pct(T.margenMax)} (máximo)`), h('td.num', eur(precioCon(T.margenMax))))),
      c.mat.faltan.length ? h('p.nota', 'Sin precio en el catálogo: ' + c.mat.faltan.join(', ')) : null,
      h('label.cot-campo', h('span', 'Probar otro margen: ', h('b', pct(E.margenObj !== null ? E.margenObj : margenTarifa))), rango),
      h('.cot-fila', campo('Margen mínimo (%)', minI), campo('Margen máximo (%)', maxI)),
      h('.cot-acciones',
        h('button.btn', {type: 'button', onclick: async () => {
          const a = num(minI.value), b = num(maxI.value);
          if (!(a > 0 && b > a)) { aviso('El máximo tiene que ser mayor que el mínimo.', 'error'); return; }
          try { const r = await api.guardarConfig({margen_min_pct: a, margen_max_pct: b}); api.estado.config = r.config || api.estado.config;
            aviso(`Horquilla guardada: del ${a} % al ${b} %.`); pinta(); } catch (e) { aviso(e.message, 'error'); }
        }}, 'Guardar horquilla'),
        E.margenObj !== null ? h('button.btn.lima', {type: 'button', onclick: () => aplicarTarifa(c, precioFinal)}, 'Usar este precio como tarifa') : null),
      h('p.nota', 'La horquilla y los costes no los ven comerciales ni captadores. «Usar este precio como tarifa» cambia el precio del tramo para las propuestas futuras.'));
  }

  async function aplicarTarifa(c, precioFinal) {
    // reparte el cambio entre los tramos de esta propuesta en proporción a su peso
    const cambios = {}, T = c.T, factorP = precioFinal / c.pvp;
    c.lineas.forEach(l => {
      if (l.k === 'fv') cambios[claveFv(c.n)] = Math.round(precioFv(c.n, T) * factorP / 10) * 10;
      if (l.k === 'aero') cambios['precio_aero_' + E.aero] = Math.round(T.aero[E.aero] * factorP / 10) * 10;
      if (l.k === 'bat') cambios.precio_bateria_modulo = Math.round(T.bateria * factorP / 10) * 10;
      if (l.k === 'carg') cambios.precio_cargador = Math.round(T.cargador * factorP / 10) * 10;
    });
    const texto = Object.entries(cambios).map(([k, v]) => `${k.replace('precio_', '').replace(/_/g, ' ')}: ${eur(v)}`).join(' · ');
    const {confirmar} = await import('../ui.js');
    if (!await confirmar('Nuevas tarifas para las propuestas futuras: ' + texto, {titulo: 'Cambiar tarifa', botón: 'Sí, cambiar', peligro: false})) return;
    try { const r = await api.guardarConfig(cambios); api.estado.config = r.config || api.estado.config; E.margenObj = null; aviso('Tarifa actualizada.'); pinta(); }
    catch (e) { aviso(e.message, 'error'); }
  }

  async function copiar(c, precio, cuota, irpf) {
    const t = [`Cotización · ${txt(entrada.value)}`, ...c.lineas.map(l => `- ${l.concepto}: ${eur(l.precio)}`),
      `Total (IVA incluido): ${eur(precio)}`, `Cuota a 10 años: ${eur(cuota)}/mes (amortización anticipada a coste 0)`,
      `Deducción IRPF 60 %: ${eur(irpf)}`].join('\n');
    try { await navigator.clipboard.writeText(t); aviso('Resumen copiado.'); } catch (e) { aviso('No se ha podido copiar.', 'error'); }
  }

  const dato = (et, v, pie) => h('.cot-d', h('span', et), h('b', String(v)), pie ? h('small', pie) : null);
  const k = (et, v, pie) => h('.cot-k', h('span', et), h('b', v), pie ? h('small', pie) : null);
  if (cli && txt(entrada.value)) buscar();
  return caja;
}

const CSS = `
.cotizador{display:flex;flex-direction:column;gap:12px}
.cot-cab{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.cot-cab h2{margin:0}
.cot-buscar{display:flex;gap:8px;flex:1 1 360px;max-width:620px}
.cot-buscar input{flex:1;min-width:0}
.cot-casa{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
@media (max-width:800px){.cot-casa{grid-template-columns:repeat(2,minmax(0,1fr))}}
.cot-d,.cot-k{background:var(--papel,#fff);border:1px solid var(--linea,#e2e6e0);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;min-width:0}
.cot-d span,.cot-k span{font-size:11.5px;color:var(--tx-2,#5b6159)}
.cot-d b,.cot-k b{font-size:19px;font-variant-numeric:tabular-nums}
.cot-d small,.cot-k small{font-size:11px;color:var(--tx-2,#5b6159)}
.cot-cuerpo{display:grid;grid-template-columns:340px minmax(0,1fr);gap:12px;align-items:start}
@media (max-width:980px){.cot-cuerpo{grid-template-columns:1fr}}
.cot-col{background:var(--papel,#fff);border:1px solid var(--linea,#e2e6e0);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px;min-width:0}
.cot-col h4,.cot-dir h4{margin:6px 0 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--lima-osc,#7fb800)}
.cot-campo{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--tx-2,#5b6159)}
.cot-campo input[type=range]{width:100%;accent-color:var(--lima-osc,#7fb800)}
.cot-fila{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end}
.cotizador label.cot-chk{display:flex;flex-direction:row;align-items:center;gap:7px;font-size:13px;color:inherit;margin:0}
.cotizador label.cot-chk input{width:auto;flex:none;margin:0}
.cot-tabla{width:100%;border-collapse:collapse;font-size:13.5px}
.cot-tabla td{padding:6px 4px;border-bottom:1px solid var(--linea,#e2e6e0);vertical-align:top}
.cot-tabla td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.cot-tabla tr.total td{font-weight:700;font-size:15px;border-bottom:0}
.cot-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.cot-acciones{display:flex;gap:8px;flex-wrap:wrap}
.cot-dir{margin-top:6px;border-top:2px dashed var(--linea,#e2e6e0);padding-top:10px;display:flex;flex-direction:column;gap:9px}
`;
