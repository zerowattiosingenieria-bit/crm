/* materiales.js — lista de materiales a pedir de una instalación y su coste estimado.
 *
 * 05/11/2026 (Nando): «a los directivos nos aparezca en el CRM una ficha de los
 * materiales que tenemos que pedir para un proyecto, con una estimación de los
 * costes de cada pieza», sacados de las facturas de proveedores (SeisSolar,
 * PolarStock, Sumsol…), de los instaladores (Rober Gas, Greenfield, Climassine)
 * y de las legalizaciones.
 *
 * Aquí NO hay ningún precio: el catálogo de costes vive en CONFIG
 * («catalogo_costes») y el servidor solo lo manda a quien tiene las finanzas
 * abiertas. Este archivo solo sabe qué piezas lleva cada instalación.
 * Todos los costes del catálogo van SIN IVA (como las facturas de proveedor);
 * la ficha enseña también el total con IVA.
 */

import {txt, num, normal} from './util.js';

/** Catálogo de costes indexado por clave ({} si este usuario no lo recibe). */
export function catalogoCostes(config) {
  const crudo = (config || {}).catalogo_costes;
  if (!crudo) return {};
  let lista = [];
  try { lista = typeof crudo === 'string' ? JSON.parse(crudo) : crudo; } catch (e) { return {}; }
  const o = {};
  (Array.isArray(lista) ? lista : []).forEach(x => { if (x && x.clave) o[x.clave] = x; });
  return o;
}

const contiene = (t, ...pal) => pal.some(p => normal(t).includes(normal(p)));

/** Qué bomba de calor es, según los kW y el modelo apuntados. */
function claveAero(o) {
  const m = txt(o.aero_modelo);
  const kw = num(o.aero_kw);
  if (contiene(m, 'saunier')) return 'aero_saunier_15';
  if (contiene(m, 'panasonic')) return 'aero_panasonic';
  if (kw >= 21 || contiene(m, '22')) return 'aero_22';
  if (kw >= 18 || contiene(m, '19')) return 'aero_19';
  return 'aero_16';
}

/** ¿Es trifásica la instalación? Inversor X3/trifásico o aerotermia de 22 kW (solo existe trifásica). */
export function esTrifasica(o) {
  const inv = txt(o.inversor_modelo);
  if (contiene(inv, 'x3', 'trif', 'tri ')) return true;
  if (contiene(inv, 'x1', 'monof')) return false;
  return claveAero(o) === 'aero_22';
}

function claveInversor(o) {
  const inv = txt(o.inversor_modelo);
  const kw = num(o.inversor_kw);
  if (contiene(inv, 'deye')) return 'inv_deye_10';
  if (esTrifasica(o)) return kw && kw <= 6 ? 'inv_tri_5' : 'inv_tri_10';
  return 'inv_mono_10';
}

const lleva = (o, que) => {
  const t = normal(o.tipo);
  if (que === 'fv') return num(o.paneles_num) > 0 || t === 'fv' || t === 'fv_aero';
  if (que === 'aero') return num(o.aero_kw) > 0 || txt(o.aero_modelo) !== '' || t === 'aero' || t === 'fv_aero';
  if (que === 'bateria') return num(o.bateria_kwh) > 0 || t === 'bateria';
  if (que === 'cargador') return txt(o.cargador_modelo) !== '' || num(o.importe_cargador) > 0 || t === 'cargador';
  return false;
};

/**
 * Piezas y trabajos de una instalación con su coste estimado (sin IVA).
 * Devuelve {lineas:[{grupo, clave, concepto, cantidad, unidad, unitario, importe, iva_pct, falta, nota}],
 *           base, iva, total, faltan}
 * «falta» = la pieza va, pero no hay precio en el catálogo.
 */
export function materialesDe(o, cat) {
  const L = [];
  const pon = (grupo, clave, cantidad, extra = {}) => {
    if (!(cantidad > 0)) return;
    const c = cat[clave] || {};
    const unitario = extra.unitario !== undefined ? extra.unitario : num(c.coste);
    L.push({
      grupo, clave, cantidad,
      concepto: extra.concepto || c.concepto || clave,
      unidad: extra.unidad || c.unidad || 'ud',
      unitario,
      importe: Math.round(unitario * cantidad * 100) / 100,
      iva_pct: c.iva_pct === 0 || c.iva_pct === '0' ? 0 : (num(c.iva_pct) || 21),
      falta: !c.clave && extra.unitario === undefined,
      nota: extra.nota || c.nota || ''
    });
  };

  /* ---------- fotovoltaica ---------- */
  if (lleva(o, 'fv')) {
    const n = num(o.paneles_num);
    const wp = num(o.panel_wp);
    if (n) {
      if (wp && cat.fv_wp && !(wp >= 615 && wp <= 640 && cat.fv_modulo_630)) {
        pon('Fotovoltaica', 'fv_wp', n, {concepto: 'Módulo fotovoltaico ' + wp + ' W' + (txt(o.panel_modelo) ? ' · ' + o.panel_modelo : ''),
          unitario: Math.round(num(cat.fv_wp.coste) * wp * 100) / 100, unidad: 'ud'});
      } else {
        pon('Fotovoltaica', 'fv_modulo_630', n, txt(o.panel_modelo) ? {concepto: 'Módulo ' + o.panel_modelo + (wp && !txt(o.panel_modelo).includes(String(wp)) ? ' ' + wp + ' W' : '')} : {});
      }
      const plana = contiene(o.tejado, 'plan', 'suelo', 'inclin');
      pon('Fotovoltaica', plana ? 'estructura_inclinada_modulo' : 'estructura_modulo', n);
      pon('Fotovoltaica', 'fv_optimizador', Math.ceil(n / 3), {nota: 'Estimado: un tercio de los módulos (según sombras)'});
    }
    pon('Fotovoltaica', claveInversor(o), 1);
    if (esTrifasica(o)) pon('Fotovoltaica', 'meter_tri', 1);
    pon('Fotovoltaica', 'fv_pequeno_material', 1);
    pon('Mano de obra', 'mo_fv_montaje', 1);
    pon('Mano de obra', 'transporte_material', 1);
    pon('Legalización', 'legal_fv', 1);
  }

  /* ---------- baterías ---------- */
  if (lleva(o, 'bateria')) {
    const kwh = num(o.bateria_kwh) || 5.8;
    const modulos = Math.max(1, Math.round(kwh / 5.8));
    pon('Baterías', 'bat_master', 1);
    pon('Baterías', 'bat_esclava', modulos - 1);
  }

  /* ---------- cargador ---------- */
  if (lleva(o, 'cargador')) {
    pon('Cargador', esTrifasica(o) || contiene(o.cargador_modelo, '22', 'x3') ? 'cargador_tri' : 'cargador_mono', 1);
    pon('Mano de obra', 'mo_cargador', 1);
  }

  /* ---------- aerotermia ---------- */
  if (lleva(o, 'aero')) {
    const clave = claveAero(o);
    pon('Aerotermia', clave, 1);
    const acs = num(o.deposito_acs);
    const inercia = num(o.deposito_inercia);
    const trio = contiene(o.aero_modelo, 'trio', 'fusion', 'fusión');
    if (trio) pon('Aerotermia', 'modulo_hidraulico_trio', 1);
    else {
      if (acs) pon('Aerotermia', acs <= 160 ? 'acs_150' : (acs <= 250 ? 'acs_200' : 'acs_300'), 1);
      if (inercia) pon('Aerotermia', inercia <= 120 ? 'inercia_100' : (inercia <= 170 ? 'inercia_150' : 'inercia_200'), 1);
    }
    pon('Aerotermia', 'kit_hidraulico', 1);
    pon('Aerotermia', 'termostato', 1);
    if (clave.startsWith('aero_1') || clave === 'aero_22') pon('Aerotermia', 'easy_connect', 1);
    pon('Mano de obra', 'mo_aero', 1);
    pon('Mano de obra', 'mo_aero_electricidad', 1);
    pon('Legalización', 'cite', 1);
    pon('Legalización', 'cite_tasas', 1);
    pon('Legalización', 'cee', 2, {nota: 'Certificado energético inicial y final'});
  }

  const base = Math.round(L.reduce((s, x) => s + x.importe, 0) * 100) / 100;
  const iva = Math.round(L.reduce((s, x) => s + x.importe * x.iva_pct / 100, 0) * 100) / 100;
  return {lineas: L, base, iva, total: Math.round((base + iva) * 100) / 100,
          faltan: L.filter(x => x.falta).map(x => x.concepto)};
}

/** Los gastos de la instalación separados en reales (facturas) y estimados. */
export function costeApuntado(gastos) {
  const real = gastos.filter(g => normal(g.estado_pago) !== 'estimado');
  const est = gastos.filter(g => normal(g.estado_pago) === 'estimado');
  const suma = xs => Math.round(xs.reduce((s, g) => s + num(g.importe), 0) * 100) / 100;
  return {real: suma(real), estimado: suma(est), nReal: real.length, nEstimado: est.length};
}
